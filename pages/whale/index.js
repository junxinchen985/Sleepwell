const storage = require('../../services/storage');
const { getNavigationMetrics } = require('../../utils/layout');
const chromeActions = require('../../utils/immersive-chrome-actions');
const {
  PHASES,
  DEFAULT_TITLE,
  DEFAULT_SUBTITLE,
  createBreathingController
} = require('../../utils/whale-breath-controller');

const CLOCK_INTERVAL_MS = 100;

const BUBBLES = [
  { id: 'b01', left: 8, top: 56, size: 7, delay: -1.2, duration: 8.4, variant: 0 },
  { id: 'b02', left: 14, top: 73, size: 5, delay: -5.1, duration: 9.6, variant: 1 },
  { id: 'b03', left: 21, top: 61, size: 9, delay: -3.4, duration: 10.8, variant: 2 },
  { id: 'b04', left: 29, top: 83, size: 6, delay: -7.2, duration: 9.2, variant: 0 },
  { id: 'b05', left: 37, top: 69, size: 4, delay: -2.6, duration: 8.8, variant: 1 },
  { id: 'b06', left: 45, top: 88, size: 8, delay: -6.4, duration: 11.2, variant: 2 },
  { id: 'b07', left: 54, top: 64, size: 5, delay: -4.2, duration: 9.8, variant: 0 },
  { id: 'b08', left: 61, top: 79, size: 7, delay: -8.1, duration: 10.4, variant: 1 },
  { id: 'b09', left: 69, top: 59, size: 4, delay: -3.1, duration: 8.6, variant: 2 },
  { id: 'b10', left: 76, top: 86, size: 9, delay: -5.8, duration: 11.6, variant: 0 },
  { id: 'b11', left: 83, top: 68, size: 6, delay: -1.9, duration: 9.4, variant: 1 },
  { id: 'b12', left: 90, top: 77, size: 5, delay: -6.9, duration: 10.2, variant: 2 },
  { id: 'b13', left: 11, top: 91, size: 4, delay: -4.7, duration: 9.1, variant: 1 },
  { id: 'b14', left: 33, top: 52, size: 6, delay: -8.6, duration: 11.4, variant: 2 },
  { id: 'b15', left: 64, top: 94, size: 5, delay: -2.3, duration: 8.3, variant: 0 },
  { id: 'b16', left: 86, top: 54, size: 7, delay: -7.7, duration: 10.9, variant: 1 }
];

const RIPPLES = [
  { id: 'r01', width: 390, height: 72, delay: -0.2 },
  { id: 'r02', width: 520, height: 94, delay: -1.1 },
  { id: 'r03', width: 660, height: 118, delay: -2.0 },
  { id: 'r04', width: 790, height: 142, delay: -2.9 }
];

const BEAMS = [
  { id: 'l01', left: 8, width: 18, rotate: -9, duration: 8.6, delay: -2.2 },
  { id: 'l02', left: 34, width: 13, rotate: 2, duration: 7.4, delay: -4.1 },
  { id: 'l03', left: 67, width: 20, rotate: 11, duration: 9.3, delay: -1.4 }
];

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
    title: DEFAULT_TITLE,
    promptText: DEFAULT_SUBTITLE,
    statusText: DEFAULT_SUBTITLE,
    subtitle: DEFAULT_SUBTITLE,
    actionLabel: '轻触开始',
    countdownSeconds: 0,
    statusTick: false,
    headerStyle: '',
    chromeTopStyle: '',
    chromeRightStyle: '',
    chromeShowTop: true,
    chromeShowBottom: true,
    scene: {
      photoStyle: '',
      raysStyle: '',
      rippleStyle: '',
      bubbleStyle: ''
    },
    bubbles: BUBBLES,
    ripples: RIPPLES,
    beams: BEAMS
  },

  onLoad(options) {
    this.clockTimer = null;
    this.settings = readSettings();
    this.controller = createBreathingController();
    this.startRequested = Boolean(
      options && (options.autostart === '1' || options.start === '1' || options.play === '1')
    );

    const nav = getNavigationMetrics();
    const chrome = chromeActions.getLayoutStyles();
    const view = this.controller.snapshot();
    this.setData({
      headerStyle: `top:${Math.max(20, nav.statusBarHeight + 4)}px;`,
      chromeTopStyle: chrome.topStyle,
      chromeRightStyle: chrome.rightStyle,
      scene: view.scene
    });

    if (this.startRequested) this.startBreathing();
  },

  onShow() {
    this.settings = readSettings();
  },

  onHide() {
    if (this.data.running) this.stopBreathing();
  },

  onUnload() {
    this.clearClockTimer();
  },

  onShareAppMessage() {
    return {
      title: '深海鲸鱼 · 4-7-8 深呼吸',
      path: '/pages/whale/index'
    };
  },

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
    this.clearClockTimer();
    const view = this.controller.start(Date.now());
    this.applyView(view, true);
    this.vibrate('light');
    this.clockTimer = setInterval(() => this.syncClock(), CLOCK_INTERVAL_MS);
  },

  syncClock() {
    if (!this.data.running) return;

    const view = this.controller.sync(Date.now());
    if (!view.running) return;

    const patch = {};
    if (view.statusText !== this.data.statusText) {
      patch.statusText = view.statusText;
      patch.promptText = view.promptText;
      patch.statusTick = !this.data.statusTick;
    }
    if (view.remainingSeconds !== this.data.countdownSeconds) {
      patch.countdownSeconds = view.remainingSeconds;
    }
    if (view.phase !== this.data.phase || view.phaseChanged) {
      patch.phase = view.phase;
      patch.subtitle = view.subtitle;
      patch.scene = view.scene;
    }

    if (Object.keys(patch).length) this.setData(patch);
    if (view.phaseChanged) this.vibrate('light');
  },

  stopBreathing() {
    this.clearClockTimer();
    const view = this.controller.stop();
    this.applyView(view, true);
  },

  applyView(view, includeScene) {
    const patch = {
      running: view.running,
      phase: view.phase,
      title: view.title,
      promptText: view.promptText,
      statusText: view.statusText,
      subtitle: view.subtitle,
      actionLabel: view.running ? '轻触停止' : '轻触开始',
      countdownSeconds: view.remainingSeconds,
      statusTick: view.running
    };
    if (includeScene || view.phaseChanged) patch.scene = view.scene;
    this.setData(patch);
  },

  clearClockTimer() {
    if (this.clockTimer) clearInterval(this.clockTimer);
    this.clockTimer = null;
  },

  vibrate(type) {
    if (this.settings.hapticEnabled === false || !wx.vibrateShort) return;
    try {
      wx.vibrateShort({ type: type || 'light' });
    } catch (error) {}
  }
});
