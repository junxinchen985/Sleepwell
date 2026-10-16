const test = require('node:test');
const assert = require('node:assert/strict');

function createPageHarness() {
  let now = 0;
  const intervals = [];
  const vibrations = [];
  let nextTimerId = 1;

  global.Date.now = () => now;
  global.setInterval = (callback) => {
    const id = nextTimerId;
    nextTimerId += 1;
    intervals.push({ id, callback, cancelled: false });
    return id;
  };
  global.clearInterval = (id) => {
    const item = intervals.find((interval) => interval.id === id);
    if (item) item.cancelled = true;
  };
  global.wx = {
    getStorageSync() {
      return { hapticEnabled: true };
    },
    getWindowInfo() {
      return { windowWidth: 375, statusBarHeight: 44 };
    },
    getMenuButtonBoundingClientRect() {
      return { left: 278, top: 32, bottom: 68 };
    },
    vibrateShort(options) {
      vibrations.push(options.type);
    }
  };

  let definition = null;
  global.Page = (config) => {
    definition = config;
  };

  const pagePath = require.resolve('../pages/whale/index.js');
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
    page: instance,
    intervals,
    vibrations,
    advance(ms) {
      now += ms;
      intervals.forEach((interval) => {
        if (!interval.cancelled) interval.callback();
      });
    }
  };
}

test('页面点击后进入吸气 4s，倒计时实时更新', () => {
  const harness = createPageHarness();

  harness.page.handleToggle();
  assert.equal(harness.page.data.running, true);
  assert.equal(harness.page.data.title, '深呼吸');
  assert.equal(harness.page.data.phase, 'inhale');
  assert.equal(harness.page.data.promptText, '吸气 4s');
  assert.equal(harness.page.data.statusText, '吸气 4s');
  assert.equal(harness.page.data.actionLabel, '轻触停止');
  assert.equal(harness.intervals.length, 1);
  assert.equal(harness.vibrations[0], 'light');

  harness.advance(1000);
  assert.equal(harness.page.data.promptText, '吸气 3s');
  assert.equal(harness.page.data.statusText, '吸气 3s');
  harness.advance(2000);
  assert.equal(harness.page.data.promptText, '吸气 1s');
});

test('页面跨阶段后显示屏气 7s 并保持无省略号文案', () => {
  const harness = createPageHarness();
  harness.page.handleToggle();
  harness.advance(4000);

  assert.equal(harness.page.data.phase, 'hold');
  assert.equal(harness.page.data.promptText, '屏气 7s');
  assert.equal(harness.page.data.promptText.includes('...'), false);
  assert.equal(harness.page.data.scene.bubbleMode, 'hold');
});

test('停止和隐藏页面都会清理计时器并恢复待机', () => {
  const harness = createPageHarness();
  harness.page.handleToggle();
  const timer = harness.intervals[0];

  harness.page.handleToggle();
  assert.equal(timer.cancelled, true);
  assert.equal(harness.page.data.running, false);
  assert.equal(harness.page.data.title, '深呼吸');
  assert.equal(harness.page.data.statusText, '放松身心，回到当下');
  assert.equal(harness.page.data.actionLabel, '轻触开始');

  harness.page.handleToggle();
  const hiddenTimer = harness.intervals[harness.intervals.length - 1];
  harness.page.onHide();
  assert.equal(hiddenTimer.cancelled, true);
  assert.equal(harness.page.data.running, false);
  assert.equal(harness.page.data.statusText, '放松身心，回到当下');
});
