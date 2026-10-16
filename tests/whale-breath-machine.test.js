const test = require('node:test');
const assert = require('node:assert/strict');

const machine = require('../utils/whale-breath-machine');

const P = machine.PHASES;

test('鲸鱼呼吸从吸气 4s 开始，并严格按 4-7-8 循环', () => {
  const session = machine.createSession();
  machine.startSession(session, 0);

  const checks = [
    [0, P.INHALE, 4, '吸气 4s'],
    [1000, P.INHALE, 3, '吸气 3s'],
    [2000, P.INHALE, 2, '吸气 2s'],
    [3000, P.INHALE, 1, '吸气 1s'],
    [4000, P.HOLD, 7, '屏气 7s'],
    [9000, P.HOLD, 2, '屏气 2s'],
    [10000, P.HOLD, 1, '屏气 1s'],
    [11000, P.EXHALE, 8, '吐气 8s'],
    [18000, P.EXHALE, 1, '吐气 1s'],
    [19000, P.INHALE, 4, '吸气 4s']
  ];

  checks.forEach((check) => {
    const update = machine.updateSession(session, check[0]);
    const prompt = machine.phasePrompt(update.phase, update.remainingSeconds);
    assert.equal(update.phase, check[1]);
    assert.equal(update.remainingSeconds, check[2]);
    assert.equal(prompt, check[3]);
    assert.equal(prompt.includes('...'), false);
  });
});

test('跨阶段跳时后仍按真实时间自我校正', () => {
  const session = machine.createSession();
  machine.startSession(session, 0);

  let update = machine.updateSession(session, 3999);
  assert.equal(update.phase, P.INHALE);
  assert.equal(update.remainingSeconds, 1);

  update = machine.updateSession(session, 4000);
  assert.equal(update.phase, P.HOLD);
  assert.equal(update.phaseChanged, true);

  update = machine.updateSession(session, 44000);
  assert.equal(update.cycle, 2);
  assert.equal(update.phase, P.HOLD);
  assert.equal(update.remainingSeconds, 5);
});

test('场景目标值符合吸光亮、屏息悬停、吐气回落的联动方向', () => {
  const idle = machine.getSceneState(P.IDLE, 1);
  const inhaleEnd = machine.getSceneState(P.INHALE, 1);
  const hold = machine.getSceneState(P.HOLD, 1);
  const exhaleEnd = machine.getSceneState(P.EXHALE, 1);

  assert.ok(inhaleEnd.photoScale > idle.photoScale);
  assert.ok(inhaleEnd.photoY < idle.photoY);
  assert.ok(inhaleEnd.brightness > idle.brightness);
  assert.ok(inhaleEnd.raysOpacity > idle.raysOpacity);
  assert.equal(hold.bubbleMode, 'hold');
  assert.ok(exhaleEnd.photoScale < hold.photoScale);
  assert.ok(exhaleEnd.photoY > hold.photoY);
  assert.ok(exhaleEnd.brightness < hold.brightness);
  assert.equal(exhaleEnd.bubbleMode, 'sink');
});

test('CSS 场景样式包含阶段对应缓动时长', () => {
  const inhale = machine.buildSceneStyles(P.INHALE);
  const hold = machine.buildSceneStyles(P.HOLD);
  const exhale = machine.buildSceneStyles(P.EXHALE);

  assert.match(inhale.photoStyle, /4000ms/);
  assert.match(hold.photoStyle, /850ms/);
  assert.match(exhale.photoStyle, /8000ms/);
  assert.match(inhale.photoStyle, /cubic-bezier/);
  assert.match(exhale.raysStyle, /opacity:0\.350/);
});

test('停止后回到待机并清空剩余秒数', () => {
  const session = machine.createSession();
  machine.startSession(session, 0);
  machine.updateSession(session, 5000);
  machine.stopSession(session);

  assert.equal(session.running, false);
  assert.equal(session.phase, P.IDLE);
  assert.equal(session.remainingSeconds, 0);
  assert.equal(machine.phasePrompt(session.phase, session.remainingSeconds), machine.DEFAULT_TITLE);
});
