const test = require('node:test');
const assert = require('node:assert/strict');

const machine = require('../utils/breath-orb-machine');

const P = machine.PHASES;

test('开始呼吸后从吸气 4 进入 4-7-8 循环', () => {
  const session = machine.createSession();
  machine.startSession(session, 0);

  assert.equal(session.running, true);
  assert.equal(session.phase, P.INHALE);

  const update = machine.updateSession(session, 0);
  assert.equal(update.remainingSeconds, 4);
  assert.equal(machine.phasePrompt(update.phase, update.remainingSeconds), '吸气4秒');
});

test('倒计时严格按吸气 4、屏息 7、呼气 8 递减且不含省略号', () => {
  const session = machine.createSession();
  machine.startSession(session, 0);

  const checks = [
    [0, P.INHALE, 4, '吸气4秒'],
    [1000, P.INHALE, 3, '吸气3秒'],
    [2000, P.INHALE, 2, '吸气2秒'],
    [3000, P.INHALE, 1, '吸气1秒'],
    [4000, P.HOLD, 7, '屏息7秒'],
    [10000, P.HOLD, 1, '屏息1秒'],
    [11000, P.EXHALE, 8, '呼气8秒'],
    [18000, P.EXHALE, 1, '呼气1秒'],
    [19000, P.INHALE, 4, '吸气4秒']
  ];

  checks.forEach((check) => {
    const update = machine.updateSession(session, check[0]);
    assert.equal(update.phase, check[1]);
    assert.equal(update.remainingSeconds, check[2]);
    const prompt = machine.phasePrompt(update.phase, update.remainingSeconds);
    assert.equal(prompt, check[3]);
    assert.equal(prompt.includes('...'), false);
  });
});

test('阶段边界和跨周期跳时都能自我校正', () => {
  const session = machine.createSession();
  machine.startSession(session, 0);

  let update = machine.updateSession(session, 3999);
  assert.equal(update.phase, P.INHALE);
  assert.equal(update.remainingSeconds, 1);

  update = machine.updateSession(session, 4000);
  assert.equal(update.phase, P.HOLD);
  assert.equal(update.remainingSeconds, 7);
  assert.equal(update.phaseChanged, true);

  update = machine.updateSession(session, 11000);
  assert.equal(update.phase, P.EXHALE);
  assert.equal(update.remainingSeconds, 8);

  update = machine.updateSession(session, 19000);
  assert.equal(update.phase, P.INHALE);
  assert.equal(update.cycle, 1);
  assert.equal(update.cycleChanged, true);

  update = machine.updateSession(session, 44000);
  assert.equal(update.cycle, 2);
  assert.equal(update.phase, P.HOLD);
  assert.equal(update.remainingSeconds, 5);
});

test('停止后清空运行状态并回到待机文案', () => {
  const session = machine.createSession();
  machine.startSession(session, 0);
  machine.updateSession(session, 6000);
  machine.stopSession(session);

  assert.equal(session.running, false);
  assert.equal(session.phase, P.IDLE);
  assert.equal(session.cycle, 0);
  assert.equal(session.phaseProgress, 0);
  assert.equal(machine.phasePrompt(session.phase, 0), machine.DEFAULT_SUBTITLE);
});

test('视觉参数只保留舒缓聚散和缓慢旋转，不再生成水波参数', () => {
  const idle = machine.getMotionState(P.IDLE, 0);
  const inhaleStart = machine.getMotionState(P.INHALE, 0);
  const inhaleEnd = machine.getMotionState(P.INHALE, 1);
  const hold = machine.getMotionState(P.HOLD, 0.5);
  const exhaleEnd = machine.getMotionState(P.EXHALE, 1);

  assert.ok(Math.abs(inhaleStart.gather - idle.gather) < 1e-9);
  assert.ok(inhaleEnd.gather > inhaleStart.gather);
  assert.ok(hold.gather > inhaleEnd.gather);
  assert.ok(exhaleEnd.gather < hold.gather);
  assert.ok(Math.abs(exhaleEnd.gather - idle.gather) < 1e-9);
  assert.ok(inhaleEnd.brightness > idle.brightness);
  assert.ok(hold.brightness > idle.brightness);
  assert.ok(hold.gather - idle.gather > 0.6);
  assert.ok(hold.rotationSpeed > idle.rotationSpeed * 1.5);
  assert.ok(hold.rotationSpeed < 0.18);
  assert.equal(hold.amplitude, undefined);
  assert.equal(hold.waveFrequency, undefined);
  assert.equal(hold.tremor, undefined);
});

test('渲染器直接使用设计图贴图，只执行旋转和缩放', () => {
  const renderer = require('../utils/breath-orb-renderer');
  const draws = [];
  const ctx = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    clearRect() {},
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    drawImage(image) { draws.push(image); }
  };
  const instance = renderer.createRenderer({ ctx: ctx, width: 330, height: 330 });
  const image = { id: 'design-orb' };

  assert.equal(instance.engine, 'breath-orb-design-image');
  assert.equal(instance.sourceReady, false);
  instance.setSourceImage(image);
  assert.equal(instance.sourceReady, true);
  instance.renderIdle();
  instance.render(0.1, 0.1, machine.getMotionState(P.HOLD, 0));

  assert.equal(draws.length, 3);
  assert.equal(draws[0], image);
});
