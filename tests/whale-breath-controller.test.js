const test = require('node:test');
const assert = require('node:assert/strict');

const controllerModule = require('../utils/whale-breath-controller');

test('控制器把状态机整理成页面可直接消费的 view model', () => {
  const controller = controllerModule.createBreathingController();
  const started = controller.start(0);

  assert.equal(started.running, true);
  assert.equal(started.title, '深呼吸');
  assert.equal(started.phase, controllerModule.PHASES.INHALE);
  assert.equal(started.promptText, '吸气 4s');
  assert.equal(started.statusText, '吸气 4s');
  assert.equal(started.phaseChanged, true);
  assert.match(started.scene.photoStyle, /scale\(1\.0280\)/);

  const synced = controller.sync(1000);
  assert.equal(synced.promptText, '吸气 3s');
  assert.equal(synced.phaseChanged, false);

  const hold = controller.sync(4000);
  assert.equal(hold.phase, controllerModule.PHASES.HOLD);
  assert.equal(hold.promptText, '屏气 7s');
  assert.equal(hold.phaseChanged, true);
  assert.equal(hold.scene.bubbleMode, 'hold');

  const exhale = controller.sync(11000);
  assert.equal(exhale.phase, controllerModule.PHASES.EXHALE);
  assert.equal(exhale.promptText, '吐气 8s');
  assert.equal(exhale.scene.bubbleMode, 'sink');

  const stopped = controller.stop();
  assert.equal(stopped.running, false);
  assert.equal(stopped.title, controllerModule.DEFAULT_TITLE);
  assert.equal(stopped.statusText, controllerModule.DEFAULT_SUBTITLE);
  assert.equal(stopped.subtitle, controllerModule.DEFAULT_SUBTITLE);
});
