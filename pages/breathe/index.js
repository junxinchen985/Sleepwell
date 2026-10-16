const storage = require('../../services/storage');
const { WORLDS, RHYTHMS } = require('../../utils/constants');
const navigation = require('../../utils/navigation');
const { PHASES, createInitialState, transition } = require('../../utils/breath-machine');
const { getBreathView } = require('../../utils/breath-view');
const { getNavigationMetrics } = require('../../utils/layout');
const { fitStarfield } = require('../../utils/starfield-layout');

const CYCLE_OPTIONS = [
  { value: 0, name: '自由呼吸' },
  { value: 3, name: '3 次' },
  { value: 6, name: '6 次' },
  { value: 10, name: '10 次' }
];

const SOUND_OPTIONS = [
  { id: 'breeze', name: '微风' },
  { id: 'rain', name: '雨声' },
  { id: 'lake', name: '湖水' },
  { id: 'white', name: '白噪音' }
];

Page({
  data: {
    worlds: WORLDS,
    rhythms: RHYTHMS,
    cycleOptions: CYCLE_OPTIONS,
    soundOptions: SOUND_OPTIONS,
    settings: storage.getSettings(),
    currentWorld: WORLDS[0],
    currentRhythm: RHYTHMS[0],
    currentCycle: CYCLE_OPTIONS[0],
    currentSound: SOUND_OPTIONS[0],
    phase: PHASES.IDLE,
    mainPrompt: '按住，慢慢吸气',
    subPrompt: '4秒后，跟随提示自然呼吸',
    cycles: 0,
    cycleDots: [0, 1, 2, 3, 4, 5],
    showSettings: false,
    showWorldPicker: false,
    showBodyNudge: false,
    showCompletion: false,
    showOutcome: false,
    firstHint: true,
    outcome: null,
    countdown: 0,
    phaseLabel: '',
    nav: getNavigationMetrics(),
    starfieldStyle: '',
    showRecords: false,
    previewWorld: '',
    recentSessions: [],
    totalBreaths: 0,
    sevenDay: { activeDays: 0, completedSessions: 0, outcomes: { relieved: 0, same: 0, tense: 0 } }
  },

  onLoad() {
    this.updateStarfieldLayout();
    this.sessionId = `breath-${Date.now()}`;
    this.hasNudged = false;
    this.countdownTimer = null;
    this.machine = createInitialState({ targetCycles: this.data.settings.targetCycles, sessionId: this.sessionId });
    this.syncSettings();
  },

  onShow() {
    this.updateStarfieldLayout();
    this.setData({ nav: getNavigationMetrics() });
    this.syncSettings();
    wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
  },

  onResize(event) {
    this.updateStarfieldLayout(event.size);
  },

  updateStarfieldLayout(size) {
    const info = size || (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync());
    this.setData({ starfieldStyle: fitStarfield(info.windowWidth, info.windowHeight) });
  },

  onShareAppMessage() {
    return {
      title: '呼吸空间（SleepWell）',
      path: '/pages/breathe/index'
    };
  },

  onShareTimeline() {
    return {
      title: '呼吸空间（SleepWell）',
      query: ''
    };
  },

  onHide() {
    this.interruptBreathing();
    this.persistSession();
  },

  onUnload() {
    this.clearTimers();
    this.persistSession();
  },

  syncSettings() {
    const settings = storage.getSettings();
    const currentWorld = WORLDS.find((item) => item.id === settings.world) || WORLDS[0];
    const currentRhythm = RHYTHMS.find((item) => item.id === settings.rhythm) || RHYTHMS[0];
    const currentCycle = CYCLE_OPTIONS.find((item) => item.value === settings.targetCycles) || CYCLE_OPTIONS[0];
    const currentSound = SOUND_OPTIONS.find((item) => item.id === settings.sound) || SOUND_OPTIONS[0];
    const cycleDots = Array.from({ length: settings.targetCycles > 0 ? settings.targetCycles : 6 }, (_, index) => index);
    this.setData({ settings, currentWorld, currentRhythm, currentCycle, currentSound, cycleDots, firstHint: !settings.onboardingSeen });
    if (this.machine && this.machine.targetCycles !== settings.targetCycles) this.dispatch({ type: 'SET_TARGET', targetCycles: settings.targetCycles, now: Date.now() });
  },

  clearTimers() {
    clearTimeout(this.inhaleHintTimer);
    clearTimeout(this.exhaleTimer);
    clearTimeout(this.inhaleTimer);
    clearTimeout(this.holdTimer);
    clearTimeout(this.nudgeTimer);
    clearTimeout(this.completionTimer);
    clearInterval(this.countdownTimer);
  },

  applyMachine(result) {
    this.machine = result.state;
    const phase = result.state.phase;
    const view = getBreathView(result.state, Date.now());
    const updates = { phase, cycles: result.state.cycles, countdown: view.countdown, phaseLabel: view.phaseLabel };
    if (phase === PHASES.INHALE) Object.assign(updates, { mainPrompt: '缓缓吸气', subPrompt: '感受腹部向外扩张', firstHint: false });
    if (phase === PHASES.HOLD) Object.assign(updates, { mainPrompt: '停留', subPrompt: '让这一口气停留片刻', firstHint: false });
    if (phase === PHASES.HOLD && result.state.readyToRelease) Object.assign(updates, { mainPrompt: '准备好，就慢慢松开', subPrompt: '松开，开始呼气' });
    if (phase === PHASES.EXHALE) Object.assign(updates, { mainPrompt: '呼气', subPrompt: '感受腹部慢慢回落', firstHint: false });
    if (phase === PHASES.IDLE && result.state.cycles === 0) Object.assign(updates, { mainPrompt: '按住，慢慢吸气', subPrompt: '4秒后，跟随提示自然呼吸' });
    if (phase === PHASES.COMPLETED) {
      const naturalCompletion = result.effects.some((effect) => effect.type === 'complete');
      Object.assign(updates, { mainPrompt: '可以停在这里', subPrompt: '给自己一个安静的结束', showCompletion: !naturalCompletion, showOutcome: true });
      if (naturalCompletion) {
        clearTimeout(this.completionTimer);
        this.completionTimer = setTimeout(() => this.setData({ showCompletion: true }), 2000);
      }
    }
    this.setData(updates);
    clearInterval(this.countdownTimer);
    if ([PHASES.INHALE, PHASES.HOLD, PHASES.EXHALE].includes(phase)) this.countdownTimer = setInterval(() => this.refreshCountdown(), 200);
    result.effects.forEach((effect) => {
      if (effect.type === 'cancelExhale') clearTimeout(this.exhaleTimer);
      if (effect.type === 'cancelPhaseTimers') { clearTimeout(this.exhaleTimer); clearTimeout(this.inhaleTimer); clearTimeout(this.holdTimer); }
      if (effect.type === 'scheduleInhale') { clearTimeout(this.inhaleTimer); this.inhaleTimer = setTimeout(() => this.dispatch({ type: 'INHALE_DUE', now: Date.now(), holdMs: this.data.settings.holdSeconds * 1000 }), effect.delayMs); }
      if (effect.type === 'scheduleNextInhale') this.inhaleTimer = setTimeout(() => this.dispatch({ type: 'NEXT_INHALE', now: Date.now(), inhaleMs: this.data.settings.inhaleSeconds * 1000 }), effect.delayMs);
      if (effect.type === 'scheduleHold') this.holdTimer = setTimeout(() => this.dispatch({ type: 'HOLD_DUE', now: Date.now(), exhaleMs: this.data.settings.exhaleSeconds * 1000 }), effect.delayMs);
      if (effect.type === 'phaseHaptic') this.gentleHaptic();
      if (effect.type === 'scheduleExhale') {
        clearTimeout(this.exhaleTimer);
        this.exhaleTimer = setTimeout(() => this.dispatch({ type: 'EXHALE_DUE', now: Date.now() }), Math.max(0, effect.delayMs));
      }
      if (effect.type === 'persist') {
        this.persistSession();
        this.maybeShowFreeNudge();
      }
      if (effect.type === 'complete') this.finishFeedback();
    });
  },

  dispatch(event) { this.applyMachine(transition(this.machine, event)); },
  refreshCountdown() { const view = getBreathView(this.machine, Date.now()); this.setData({ countdown: view.countdown, phaseLabel: view.phaseLabel }); },

  interruptBreathing() {
    if (this.machine && [PHASES.INHALE, PHASES.HOLD, PHASES.EXHALE].includes(this.machine.phase)) this.dispatch({ type: 'INTERRUPT', now: Date.now() });
  },

  handlePressStart() {
    if (this.data.showBodyNudge || this.data.showCompletion) return;
    if (this.data.settings.soundEnabled && !getApp().globalData.audioState.playing) {
      getApp().playSound(this.data.settings.sound, this.data.settings.soundVolume, this.data.settings.soundTimerMinutes);
    }
    this.dispatch({ type: 'PRESS_START', now: Date.now(), inhaleMs: this.data.settings.inhaleSeconds * 1000 });
    if (this.machine.phase === PHASES.INHALE && !this.data.settings.onboardingSeen) {
      const settings = storage.saveSettings(Object.assign({}, this.data.settings, { onboardingSeen: true }));
      this.setData({ settings, firstHint: false });
    }
  },

  handlePressEnd() {
    this.dispatch({ type: 'PRESS_END', now: Date.now() });
  },
  handlePressCancel() { this.handlePressEnd(); },
  stopBreathing() {
    this.dispatch({ type: 'STOP', now: Date.now() });
    this.setData({ showCompletion: true, showOutcome: true });
  },
  finishFeedback() {
    if (this.data.settings.endSoundEnabled && getApp().playCompletionCue) getApp().playCompletionCue();
    this.gentleHaptic();
  },

  maybeShowFreeNudge() {
    if (this.machine.targetCycles === 0 && this.machine.cycles >= 3 && !this.hasNudged) {
      this.hasNudged = true;
      this.nudgeTimer = setTimeout(() => this.setData({ showBodyNudge: true }), 900);
    }
  },

  gentleHaptic() {
    if (!this.data.settings.hapticEnabled || !wx.vibrateShort) return;
    wx.vibrateShort({ type: 'light' });
  },

  persistSession(cycles) {
    const count = typeof cycles === 'number' ? cycles : this.machine.cycles;
    if (!count || this.machine.sessionStartedAt === null) return;
    storage.upsertSession({
      id: this.sessionId,
      startedAt: this.machine.sessionStartedAt,
      endedAt: Date.now(),
      cycles: count,
      world: this.data.settings.world,
      targetCycles: this.machine.targetCycles,
      durationMs: this.machine.durationMs,
      completed: this.machine.phase === PHASES.COMPLETED
    });
  },

  openFocus() {
    wx.navigateTo({ url: '/pages/focus/index' });
  },

  exitMiniProgram() {
    this.interruptBreathing();
    this.persistSession();
    navigation.exitMiniProgram();
  },

  openSettings() {
    this.setData({ showSettings: true });
  },

  closeSettings() {
    this.setData({ showSettings: false });
  },

  noop() {},

  openWorldPicker() {
    this.setData({ showWorldPicker: true, previewWorld: this.data.settings.world });
    this.gentleHaptic();
  },

  openWorldPickerFromSettings() {
    this.setData({
      showSettings: false,
      showWorldPicker: true,
      previewWorld: this.data.settings.world
    });
    this.gentleHaptic();
  },

  closeWorldPicker() {
    this.setData({ showWorldPicker: false, previewWorld: '' });
  },

  previewWorld(event) {
    const world = event.currentTarget.dataset.world;
    if (!world || world === this.data.previewWorld) return;
    this.setData({ previewWorld: world });
    this.gentleHaptic();
  },

  chooseWorld(event) {
    const world = event.currentTarget.dataset.world || this.data.previewWorld;
    if (!this.data.showWorldPicker || !WORLDS.some((item) => item.id === world)) return;
    const settings = storage.saveSettings(Object.assign({}, this.data.settings, { world }));
    const currentWorld = WORLDS.find((item) => item.id === world) || WORLDS[0];
    this.setData({ settings, currentWorld, showWorldPicker: false, previewWorld: '' });
    this.gentleHaptic();
  },

  onRhythmChange(event) {
    const rhythm = RHYTHMS[Number(event.detail.value)];
    if (!rhythm) return;
    const settings = storage.saveSettings(Object.assign({}, this.data.settings, {
      rhythm: rhythm.id,
      inhaleSeconds: rhythm.inhale,
      holdSeconds: rhythm.hold || 0,
      exhaleSeconds: rhythm.exhale
    }));
    this.setData({ settings, currentRhythm: rhythm });
  },

  onCycleChange(event) {
    const currentCycle = CYCLE_OPTIONS[Number(event.detail.value)];
    if (!currentCycle) return;
    const settings = storage.saveSettings(Object.assign({}, this.data.settings, {
      targetCycles: currentCycle.value
    }));
    const cycleDots = Array.from({ length: currentCycle.value > 0 ? currentCycle.value : 6 }, (_, index) => index);
    this.setData({ settings, currentCycle, cycleDots });
    this.dispatch({ type: 'SET_TARGET', targetCycles: currentCycle.value, now: Date.now() });
  },

  onSoundChange(event) {
    const currentSound = SOUND_OPTIONS[Number(event.detail.value)];
    if (!currentSound) return;
    const settings = storage.saveSettings(Object.assign({}, this.data.settings, {
      sound: currentSound.id
    }));
    this.setData({ settings, currentSound });
  },

  onToggleChange(event) {
    const key = event.currentTarget.dataset.key;
    const settings = storage.saveSettings(Object.assign({}, this.data.settings, {
      [key]: event.detail.value
    }));
    this.setData({ settings });
  },

  goBody() {
    this.persistSession();
    this.restartSession(this.data.settings.targetCycles);
    this.setData({ showBodyNudge: false });
    wx.navigateTo({ url: '/pages/body/index' });
  },

  skipBody() {
    this.setData({ showBodyNudge: false });
  },

  selectOutcome(event) {
    const outcome = event.currentTarget.dataset.outcome;
    if (!outcome) return;
    storage.updateSessionOutcome(this.sessionId, outcome);
    this.setData({ outcome, showOutcome: false });
  },

  restartSession(targetCycles) {
    this.sessionId = `breath-${Date.now()}`;
    this.applyMachine(transition(this.machine, { type: 'RESTART', now: Date.now(), targetCycles, sessionId: this.sessionId }));
  },

  continueBreathing() {
    this.restartSession(3);
    this.setData({ showCompletion: false, showOutcome: false, outcome: null, cycles: 0, phase: PHASES.IDLE, mainPrompt: '按住，慢慢吸气', subPrompt: '4秒后，跟随提示自然呼吸' });
  },

  finishQuietly() {
    this.restartSession(this.data.settings.targetCycles);
    this.setData({ showCompletion: false, showOutcome: false, outcome: null });
  },

  openRecords() {
    wx.reLaunch({ url: '/pages/record/index' });
  },

  goAgent() { wx.reLaunch({ url: '/pages/agent/index' }); },

  closeRecords() {
    this.setData({ showRecords: false });
  },

  formatTime(timestamp) {
    const date = new Date(timestamp);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${month}.${day} ${hour}:${minute}`;
  },

  goPage(event) {
    this.setData({ showRecords: false });
    wx.navigateTo({ url: event.currentTarget.dataset.url });
  }
});
