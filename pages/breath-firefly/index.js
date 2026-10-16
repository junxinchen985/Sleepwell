/**
 * 深呼吸 · 萤火虫页
 * ---------------------------------------------------------------------------
 * 交互模型：轻触屏幕 / 按钮 → 开始一轮完整呼吸（吸气 → 屏气 → 呼气），
 *          随后自动进入下一轮，直到完成设定次数；再次轻触即结束。
 *
 * 三层结构（换渲染器时只动第 3 层）：
 *   1. utils/firefly-particles.js  呼吸阶段机 + 粒子运动（纯数学，可单测）
 *   2. utils/firefly-renderer.js   把状态画到 Canvas 2D
 *   3. 本文件                       生命周期、交互、设置面板、渲染循环
 *
 * 渲染性能约定：
 *   · 发光渐变只在初始化时创建一次，绘制期零分配
 *   · setData 与渲染解耦，文字状态按 200ms 节流
 *   · DPR 上限压到 2
 *   · 画布保持透明底（原生组件一旦不透明就会盖住标题与按钮）
 */

const design = require('../../data/fireflies');
const fx = require('../../utils/firefly-particles');
const renderer = require('../../utils/firefly-renderer');
const navigation = require('../../utils/navigation');
const { getNavigationMetrics } = require('../../utils/layout');
const { WORLDS, RHYTHMS } = require('../../utils/constants');

const storage = require('../../services/storage');

const STATUS_THROTTLE_MS = 200;
const MAX_DPR = 2;
// 粒子数量：24 → 140。中下部要"密"才有生机感，同时不进入顶部标题区
const PARTICLE_COUNT = 140;

// 轻触去重窗口：tap 可能同时来自 canvas（原生组件）与根节点，重复触发会把开关来回切换
const TAP_GUARD_MS = 320;

/** 按钮下方提示语。只表达"当前能不能点、点了会怎样" */
const HINT_IDLE = '轻触开始';
const HINT_BREATHING = '轻触结束';

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

/** 每个阶段的提示文案。想改提示语只动这里 */
const PHASE_TEXT = {
  idle: { main: '深呼吸', sub: '准备好就轻触屏幕' },
  inhale: { main: '缓慢吸气', sub: '感受腹部向外扩张' },
  hold: { main: '屏住', sub: '让这一口气停留片刻' },
  exhale: { main: '慢慢呼气', sub: '把紧绷一起呼出去' },
  completed: { main: '可以停在这里', sub: '刚才这几轮，身体已经慢下来了' }
};

