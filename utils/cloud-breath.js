const PHASES = {
  IDLE: 'idle',
  INHALE: 'inhale',
  HOLD: 'hold',
  EXHALE: 'exhale'
};

const PHASE_LABELS = {
  idle: '点击开始',
  inhale: '吸气',
  hold: '屏气',
  exhale: '吐气'
};

const DEFAULT_SUBTITLE = '放松身心，回到当下';
const COMPLETION_SUBTITLE = '练习完成，回到当下';

const DEFAULT_RHYTHM = {
  id: '478',
  name: '4-7-8',
  inhaleSeconds: 4,
  holdSeconds: 7,
  exhaleSeconds: 8
};

const RHYTHMS = [
  DEFAULT_RHYTHM,
  {
    id: 'soothe',
    name: '舒缓 4-0-6',
    inhaleSeconds: 4,
    holdSeconds: 0,
    exhaleSeconds: 6
  },
  {
    id: 'balance',
    name: '平衡 4-0-4',
    inhaleSeconds: 4,
    holdSeconds: 0,
    exhaleSeconds: 4
  },
  {
    id: 'stretch',
    name: '舒展 5-0-7',
    inhaleSeconds: 5,
    holdSeconds: 0,
    exhaleSeconds: 7
  }
];

const TARGET_CYCLE_OPTIONS = [3, 6, 9, 12];
const DEFAULT_TARGET_CYCLES = 6;

function secondsToMs(value, fallbackMs, allowZero) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallbackMs;
  if (!allowZero && number === 0) return fallbackMs;
  return Math.round(number * 1000);
}

function resolveRhythm(settings) {
  const source = settings || {};
  const preset = RHYTHMS.find((item) => item.id === source.rhythm);
  const rhythm = preset || DEFAULT_RHYTHM;
  return {
    id: source.rhythm || rhythm.id,
    name: rhythm.name,
    inhaleSeconds: Number(source.inhaleSeconds) || rhythm.inhaleSeconds,
    holdSeconds: source.holdSeconds == null ? rhythm.holdSeconds : Number(source.holdSeconds),
    exhaleSeconds: Number(source.exhaleSeconds) || rhythm.exhaleSeconds,
    inhaleMs: secondsToMs(source.inhaleSeconds, rhythm.inhaleSeconds * 1000, false),
    holdMs: secondsToMs(source.holdSeconds, rhythm.holdSeconds * 1000, true),
    exhaleMs: secondsToMs(source.exhaleSeconds, rhythm.exhaleSeconds * 1000, false)
  };
}

function resolveTargetCycles(settings) {
  const value = Number(settings && settings.targetCycles);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_TARGET_CYCLES;
  return Math.max(1, Math.min(30, Math.floor(value)));
}

function phaseDurationMs(rhythm, phase) {
  const source = rhythm || DEFAULT_RHYTHM;
  if (phase === PHASES.INHALE) return Math.max(1000, Number(source.inhaleMs) || 4000);
  if (phase === PHASES.HOLD) return Math.max(0, Number(source.holdMs) || 0);
  if (phase === PHASES.EXHALE) return Math.max(1000, Number(source.exhaleMs) || 8000);
  return 0;
}

function nextPhase(phase) {
  if (phase === PHASES.INHALE) return PHASES.HOLD;
  if (phase === PHASES.HOLD) return PHASES.EXHALE;
  return PHASES.IDLE;
}

function phasePrompt(phase, remainingSeconds) {
  const seconds = Math.max(1, Math.ceil(Number(remainingSeconds) || 0));
  if (phase === PHASES.INHALE) return `吸气 ${seconds} 秒`;
  if (phase === PHASES.HOLD) return `屏气 ${seconds} 秒`;
  if (phase === PHASES.EXHALE) return `吐气 ${seconds} 秒`;
  return DEFAULT_SUBTITLE;
}

function themeVars(rhythm) {
  const source = rhythm || resolveRhythm({});
  return [
    `--cloud-inhale-duration:${Math.max(1000, source.inhaleMs)}ms;`,
    `--cloud-hold-duration:${Math.max(0, source.holdMs)}ms;`,
    `--cloud-exhale-duration:${Math.max(1000, source.exhaleMs)}ms;`
  ].join('');
}

function buildSettingsRows(settings, rhythm, targetCycles) {
  const source = settings || {};
  const currentRhythm = rhythm || resolveRhythm(source);
  const target = targetCycles || resolveTargetCycles(source);
  return [
    {
      id: 'rhythm',
      type: 'select',
      label: '呼吸节奏',
      value: currentRhythm.name
    },
    {
      id: 'targetCycles',
      type: 'select',
      label: '呼吸次数',
      value: `${target} 次`
    },
    {
      id: 'hapticEnabled',
      type: 'switch',
      label: '触觉反馈',
      checked: source.hapticEnabled !== false
    },
    {
      id: 'soundEnabled',
      type: 'switch',
      label: '声音（微风）',
      checked: source.soundEnabled === true
    },
    {
      id: 'endSoundEnabled',
      type: 'switch',
      label: '结束提示音',
      checked: source.endSoundEnabled === true
    }
  ];
}

module.exports = {
  PHASES,
  PHASE_LABELS,
  DEFAULT_SUBTITLE,
  COMPLETION_SUBTITLE,
  DEFAULT_RHYTHM,
  DEFAULT_TARGET_CYCLES,
  RHYTHMS,
  TARGET_CYCLE_OPTIONS,
  resolveRhythm,
  resolveTargetCycles,
  phaseDurationMs,
  nextPhase,
  phasePrompt,
  themeVars,
  buildSettingsRows
};
