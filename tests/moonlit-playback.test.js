const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function createScene() {
  const filename = path.resolve(__dirname, '../components/world-visual/index.js');
  let definition;
  let now = 0;
  const timers = new Map();
  let timerId = 0;
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: createRequire(filename),
    Component(value) { definition = value; },
    wx: { nextTick(callback) { callback(); } },
    Date: { now: () => now },
    setInterval(callback) { timers.set(++timerId, callback); return timerId; },
    clearInterval(id) { timers.delete(id); }
  });
  const scene = {
    ...definition.methods,
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(value) { Object.assign(this.data, value); },
    // Simulate an unsupported or zero-size Canvas query.
    createSelectorQuery() {
      return { select() { return this; }, fields() { return this; }, exec(callback) { callback([null]); } };
    }
  };
  scene.data.world = 'mist';
  definition.lifetimes.ready.call(scene);
  return { scene, definition, timers, tick(value) { now = value; for (const cb of timers.values()) cb(); } };
}

test('lake animates when Canvas is unavailable, including the last-to-first blend', () => {
  const { scene, tick, timers } = createScene();
  assert.equal(timers.size, 1);
  tick(1200);
  assert.equal(scene.data.moonlitFrames[1].opacity, 1);
  assert.equal(scene.data.moonlitFrames[2].opacity, 0.5);
  tick(6000);
  assert.equal(scene.data.moonlitFrames[7].opacity, 0.5);
  assert.equal(scene.data.moonlitFrames[0].opacity, 1);
  tick(6400);
  assert.equal(scene.data.moonlitFrames[0].opacity, 1);
  assert.equal(scene.data.moonlitFrames[7].opacity, 0);
});

test('lake stops while hidden and restarts once, then releases timers on detach', () => {
  const { scene, definition, timers } = createScene();
  definition.pageLifetimes.hide.call(scene);
  assert.equal(timers.size, 0);
  definition.pageLifetimes.show.call(scene);
  definition.pageLifetimes.show.call(scene);
  assert.equal(timers.size, 1);
  definition.lifetimes.detached.call(scene);
  assert.equal(timers.size, 0);
});

test('viewport resize preserves fallback playback when Canvas query still fails', () => {
  const { scene, definition, timers } = createScene();
  definition.pageLifetimes.resize.call(scene);
  assert.equal(timers.size, 1);
});
