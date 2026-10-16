const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PHASES,
  resolveRhythm,
  resolveTargetCycles,
  phaseDurationMs,
  nextPhase,
  phasePrompt,
  buildSettingsRows
} = require('../utils/cloud-breath');

test('默认使用 4-7-8 与六次目标', () => {
  const rhythm = resolveRhythm({});
  assert.equal(rhythm.inhaleMs, 4000);
  assert.equal(rhythm.holdMs, 7000);
  assert.equal(rhythm.exhaleMs, 8000);
  assert.equal(resolveTargetCycles({}), 6);
});

test('阶段按吸气、屏息、呼气推进', () => {
  assert.equal(nextPhase(PHASES.INHALE), PHASES.HOLD);
  assert.equal(nextPhase(PHASES.HOLD), PHASES.EXHALE);
  assert.equal(nextPhase(PHASES.EXHALE), PHASES.IDLE);
  assert.equal(phaseDurationMs(resolveRhythm({}), PHASES.EXHALE), 8000);
  assert.equal(phasePrompt(PHASES.INHALE, 4), '吸气 4 秒');
  assert.equal(phasePrompt(PHASES.HOLD, 7), '屏气 7 秒');
  assert.equal(phasePrompt(PHASES.EXHALE, 8), '吐气 8 秒');
});

test('设置列表按 Figma 节点数组结构生成', () => {
  const rows = buildSettingsRows({}, resolveRhythm({}), 6);
  assert.deepEqual(rows.map((item) => item.id), [
    'rhythm',
    'targetCycles',
    'hapticEnabled',
    'soundEnabled',
    'endSoundEnabled'
  ]);
  assert.equal(rows[0].type, 'select');
  assert.equal(rows[2].type, 'switch');
  assert.equal(rows[2].checked, true);
});
