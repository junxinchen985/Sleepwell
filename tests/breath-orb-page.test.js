const test = require('node:test');
const assert = require('node:assert/strict');

function createFakeContext() {
  const gradient = { addColorStop() {} };
  return {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    createRadialGradient() { return gradient; },
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    scale() {},
    beginPath() {},
    arc() {},
    fill() {},
    fillRect() {},
    clearRect() {},
    stroke() {},
    moveTo() {},
    lineTo() {},
    drawImage() {}
  };
}

function createPageHarness() {
  let now = 0;
  const intervals = [];
  const rafs = new Map();
  const cancelledRafs = [];
  const vibrations = [];
  let nextTimerId = 1;
  let nextRafId = 1;

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

  const canvas = {
    width: 0,
    height: 0,
    getContext() { return createFakeContext(); },
    requestAnimationFrame(callback) {
      const id = nextRafId;
      nextRafId += 1;
      rafs.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) {
      cancelledRafs.push(id);
      rafs.delete(id);
    },
    createImage() {
      return {
        onload: null,
        onerror: null,
        set src(value) {
          this._src = value;
          if (this.onload) this.onload();
        },
        get src() {
          return this._src;
        }
      };
    }
  };

  global.wx = {
    getStorageSync() {
      return { hapticEnabled: true };
    },
    getWindowInfo() {
      return { windowWidth: 375, pixelRatio: 2, statusBarHeight: 44 };
    },
    getMenuButtonBoundingClientRect() {
      return { left: 278, top: 32, bottom: 68 };
    },
    vibrateShort(options) {
      vibrations.push(options.type);
    },
    createSelectorQuery() {
      return {
        select() { return this; },
        fields() { return this; },
        exec(callback) {
          callback([{ node: canvas, width: 330, height: 330 }]);
        }
      };
    }
  };

  let definition = null;
  global.Page = (config) => {
    definition = config;
  };

  const pagePath = require.resolve('../pages/breath-orb/index.js');
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
  instance.onReady();

  return {
    instance,
    intervals,
    rafs,
    cancelledRafs,
    vibrations,
    advance(ms) {
      now += ms;
      intervals.forEach((interval) => {
        if (!interval.cancelled) interval.callback();
      });
    },
    flushFrame(timestamp) {
      Array.from(rafs.values()).forEach((callback) => callback(timestamp));
    }
  };
}

test('页面开始时显示吸气 4 和点击停止', () => {
  const harness = createPageHarness();
  const page = harness.instance;

  page.handleToggle();

  assert.equal(page.data.running, true);
  assert.equal(page.data.phase, 'inhale');
  assert.equal(page.data.promptText, '吸气4秒');
  assert.equal(page.data.actionLabel, '点击停止');
  assert.equal(harness.intervals.length, 1);
  assert.equal(harness.rafs.size, 1);
  assert.equal(harness.vibrations[0], 'light');
});

test('倒计时每秒更新，跨阶段后仍使用严格文案格式', () => {
  const harness = createPageHarness();
  const page = harness.instance;
  page.handleToggle();

  harness.advance(1000);
  assert.equal(page.data.promptText, '吸气3秒');

  harness.advance(2000);
  assert.equal(page.data.promptText, '吸气1秒');

  harness.advance(1000);
  harness.flushFrame(4000);
  assert.equal(page.data.phase, 'hold');

  harness.advance(0);
  assert.equal(page.data.promptText, '屏息7秒');
  assert.equal(page.data.promptText.includes('...'), false);
});

test('停止呼吸时同时取消 interval 与 requestAnimationFrame', () => {
  const harness = createPageHarness();
  const page = harness.instance;
  page.handleToggle();

  const runningRaf = Array.from(harness.rafs.keys())[0];
  assert.equal(harness.intervals[0].cancelled, false);

  page.handleToggle();

  assert.equal(harness.intervals[0].cancelled, true);
  assert.equal(harness.cancelledRafs.includes(runningRaf), true);
  assert.equal(page.rafId, null);
  assert.equal(page.data.running, false);
  assert.equal(page.data.phase, 'idle');
  assert.equal(page.data.promptText, '放松身心，回到当下');
  assert.equal(page.data.actionLabel, '轻触开始');
});

test('页面隐藏时回到待机，避免后台继续占用计时器和动画帧', () => {
  const harness = createPageHarness();
  const page = harness.instance;
  page.handleToggle();

  page.onHide();

  assert.equal(page.data.running, false);
  assert.equal(page.data.promptText, '放松身心，回到当下');
  assert.equal(harness.intervals.every((interval) => interval.cancelled), true);
  assert.equal(harness.rafs.size, 0);
});
