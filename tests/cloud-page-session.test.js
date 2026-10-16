const test = require('node:test');
const assert = require('node:assert/strict');

function createPageHarness(overrides) {
  const settings = Object.assign({
    rhythm: '478',
    inhaleSeconds: 4,
    holdSeconds: 7,
    exhaleSeconds: 8,
    targetCycles: 6,
    hapticEnabled: true,
    soundEnabled: false,
    endSoundEnabled: false,
    breathPatternVersion: 2
  }, overrides || {});
  const intervals = [];
  const timeouts = [];
  let nextTimerId = 1;
  let now = 0;
  const vibrations = [];
  let completionCues = 0;

  global.wx = {
    getStorageSync() {
      return settings;
    },
    setStorageSync() {},
    getWindowInfo() {
      return { windowWidth: 375, statusBarHeight: 24 };
    },
    getMenuButtonBoundingClientRect() {
      return { left: 278, top: 32, bottom: 68 };
    },
    getImageInfo() {},
    vibrateShort(options) {
      vibrations.push(options.type);
    },
    createInnerAudioContext() {
      return {
        play() {},
        pause() {},
        stop() {},
        destroy() {},
        onError() {},
        onEnded() {}
      };
    }
  };
  global.getApp = () => ({
    playCompletionCue() {
      completionCues += 1;
    }
  });

  global.Date.now = () => now;

  global.setInterval = (callback) => {
    const id = nextTimerId;
    nextTimerId += 1;
    intervals.push({ id, callback, cancelled: false });
    return id;
  };
  global.clearInterval = (id) => {
    const interval = intervals.find((item) => item.id === id);
    if (interval) interval.cancelled = true;
  };
  global.setTimeout = (callback) => {
    const id = nextTimerId;
    nextTimerId += 1;
    timeouts.push({ id, callback, cancelled: false });
    return id;
  };
  global.clearTimeout = (id) => {
    const timeout = timeouts.find((item) => item.id === id);
    if (timeout) timeout.cancelled = true;
  };

  let definition = null;
  global.Page = (config) => {
    definition = config;
  };

  const pagePath = require.resolve('../pages/cloud/index.js');
  delete require.cache[pagePath];
  require(pagePath);

  const instance = {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch) {
      Object.assign(this.data, patch);
    }
  };
  Object.keys(definition).forEach((key) => {
    if (typeof definition[key] === 'function') instance[key] = definition[key];
  });
  instance.onLoad();

  return {
    instance,
    intervals,
    timeouts,
    vibrations,
    advance(ms) {
      now += ms;
      intervals.forEach((item) => {
        if (!item.cancelled) item.callback();
      });
    },
    get completionCues() {
      return completionCues;
    }
  };
}

test('点击开始并贯穿六轮后停止并触发完成路径', () => {
  const harness = createPageHarness();
  const page = harness.instance;
  page.toggleBreathing();
  assert.equal(page.data.phase, 'inhale');
  assert.equal(page.data.navSubtitle, '吸气 4 秒');
  harness.advance(1000);
  assert.equal(page.data.navSubtitle, '吸气 3 秒');
  harness.advance(3000);

  for (let cycle = 0; cycle < 6; cycle += 1) {
    if (cycle > 0) harness.advance(4000);
    if (cycle < 5) {
      assert.equal(page.data.phase, 'hold');
      assert.equal(page.data.navSubtitle, '屏气 7 秒');
    }
    harness.advance(7000);
    if (cycle < 5) {
      assert.equal(page.data.phase, 'exhale');
      assert.equal(page.data.navSubtitle, '吐气 8 秒');
    }
    harness.advance(8000);
  }

  assert.equal(page.data.phase, 'idle');
  assert.equal(page.data.isRunning, false);
  assert.equal(page.data.navSubtitle, '练习完成，回到当下');
  assert.equal(page.completedCycles, 0);
  assert.equal(harness.vibrations[0], 'light');
  assert.equal(harness.vibrations[harness.vibrations.length - 1], 'medium');
});

test('再次点击立即取消阶段计时并回到待机', () => {
  const harness = createPageHarness();
  const page = harness.instance;
  page.toggleBreathing();
  page.toggleBreathing();

  assert.equal(harness.intervals[0].cancelled, true);
  assert.equal(page.data.phase, 'idle');
  assert.equal(page.data.phaseLabel, '点击开始');
  assert.equal(page.data.isRunning, false);
  assert.equal(page.data.navSubtitle, '放松身心，回到当下');
});
