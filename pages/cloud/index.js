const storage = require('../../services/storage');
const navigation = require('../../utils/navigation');
const { getNavigationMetrics } = require('../../utils/layout');
const chromeActions = require('../../utils/immersive-chrome-actions');
const {
  PHASES,
  PHASE_LABELS,
  DEFAULT_SUBTITLE,
  COMPLETION_SUBTITLE,
  RHYTHMS,
  TARGET_CYCLE_OPTIONS,
  resolveRhythm,
  resolveTargetCycles,
  phaseDurationMs,
  nextPhase,
  phasePrompt,
  themeVars,
  buildSettingsRows
} = require('../../utils/cloud-breath');

const CLOUD_IMAGES = [
  '/assets/cloud/cloud_1.jpg',
  '/assets/cloud/cloud_2.jpg',
  '/assets/cloud/cloud_3.jpg'
];

const CLOCK_INTERVAL_MS = 100;
const COMPLETION_HOLD_MS = 2400;

function clampVolume(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function cloudStyle(opacity, scale, translateY, durationMs) {
  const duration = Math.max(0, Number(durationMs) || 0);
  return [
    `opacity:${opacity};`,
    `transform:translate3d(0,${translateY},0) scale(${scale});`,
    `transition:opacity ${duration}ms ease,transform ${duration}ms ease;`
  ].join('');
}

function buildCloudStyles(phase, isRunning, rhythm) {
  const source = rhythm || {};
  const inhaleMs = Math.max(1000, Number(source.inhaleMs) || 4000);
  const exhaleMs = Math.max(1000, Number(source.exhaleMs) || 8000);
  if (!isRunning || phase === PHASES.IDLE) {
    return {
      cloudOneStyle: cloudStyle(1, 1.02, '0%', 700),
      cloudTwoStyle: cloudStyle(0, 0.96, '1%', 700),
      cloudThreeStyle: cloudStyle(0, 1.03, '0%', 700)
    };
  }
  if (phase === PHASES.INHALE) {
    return {
      cloudOneStyle: cloudStyle(0.34, 1.075, '-0.8%', inhaleMs),
      cloudTwoStyle: cloudStyle(0.95, 1.08, '-1.2%', inhaleMs),
      cloudThreeStyle: cloudStyle(0, 1.04, '0%', inhaleMs)
    };
  }
  if (phase === PHASES.HOLD) {
    return {
      cloudOneStyle: cloudStyle(0.3, 1.075, '-0.8%', 650),
      cloudTwoStyle: cloudStyle(0.96, 1.09, '-1.3%', 650),
      cloudThreeStyle: cloudStyle(0, 1.04, '0%', 650)
    };
  }
  return {
    cloudOneStyle: cloudStyle(0.36, 1.035, '0%', exhaleMs),
    cloudTwoStyle: cloudStyle(0, 0.93, '2.4%', exhaleMs),
    cloudThreeStyle: cloudStyle(0.95, 1.0, '1.2%', exhaleMs)
  };
}

Page({
  data: {
    nav: {},
    navBarStyle: '',
    navTitleStyle: '',
    navRightStyle: '',
    chromeTopStyle: '',
    chromeRightStyle: '',
    chromeShowTop: true,
    chromeShowBottom: true,
    isRunning: false,
    phase: PHASES.IDLE,
    phaseLabel: PHASE_LABELS[PHASES.IDLE],
    navSubtitle: DEFAULT_SUBTITLE,
    actionLabel: '点击开始',
    completionVisible: false,
    settingsVisible: false,
    settingRows: [],
    rhythmOptions: [],
    targetCycleOptions: [],
    themeStyle: '',
    cloudOneStyle: '',
    cloudTwoStyle: '',
    cloudThreeStyle: ''
  },

  onLoad(options) {
    this.clockTimer = null;
    this.completionTimer = null;
    this.volumeTimer = null;
    this.ambientAudio = null;
    this.ambientPlaying = false;
    this.isRunning = false;
    this.currentPhase = PHASES.IDLE;
    this.phaseStartedAt = 0;
    this.phaseEndsAt = 0;
    this.completedCycles = 0;
    this.remainingSeconds = 0;
    this.cloudImageInfo = {};
    this.startRequested = Boolean(
      options && (options.autostart === '1' || options.start === '1' || options.play === '1')
    );
    this.syncSettings();
    this.preloadCloudImages();
    if (this.startRequested) this.startAmbientSession();
  },

  onShow() {
    if (!this.isRunning) this.syncSettings();
  },

  onHide() {
    this.stopSession();
    this.pauseAmbient();
  },

  onUnload() {
    this.clearAllTimers();
    this.destroyAudio();
  },

  syncSettings() {
    const settings = storage.getSettings();
    const rhythm = resolveRhythm(settings);
    const targetCycles = resolveTargetCycles(settings);
    const nav = getNavigationMetrics();
    const chrome = chromeActions.getLayoutStyles();
    const navHeight = Math.max(nav.statusBarHeight + 44, nav.navigationBottom);
    const clouds = buildCloudStyles(PHASES.IDLE, false, rhythm);
    this.settings = settings;
    this.rhythm = rhythm;
    this.targetCycles = targetCycles;
    this.setData({
      nav,
      navBarStyle: `height:${navHeight}px;padding-top:${nav.statusBarHeight}px;padding-right:${nav.rightInset}px;`,
      navTitleStyle: `top:${nav.statusBarHeight}px;height:${navHeight - nav.statusBarHeight}px;`,
      navRightStyle: `right:${nav.rightInset}px;`,
      chromeTopStyle: chrome.topStyle,
      chromeRightStyle: chrome.rightStyle,
      themeStyle: themeVars(rhythm),
      cloudOneStyle: clouds.cloudOneStyle,
      cloudTwoStyle: clouds.cloudTwoStyle,
      cloudThreeStyle: clouds.cloudThreeStyle,
      settingRows: buildSettingsRows(settings, rhythm, targetCycles),
      rhythmOptions: RHYTHMS.map((item) => ({ name: item.name })),
      targetCycleOptions: TARGET_CYCLE_OPTIONS.map((value) => ({ name: `${value} 次` }))
    });
  },

  preloadCloudImages() {
    if (!wx.getImageInfo) return;
    CLOUD_IMAGES.forEach((src) => {
      wx.getImageInfo({
        src,
        success: (info) => {
          this.cloudImageInfo[src] = {
            width: info.width,
            height: info.height
          };
        }
      });
    });
  },

  toggleBreathing() {
    if (this.data.settingsVisible) return;
    if (this.isRunning || this.data.isRunning) {
      this.stopSession();
      return;
    }
    this.startSession();
  },

  startSession() {
    this.clearCompletionTimer();
    this.isRunning = true;
    this.currentPhase = PHASES.INHALE;
    this.completedCycles = 0;
    this.phaseStartedAt = Date.now();
    this.phaseEndsAt = this.phaseStartedAt + phaseDurationMs(this.rhythm, PHASES.INHALE);
    this.remainingSeconds = Math.ceil((this.phaseEndsAt - this.phaseStartedAt) / 1000);
    const clouds = buildCloudStyles(PHASES.INHALE, true, this.rhythm);
    this.setData({
      isRunning: true,
      phase: PHASES.INHALE,
      phaseLabel: PHASE_LABELS[PHASES.INHALE],
      navSubtitle: phasePrompt(PHASES.INHALE, this.remainingSeconds),
      actionLabel: '点击停止',
      completionVisible: false,
      cloudOneStyle: clouds.cloudOneStyle,
      cloudTwoStyle: clouds.cloudTwoStyle,
      cloudThreeStyle: clouds.cloudThreeStyle
    });
    this.startAmbientForSession();
    this.notifyPhase(PHASES.INHALE);
    this.startClock();
  },

  startAmbientSession() {
    this.targetCycles = 9999;
    if (!this.isRunning) this.startSession();
  },

  startClock() {
    this.clearClockTimer();
    this.clockTimer = setInterval(() => this.syncClock(), CLOCK_INTERVAL_MS);
  },

  syncClock() {
    if (!this.isRunning) return;
    const now = Date.now();
    const remaining = Math.max(1, Math.ceil((this.phaseEndsAt - now) / 1000));
    if (remaining !== this.remainingSeconds) {
      this.remainingSeconds = remaining;
      this.setData({
        navSubtitle: phasePrompt(this.currentPhase, remaining)
      });
    }
    if (now < this.phaseEndsAt) return;
    this.advancePhase(now);
  },

  advancePhase(now) {
    if (!this.isRunning) return;
    const next = nextPhase(this.currentPhase);
    if (next !== PHASES.IDLE) {
      this.enterPhase(next, now);
      return;
    }

    this.completedCycles += 1;
    if (this.completedCycles >= this.targetCycles) {
      this.completeSession();
      return;
    }
    this.enterPhase(PHASES.INHALE, now);
  },

  enterPhase(phase, now) {
    if (!this.isRunning) return;
    const duration = phaseDurationMs(this.rhythm, phase);
    const clouds = buildCloudStyles(phase, true, this.rhythm);
    this.currentPhase = phase;
    this.phaseStartedAt = now;
    this.phaseEndsAt = now + duration;
    this.remainingSeconds = Math.ceil(duration / 1000);
    this.setData({
      phase,
      phaseLabel: PHASE_LABELS[phase] || PHASE_LABELS[PHASES.IDLE],
      navSubtitle: phasePrompt(phase, this.remainingSeconds),
      cloudOneStyle: clouds.cloudOneStyle,
      cloudTwoStyle: clouds.cloudTwoStyle,
      cloudThreeStyle: clouds.cloudThreeStyle
    });

    if (duration <= 0) {
      this.advancePhase(now);
      return;
    }
    this.notifyPhase(phase);
  },

  completeSession() {
    this.clearClockTimer();
    this.clearCompletionTimer();
    this.isRunning = false;
    this.currentPhase = PHASES.IDLE;
    this.phaseStartedAt = 0;
    this.phaseEndsAt = 0;
    this.completedCycles = 0;
    this.remainingSeconds = 0;
    const clouds = buildCloudStyles(PHASES.IDLE, false, this.rhythm);
    this.setData({
      isRunning: false,
      phase: PHASES.IDLE,
      phaseLabel: '完成',
      navSubtitle: COMPLETION_SUBTITLE,
      actionLabel: '练习完成',
      completionVisible: true,
      cloudOneStyle: clouds.cloudOneStyle,
      cloudTwoStyle: clouds.cloudTwoStyle,
      cloudThreeStyle: clouds.cloudThreeStyle
    });

    this.fadeAmbient(0, 420, () => this.pauseAmbient());
    this.vibrate('medium');
    if (this.settings.endSoundEnabled) this.playCompletionCue();

    this.completionTimer = setTimeout(() => {
      if (this.isRunning) return;
      this.setData({
        navSubtitle: DEFAULT_SUBTITLE,
        actionLabel: '点击开始',
        completionVisible: false
      });
    }, COMPLETION_HOLD_MS);
  },

  stopSession() {
    const wasRunning = this.isRunning || this.data.isRunning;
    this.clearClockTimer();
    this.clearCompletionTimer();
    this.isRunning = false;
    this.currentPhase = PHASES.IDLE;
    this.phaseStartedAt = 0;
    this.phaseEndsAt = 0;
    this.completedCycles = 0;
    this.remainingSeconds = 0;
    this.fadeAmbient(0, 220, () => this.pauseAmbient());

    if (wasRunning || this.data.phase !== PHASES.IDLE || this.data.navSubtitle !== DEFAULT_SUBTITLE) {
      const clouds = buildCloudStyles(PHASES.IDLE, false, this.rhythm);
      this.setData({
        isRunning: false,
        phase: PHASES.IDLE,
        phaseLabel: PHASE_LABELS[PHASES.IDLE],
        navSubtitle: DEFAULT_SUBTITLE,
        actionLabel: '点击开始',
        completionVisible: false,
        cloudOneStyle: clouds.cloudOneStyle,
        cloudTwoStyle: clouds.cloudTwoStyle,
        cloudThreeStyle: clouds.cloudThreeStyle
      });
    }
  },

  notifyPhase(phase) {
    this.vibrate('light');
    if (!this.settings.soundEnabled) return;

    const baseVolume = clampVolume(this.settings.soundVolume == null ? 0.42 : this.settings.soundVolume);
    if (phase === PHASES.INHALE) {
      this.ensureAmbientAudio();
      if (!this.ambientPlaying) {
        this.ambientAudio.volume = 0.025;
        this.ambientAudio.play();
        this.ambientPlaying = true;
      }
      this.fadeAmbient(baseVolume, Math.min(1600, this.rhythm.inhaleMs));
      return;
    }
    if (phase === PHASES.HOLD) {
      this.fadeAmbient(baseVolume * 0.72, 700);
      return;
    }
    this.fadeAmbient(baseVolume * 0.08, Math.min(2400, this.rhythm.exhaleMs));
  },

  ensureAmbientAudio() {
    if (this.ambientAudio) return this.ambientAudio;
    const audio = wx.createInnerAudioContext();
    audio.loop = true;
    audio.obeyMuteSwitch = true;
    audio.volume = 0;
    audio.src = '/assets/audio/breeze.mp3';
    audio.onError(() => {
      this.ambientPlaying = false;
      this.clearVolumeTimer();
    });
    this.ambientAudio = audio;
    return audio;
  },

  startAmbientForSession() {
    if (!this.settings.soundEnabled) return;
    const audio = this.ensureAmbientAudio();
    this.clearVolumeTimer();
    audio.volume = 0.025;
    audio.play();
    this.ambientPlaying = true;
  },

  fadeAmbient(targetVolume, durationMs, callback) {
    if (!this.ambientAudio) {
      if (callback) callback();
      return;
    }

    this.clearVolumeTimer();
    const audio = this.ambientAudio;
    const startVolume = clampVolume(audio.volume);
    const endVolume = clampVolume(targetVolume);
    const duration = Math.max(0, Number(durationMs) || 0);

    if (duration === 0) {
      audio.volume = endVolume;
      if (callback) callback();
      return;
    }

    const startedAt = Date.now();
    const tick = () => {
      const progress = Math.min(1, (Date.now() - startedAt) / duration);
      audio.volume = startVolume + (endVolume - startVolume) * progress;
      if (progress < 1) return;
      this.clearVolumeTimer();
      if (callback) callback();
    };

    tick();
    this.volumeTimer = setInterval(tick, 80);
  },

  pauseAmbient() {
    this.clearVolumeTimer();
    if (!this.ambientAudio) return;
    this.ambientAudio.pause();
    this.ambientAudio.volume = 0;
    this.ambientPlaying = false;
  },

  destroyAudio() {
    this.clearVolumeTimer();
    if (!this.ambientAudio) return;
    this.ambientAudio.stop();
    this.ambientAudio.destroy();
    this.ambientAudio = null;
    this.ambientPlaying = false;
  },

  clearClockTimer() {
    if (this.clockTimer) clearInterval(this.clockTimer);
    this.clockTimer = null;
  },

  clearCompletionTimer() {
    if (this.completionTimer) clearTimeout(this.completionTimer);
    this.completionTimer = null;
  },

  clearVolumeTimer() {
    if (this.volumeTimer) clearInterval(this.volumeTimer);
    this.volumeTimer = null;
  },

  clearAllTimers() {
    this.clearClockTimer();
    this.clearCompletionTimer();
    this.clearVolumeTimer();
  },

  openSettings() {
    this.stopSession();
    this.setData({
      settingsVisible: true
    });
  },

  closeSettings() {
    this.setData({
      settingsVisible: false
    });
  },

  noop() {},

  handleChromeNoop() {},

  handleChromeAction(event) {
    chromeActions.run(event.currentTarget.dataset.action);
  },

  handleSettingRow(event) {
    const id = event.currentTarget.dataset.id;
    if (id === 'rhythm') this.chooseRhythm();
    if (id === 'targetCycles') this.chooseTargetCycles();
  },

  handleToggle(event) {
    const id = event.currentTarget.dataset.id;
    const row = this.data.settingRows.find((item) => item.id === id);
    if (!row) return;
    const patch = {};
    patch[id] = !row.checked;
    this.updateSettings(patch);
  },

  chooseRhythm() {
    wx.showActionSheet({
      alertText: '呼吸节奏',
      itemList: RHYTHMS.map((item) => item.name),
      success: (result) => {
        const rhythm = RHYTHMS[result.tapIndex];
        if (!rhythm) return;
        this.updateSettings({
          rhythm: rhythm.id,
          inhaleSeconds: rhythm.inhaleSeconds,
          holdSeconds: rhythm.holdSeconds,
          exhaleSeconds: rhythm.exhaleSeconds
        });
      }
    });
  },

  chooseTargetCycles() {
    wx.showActionSheet({
      alertText: '呼吸次数',
      itemList: TARGET_CYCLE_OPTIONS.map((value) => `${value} 次`),
      success: (result) => {
        const targetCycles = TARGET_CYCLE_OPTIONS[result.tapIndex];
        if (!targetCycles) return;
        this.updateSettings({ targetCycles });
      }
    });
  },

  updateSettings(patch) {
    const next = storage.saveSettings(Object.assign({}, this.settings, patch));
    this.settings = next;
    this.syncSettings();
  },

  vibrate(type) {
    if (this.settings.hapticEnabled === false || !wx.vibrateShort) return;
    try {
      wx.vibrateShort({ type: type || 'light' });
    } catch (error) {}
  },

  playCompletionCue() {
    const app = getApp();
    if (app && app.playCompletionCue) {
      app.playCompletionCue();
      return;
    }
    const audio = wx.createInnerAudioContext();
    audio.obeyMuteSwitch = true;
    audio.volume = 0.28;
    audio.src = '/assets/audio/complete.mp3';
    audio.play();
    audio.onEnded(() => audio.destroy());
    audio.onError(() => audio.destroy());
  },

  onBack() {
    this.stopSession();
    navigation.backOrHome();
  }
});
