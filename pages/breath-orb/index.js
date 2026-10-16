/**
 * 深呼吸 · 呼吸光团页
 * ---------------------------------------------------------------------------
 * 交互：点击底部按钮开始一轮持续循环的 4-7-8 呼吸，再次点击停止。
 * 页面只保留两个计时句柄：
 *   · clockTimer  setInterval，100ms 校时，文案严格每秒变化一次
 *   · rafId       Canvas requestAnimationFrame，仅呼吸运行时存在
 * 停止时会同时清理两者，并立刻重绘一帧静止光团。
 */

const orbMachine = require('../../utils/breath-orb-machine');
const orbRenderer = require('../../utils/breath-orb-renderer');
const { getNavigationMetrics } = require('../../utils/layout');
const chromeActions = require('../../utils/immersive-chrome-actions');
const storage = require('../../services/storage');

const MAX_DPR = 2;
const CLOCK_INTERVAL_MS = 100;

const PHASES = orbMachine.PHASES;
const DEFAULT_SUBTITLE = orbMachine.DEFAULT_SUBTITLE;

function readSettings() {
  try {
    return storage.getSettings();
  } catch (error) {
    return {};
  }
}

Page({
  data: {
    running: false,
    phase: PHASES.IDLE,
    promptText: DEFAULT_SUBTITLE,
    actionLabel: '轻触开始',
    promptTick: false,
    headerStyle: '',
    chromeTopStyle: '',
    chromeRightStyle: '',
    chromeShowTop: true,
    chromeShowBottom: true
  },

  onLoad(options) {
    this.clockTimer = null;
    this.rafId = null;
    this.lastFrameTs = 0;
    this.elapsed = 0;
    this.pendingStart = false;
    this.canvas = null;
    this.ctx = null;
    this.canvasRenderer = null;
    this.orbImage = null;
    this.unloaded = false;
    this.startRequested = Boolean(
      options && (options.autostart === '1' || options.start === '1' || options.play === '1')
    );
    this.settings = readSettings();
    this.session = orbMachine.createSession();

    const nav = getNavigationMetrics();
    const chrome = chromeActions.getLayoutStyles();
    this.setData({
      headerStyle: `top:${nav.statusBarHeight + 18}px;`,
      chromeTopStyle: chrome.topStyle,
      chromeRightStyle: chrome.rightStyle
    });
  },

  onReady() {
    this.initCanvas();
  },

  onShow() {
    this.settings = readSettings();
    if (this.canvas && this.data.running && !this.rafId) {
      this.lastFrameTs = 0;
      this.startClock();
      this.startLoop();
    }
  },

  onHide() {
    if (this.data.running) this.stopBreathing();
    this.pendingStart = false;
    this.cleanupAnimation();
  },

  onUnload() {
    this.unloaded = true;
    this.cleanupAnimation();
    if (this.orbImage) {
      this.orbImage.onload = null;
      this.orbImage.onerror = null;
    }
  },

  onShareAppMessage() {
    return {
      title: '深呼吸，回到当下',
      path: '/pages/breath-orb/index'
    };
  },

  // ==========================================================================
  // Canvas 初始化
  // ==========================================================================

  initCanvas() {
    const query = wx.createSelectorQuery();
    query.select('#breathOrbCanvas').fields({ node: true, size: true }).exec((result) => {
      const info = result && result[0];
      if (!info || !info.node) {
        console.error('[breath-orb] 未获取到 Canvas 节点');
        return;
      }

      const canvas = info.node;
      const ctx = canvas.getContext('2d');
      const dpr = Math.min(this.readPixelRatio(), MAX_DPR);
      canvas.width = info.width * dpr;
      canvas.height = info.height * dpr;
      ctx.scale(dpr, dpr);

      this.canvas = canvas;
      this.ctx = ctx;
      this.canvasRenderer = orbRenderer.createRenderer({
        ctx: ctx,
        width: info.width,
        height: info.height
      });
      this.canvasRenderer.renderIdle();

      if (this.startRequested && !this.data.running) {
        this.startBreathing();
      }

      if (canvas.createImage) {
        const image = canvas.createImage();
        this.orbImage = image;
        image.onload = () => {
          if (this.unloaded || !this.canvasRenderer) return;
          this.canvasRenderer.setSourceImage(image);
        };
        image.onerror = () => {
          console.error('[breath-orb] 设计底图加载失败');
        };
        image.src = '/assets/breath-orb/orb-source.png';
      }

      if (this.pendingStart) {
        this.pendingStart = false;
        this.startBreathing();
      }
    });
  },

  readPixelRatio() {
    try {
      if (wx.getWindowInfo) return wx.getWindowInfo().pixelRatio || 1;
    } catch (error) {}
    try {
      return wx.getSystemInfoSync().pixelRatio || 1;
    } catch (error) {
      return 1;
    }
  },

  // ==========================================================================
  // 交互与状态机
  // ==========================================================================

  handleToggle() {
    if (this.data.running) {
      this.stopBreathing();
      return;
    }
    this.startBreathing();
  },

  handleChromeNoop() {},

  handleChromeAction(event) {
    chromeActions.run(event.currentTarget.dataset.action);
  },

  startBreathing() {
    if (!this.canvasRenderer) {
      this.pendingStart = true;
      return;
    }

    this.cleanupAnimation();
    this.session = orbMachine.createSession();
    orbMachine.startSession(this.session, Date.now());
    this.elapsed = 0;
    this.lastFrameTs = 0;

    this.setData({
      running: true,
      phase: PHASES.INHALE,
      promptText: orbMachine.phasePrompt(PHASES.INHALE, 4),
      actionLabel: '点击停止',
      promptTick: !this.data.promptTick
    });

    this.vibrate('light');
    this.startClock();
    this.startLoop();
  },

  stopBreathing() {
    this.pendingStart = false;
    this.cleanupAnimation();
    orbMachine.stopSession(this.session);
    this.elapsed = 0;

    if (this.canvasRenderer) this.canvasRenderer.renderIdle();

    this.setData({
      running: false,
      phase: PHASES.IDLE,
      promptText: DEFAULT_SUBTITLE,
      actionLabel: '轻触开始'
    });
  },

  startClock() {
    this.clearClockTimer();
    this.clockTimer = setInterval(() => this.syncCountdown(), CLOCK_INTERVAL_MS);
  },

  syncCountdown() {
    if (!this.session || !this.session.running) return;

    const remainingSeconds = Math.max(
      1,
      Math.ceil((this.session.phaseEndsAt - Date.now()) / 1000)
    );
    const text = orbMachine.phasePrompt(this.session.phase, remainingSeconds);
    if (text === this.data.promptText) return;

    this.setData({
      phase: this.session.phase,
      promptText: text,
      promptTick: !this.data.promptTick
    });
  },

  vibrate(type) {
    if (this.settings.hapticEnabled === false || !wx.vibrateShort) return;
    try {
      wx.vibrateShort({ type: type || 'light' });
    } catch (error) {}
  },

  // ==========================================================================
  // 动画循环
  // ==========================================================================

  startLoop() {
    if (!this.canvas || this.rafId) return;

    const tick = (timestamp) => {
      this.rafId = this.canvas.requestAnimationFrame(tick);
      this.frame(timestamp);
    };
    this.rafId = this.canvas.requestAnimationFrame(tick);
  },

  frame(timestamp) {
    if (!this.session || !this.session.running) return;

    const now = Date.now();
    const wall = typeof timestamp === 'number' ? timestamp : now;
    const dt = this.lastFrameTs
      ? Math.min(Math.max((wall - this.lastFrameTs) / 1000, 0), 0.05)
      : 0.016;
    this.lastFrameTs = wall;
    this.elapsed += dt;

    const update = orbMachine.updateSession(this.session, now);
    if (update.phaseChanged) {
      this.vibrate('light');
      this.setData({
        phase: update.phase,
        promptText: orbMachine.phasePrompt(update.phase, update.remainingSeconds),
        promptTick: !this.data.promptTick
      });
    }
    const motion = orbMachine.getMotionState(update.phase, update.phaseProgress);
    this.canvasRenderer.render(dt, this.elapsed, motion);
  },

  stopLoop() {
    if (this.canvas && this.rafId) {
      this.canvas.cancelAnimationFrame(this.rafId);
    }
    this.rafId = null;
    this.lastFrameTs = 0;
  },

  clearClockTimer() {
    if (this.clockTimer) clearInterval(this.clockTimer);
    this.clockTimer = null;
  },

  cleanupAnimation() {
    this.stopLoop();
    this.clearClockTimer();
  }
});