Page({
  data: {
    nav: { topbarStyle: '' },

    // —— 呼吸状态：WXML 直接读这个变量控制文案与按钮态 ——
    isBreathing: false,
    mainPrompt: PHASE_TEXT.idle.main,
    subPrompt: PHASE_TEXT.idle.sub,
    hint: HINT_IDLE,
    countdown: 0,

    // —— 设置面板 ——
    showSettings: false,
    settings: {},
    worlds: WORLDS,
    rhythms: RHYTHMS,
    cycleOptions: CYCLE_OPTIONS,
    soundOptions: SOUND_OPTIONS,
    currentWorld: WORLDS[0],
    currentRhythm: RHYTHMS[0],
    currentCycle: CYCLE_OPTIONS[2],
    currentSound: SOUND_OPTIONS[0]
  },

  // ==========================================================================
  // 生命周期
  // ==========================================================================

  onLoad() {
    this.rafId = null;
    this.lastTs = 0;
    this.elapsed = 0;
    this.lastUiAt = 0;
    this.lastTapAt = 0;
    this.canvasRenderer = null;

    const settings = this.readSettings();
    this.session = this.buildSession(settings);
    this.applySettingsToData(settings);
    this.setData({ nav: getNavigationMetrics() });
  },

  onReady() {
    this.initCanvas();
  },

  onShow() {
    const settings = this.readSettings();
    this.applySettingsToData(settings);
    // 节奏与次数改动在下一轮开始时生效
    this.session.rhythm = this.rhythmOf(settings);
    this.session.targetCycles = this.targetOf(settings);
    if (this.canvas && !this.rafId) this.startLoop();
  },

  onHide() {
    this.stopLoop();
  },

  onUnload() {
    this.stopLoop();
  },

  // ==========================================================================
  // 设置读写
  // ==========================================================================

  readSettings() {
    try {
      return storage.getSettings();
    } catch (e) {
      return {};
    }
  },

  /** 目标次数：0 表示自由呼吸，用一个很大的数代替，永不到达 */
  targetOf(settings) {
    const target = settings && settings.targetCycles;
    return target > 0 ? target : 999;
  },

  rhythmOf(settings) {
    return {
      inhale: (settings && settings.inhaleSeconds) || fx.RHYTHM.inhale,
      hold: settings && settings.holdSeconds != null ? settings.holdSeconds : fx.RHYTHM.hold,
      exhale: (settings && settings.exhaleSeconds) || fx.RHYTHM.exhale
    };
  },

  buildSession(settings) {
    const rhythm = this.rhythmOf(settings);
    return fx.createSession({
      inhale: rhythm.inhale,
      hold: rhythm.hold,
      exhale: rhythm.exhale,
      targetCycles: this.targetOf(settings),
      startCycle: 0
    });
  },

  applySettingsToData(settings) {
    const s = settings || {};
    const currentWorld = WORLDS.find((item) => item.id === s.world) || WORLDS[0];
    const currentRhythm = RHYTHMS.find((item) => item.id === s.rhythm) || RHYTHMS[0];
    const currentCycle = CYCLE_OPTIONS.find((item) => item.value === s.targetCycles) || CYCLE_OPTIONS[2];
    const currentSound = SOUND_OPTIONS.find((item) => item.id === s.sound) || SOUND_OPTIONS[0];

    this.setData({
      settings: s,
      currentWorld: currentWorld,
      currentRhythm: currentRhythm,
      currentCycle: currentCycle,
      currentSound: currentSound
    });
  },

  // ==========================================================================
  // Canvas 与渲染器
  // ==========================================================================

  initCanvas() {
    const query = wx.createSelectorQuery();
    query.select('#firefly').fields({ node: true, size: true }).exec((res) => {
      const info = res && res[0];
      if (!info || !info.node) {
        console.error('[breath-firefly] 没拿到 canvas 节点');
        return;
      }

      const canvas = info.node;
      const ctx = canvas.getContext('2d');
      const dpr = Math.min(this.readPixelRatio(), MAX_DPR);

      // 物理像素铺满，逻辑坐标仍按 CSS px 计算，避免所有坐标都乘 dpr
      canvas.width = info.width * dpr;
      canvas.height = info.height * dpr;
      ctx.scale(dpr, dpr);

      this.canvas = canvas;
      this.ctx = ctx;
      this.vw = info.width;
      this.vh = info.height;
      this.dpr = dpr;

      // 渲染层在这里创建：换成 Figma 导出的动态作品时，只替换这个模块
      this.canvasRenderer = renderer.createRenderer({
        ctx: ctx,
        width: info.width,
        height: info.height,
        design: design,
        count: PARTICLE_COUNT,
        seed: 20261014,
        layoutSeed: 97531
      });

      this.startLoop();
    });
  },

  readPixelRatio() {
    try {
      if (wx.getWindowInfo) return wx.getWindowInfo().pixelRatio || 1;
    } catch (e) { /* 低版本基础库 */ }
    try {
      return wx.getSystemInfoSync().pixelRatio || 1;
    } catch (e) {
      return 1;
    }
  },

  // ==========================================================================
  // 渲染循环
  // ==========================================================================

  startLoop() {
    if (!this.canvas || this.rafId) return;
    const tick = (ts) => {
      this.rafId = this.canvas.requestAnimationFrame(tick);
      this.frame(ts);
    };
    this.rafId = this.canvas.requestAnimationFrame(tick);
  },

  stopLoop() {
    if (this.canvas && this.rafId) this.canvas.cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.lastTs = 0;   // 下次回来重新计时，避免 dt 突变
  },

  frame(ts) {
    const now = Date.now();
    const wall = typeof ts === 'number' ? ts : now;
    // dt 上限 50ms：从后台切回来时不要让粒子"瞬移"
    const dt = this.lastTs ? Math.min((wall - this.lastTs) / 1000, 0.05) : 0.016;
    this.lastTs = wall;
    this.elapsed += dt;

    // ① 阶段机：算出这一刻的汇聚进度与颤动强度
    const result = fx.updateSession(this.session, now);

    // ② 交给渲染层：推进粒子并绘制
    if (this.canvasRenderer) {
      this.canvasRenderer.update(dt, this.elapsed, {
        gather: this.session.gather,
        tremor: this.session.tremor
      }, now);
    }

    // ③ 文字状态（节流）
    this.syncUi(now, result);
  },

  // ==========================================================================
  // 状态同步（节流，绝不每帧 setData）
  // ==========================================================================

  syncUi(now, result) {
    // 阶段切换与整轮结束要立刻反映，不受节流限制
    if (result.phaseChanged || result.finished) {
      this.applyPhaseUi(result);
      this.lastUiAt = now;
      return;
    }
    if (now - this.lastUiAt < STATUS_THROTTLE_MS) return;
    this.lastUiAt = now;

    const left = fx.phaseRemaining(this.session, now);
    if (left !== this.data.countdown) this.setData({ countdown: left });
  },

  applyPhaseUi(result) {
    const text = PHASE_TEXT[this.session.phase] || PHASE_TEXT.idle;
    const breathing = this.session.running;

    this.setData({
      isBreathing: breathing,
      mainPrompt: text.main,
      subPrompt: text.sub,
      // 提示语只表达开关状态，与具体阶段无关
      hint: breathing ? HINT_BREATHING : HINT_IDLE,
      countdown: fx.phaseRemaining(this.session, Date.now())
    });

    if (result && result.phaseChanged) this.vibrate('light');
    if (result && result.finished) this.onSessionFinished();
  },

  onSessionFinished() {
    this.vibrate('medium');
    const settings = this.readSettings();
    if (!settings.endSoundEnabled) return;
    try {
      const app = getApp();
      if (app && app.playCompletionCue) app.playCompletionCue();
    } catch (e) { /* 独立运行时忽略 */ }
  },

  // ==========================================================================
  // 交互：轻触切换「开始 / 结束」
  // ==========================================================================

  /**
   * 轻触开关。
   * 用 bindtap / catchtap 绑定在根节点、canvas 与按压按钮上：
   *   · canvas 与按钮用 catchtap，阻止冒泡，避免和根节点重复触发
   *   · 仍然保留一个时间窗去重，防止个别机型连发两次 tap 把开关来回切
   */
  handleTap() {
    const now = Date.now();
    if (now - this.lastTapAt < TAP_GUARD_MS) return;
    this.lastTapAt = now;

    if (this.session.running) {
      // 结束：光点回到散开状态，提示语切回「轻触开始」
      fx.stopSession(this.session, now);
      this.applyPhaseUi({ phaseChanged: false });
      this.vibrate('light');
      return;
    }

    // 开始：从头进入吸气 → 屏气 → 呼气
    this.session.cycle = 0;
    fx.startSession(this.session, now);
    this.applyPhaseUi({ phaseChanged: false });
    this.vibrate('light');
  },

  /** 空处理器：导航行与设置面板用它拦住轻触，避免点设置时触发呼吸开关 */
  noop() {},

  vibrate(type) {
    const settings = this.data.settings || {};
    if (settings.hapticEnabled === false) return;
    try {
      wx.vibrateShort({ type: type || 'light' });
    } catch (e) { /* 部分机型不支持 */ }
  },

  // ==========================================================================
  // 导航与设置面板
  // ==========================================================================

  onBack() {
    navigation.backOrHome();
  },

  openSettings() {
    this.setData({ showSettings: true });
  },

  closeSettings() {
    this.setData({ showSettings: false });
  },

  saveSettings(patch) {
    const next = Object.assign({}, this.readSettings(), patch);
    try {
      storage.saveSettings(next);
    } catch (e) { /* 独立运行时忽略 */ }
    this.setData({ settings: next });
    return next;
  },

  onWorldChange(e) {
    const world = WORLDS[Number(e.detail.value)] || WORLDS[0];
    this.saveSettings({ world: world.id });
    this.setData({ currentWorld: world });
  },

  /** 呼吸节奏：预设会同时改写三段秒数，并即时更新阶段机 */
  onRhythmChange(e) {
    const rhythm = RHYTHMS[Number(e.detail.value)] || RHYTHMS[0];
    const next = this.saveSettings({
      rhythm: rhythm.id,
      inhaleSeconds: rhythm.inhale,
      holdSeconds: rhythm.hold || 0,
      exhaleSeconds: rhythm.exhale
    });
    this.setData({ currentRhythm: rhythm });
    this.session.rhythm = this.rhythmOf(next);
  },

  onCycleChange(e) {
    const option = CYCLE_OPTIONS[Number(e.detail.value)] || CYCLE_OPTIONS[2];
    const next = this.saveSettings({ targetCycles: option.value });
    this.setData({ currentCycle: option });
    this.session.targetCycles = this.targetOf(next);
  },

  onSoundChange(e) {
    const sound = SOUND_OPTIONS[Number(e.detail.value)] || SOUND_OPTIONS[0];
    this.saveSettings({ sound: sound.id, soundEnabled: true });
    this.setData({ currentSound: sound });
    try {
      const app = getApp();
      if (app && app.playSound) {
        const settings = this.readSettings();
        app.playSound(sound.id, settings.soundVolume, settings.soundTimerMinutes);
      }
    } catch (e) { /* 独立运行时忽略 */ }
  },

  onToggleChange(e) {
    const key = e.currentTarget.dataset.key;
    const patch = {};
    patch[key] = e.detail.value;
    this.saveSettings(patch);
  },

  goPage(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.navigateTo({ url: url });
  }
});
