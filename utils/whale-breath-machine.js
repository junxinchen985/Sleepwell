/**
 * 深海鲸鱼 4-7-8 呼吸状态机
 * ---------------------------------------------------------------------------
 * 只负责时间推进、倒计时文案和场景目标值，不依赖 wx.*，便于单元测试。
 */

const PHASES = {
  IDLE: 'idle',
  INHALE: 'inhale',
  HOLD: 'hold',
  EXHALE: 'exhale'
};

const PHASE_SEQUENCE = [PHASES.INHALE, PHASES.HOLD, PHASES.EXHALE];
const PHASE_SECONDS = {
  inhale: 4,
  hold: 7,
  exhale: 8
};
const PHASE_MS = {
  inhale: PHASE_SECONDS.inhale * 1000,
  hold: PHASE_SECONDS.hold * 1000,
  exhale: PHASE_SECONDS.exhale * 1000
};
const PHASE_LABELS = {
  inhale: '吸气',
  hold: '屏气',
  exhale: '吐气'
};
const PHASE_SUBTITLES = {
  inhale: '缓缓向前游动，让身体舒展开',
  hold: '停在光里，保持这一口气',
  exhale: '慢慢下沉，把紧张交还给海水'
};
const DEFAULT_TITLE = '深呼吸';
const DEFAULT_SUBTITLE = '放松身心，回到当下';

const SCENE_STATES = {
  idle: {
    photoScale: 1,
    photoY: 0,
    photoRotation: -0.15,
    photoSkew: 0,
    brightness: 0.96,
    saturate: 1,
    raysOpacity: 0.58,
    rippleOpacity: 0.42,
    bubbleOpacity: 0.68,
    bubbleMode: 'hold'
  },
  inhale: {
    photoScale: 1.028,
    photoY: -1.6,
    photoRotation: -0.62,
    photoSkew: 0.5,
    brightness: 1.06,
    saturate: 1.08,
    raysOpacity: 1,
    rippleOpacity: 0.95,
    bubbleOpacity: 1,
    bubbleMode: 'rise'
  },
  hold: {
    photoScale: 1.032,
    photoY: -2.1,
    photoRotation: -0.38,
    photoSkew: 0.3,
    brightness: 1.08,
    saturate: 1.1,
    raysOpacity: 1,
    rippleOpacity: 0.82,
    bubbleOpacity: 0.9,
    bubbleMode: 'hold'
  },
  exhale: {
    photoScale: 0.982,
    photoY: 1.35,
    photoRotation: 0.48,
    photoSkew: -0.44,
    brightness: 0.88,
    saturate: 0.98,
    raysOpacity: 0.35,
    rippleOpacity: 0.35,
    bubbleOpacity: 0.42,
    bubbleMode: 'sink'
  }
};

const PHASE_TRANSITION_MS = {
  idle: 900,
  inhale: PHASE_MS.inhale,
  hold: 850,
  exhale: PHASE_MS.exhale
};

const EASING = 'cubic-bezier(0.37, 0, 0.63, 1)';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(from, to, progress) {
  return from + (to - from) * progress;
}

function easeInOutSine(progress) {
  const p = clamp(Number(progress) || 0, 0, 1);
  return -(Math.cos(Math.PI * p) - 1) / 2;
}

function createSession() {
  return {
    running: false,
    phase: PHASES.IDLE,
    phaseIndex: -1,
    cycle: 0,
    startedAt: 0,
    phaseStartedAt: 0,
    phaseEndsAt: 0,
    phaseProgress: 0,
    remainingSeconds: 0
  };
}

function startSession(session, now) {
  const startedAt = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  session.running = true;
  session.phase = PHASES.INHALE;
  session.phaseIndex = 0;
  session.cycle = 0;
  session.startedAt = startedAt;
  session.phaseStartedAt = startedAt;
  session.phaseEndsAt = startedAt + PHASE_MS.inhale;
  session.phaseProgress = 0;
  session.remainingSeconds = PHASE_SECONDS.inhale;
  return session;
}

function stopSession(session) {
  session.running = false;
  session.phase = PHASES.IDLE;
  session.phaseIndex = -1;
  session.cycle = 0;
  session.startedAt = 0;
  session.phaseStartedAt = 0;
  session.phaseEndsAt = 0;
  session.phaseProgress = 0;
  session.remainingSeconds = 0;
  return session;
}

function totalCycleMs() {
  return PHASE_MS.inhale + PHASE_MS.hold + PHASE_MS.exhale;
}

function phaseOffsetMs(phaseIndex) {
  let offset = 0;
  for (let index = 0; index < phaseIndex; index += 1) {
    offset += PHASE_MS[PHASE_SEQUENCE[index]];
  }
  return offset;
}

function updateSession(session, now) {
  if (!session || !session.running) {
    return {
      phase: PHASES.IDLE,
      phaseIndex: -1,
      phaseProgress: 0,
      remainingSeconds: 0,
      cycle: 0,
      elapsedMs: 0,
      phaseChanged: false,
      cycleChanged: false
    };
  }

  const current = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const elapsedMs = Math.max(0, current - session.startedAt);
  const cycleMs = totalCycleMs();
  const cycle = Math.floor(elapsedMs / cycleMs);
  let cursor = elapsedMs - cycle * cycleMs;
  let phaseIndex = PHASE_SEQUENCE.length - 1;

  for (let index = 0; index < PHASE_SEQUENCE.length; index += 1) {
    const duration = PHASE_MS[PHASE_SEQUENCE[index]];
    if (cursor < duration || index === PHASE_SEQUENCE.length - 1) {
      phaseIndex = index;
      break;
    }
    cursor -= duration;
  }

  const phase = PHASE_SEQUENCE[phaseIndex];
  const duration = PHASE_MS[phase];
  const previousPhase = session.phase;
  const previousCycle = session.cycle;
  const phaseStartedAt = session.startedAt + cycle * cycleMs + phaseOffsetMs(phaseIndex);
  const phaseEndsAt = phaseStartedAt + duration;

  session.phase = phase;
  session.phaseIndex = phaseIndex;
  session.cycle = cycle;
  session.phaseStartedAt = phaseStartedAt;
  session.phaseEndsAt = phaseEndsAt;
  session.phaseProgress = clamp(cursor / duration, 0, 1);
  session.remainingSeconds = Math.max(1, Math.ceil((phaseEndsAt - current) / 1000));

  return {
    phase,
    phaseIndex,
    phaseProgress: session.phaseProgress,
    remainingSeconds: session.remainingSeconds,
    cycle,
    elapsedMs,
    phaseChanged: phase !== previousPhase,
    cycleChanged: cycle !== previousCycle
  };
}

function phasePrompt(phase, remainingSeconds) {
  const label = PHASE_LABELS[phase];
  if (!label) return DEFAULT_TITLE;
  return `${label} ${Math.max(1, Number(remainingSeconds) || 1)}s`;
}

function phaseSubtitle(phase) {
  return PHASE_SUBTITLES[phase] || DEFAULT_SUBTITLE;
}

function getSceneState(phase, progress) {
  const target = SCENE_STATES[phase] || SCENE_STATES.idle;
  if (phase !== PHASES.INHALE && phase !== PHASES.EXHALE) return target;

  const from = phase === PHASES.INHALE ? SCENE_STATES.idle : SCENE_STATES.hold;
  const amount = easeInOutSine(progress);
  return {
    photoScale: lerp(from.photoScale, target.photoScale, amount),
    photoY: lerp(from.photoY, target.photoY, amount),
    photoRotation: lerp(from.photoRotation, target.photoRotation, amount),
    photoSkew: lerp(from.photoSkew, target.photoSkew, amount),
    brightness: lerp(from.brightness, target.brightness, amount),
    saturate: lerp(from.saturate, target.saturate, amount),
    raysOpacity: lerp(from.raysOpacity, target.raysOpacity, amount),
    rippleOpacity: lerp(from.rippleOpacity, target.rippleOpacity, amount),
    bubbleOpacity: lerp(from.bubbleOpacity, target.bubbleOpacity, amount),
    bubbleMode: target.bubbleMode
  };
}

function fixed(value, digits) {
  return Number(value).toFixed(digits);
}

function buildSceneStyles(phase) {
  const state = getSceneState(phase, 1);
  const duration = PHASE_TRANSITION_MS[phase] || PHASE_TRANSITION_MS.idle;
  return {
    photoStyle: [
      `transform:translate3d(0,${fixed(state.photoY, 3)}%,0) rotate(${fixed(state.photoRotation, 3)}deg) skewX(${fixed(state.photoSkew, 3)}deg) scale(${fixed(state.photoScale, 4)});`,
      `filter:brightness(${fixed(state.brightness, 3)}) saturate(${fixed(state.saturate, 3)});`,
      `transition:transform ${duration}ms ${EASING},filter ${duration}ms ${EASING};`
    ].join(''),
    raysStyle: `opacity:${fixed(state.raysOpacity, 3)};transition:opacity ${duration}ms ${EASING};`,
    rippleStyle: `opacity:${fixed(state.rippleOpacity, 3)};transition:opacity ${duration}ms ${EASING};`,
    bubbleStyle: `opacity:${fixed(state.bubbleOpacity, 3)};transition:opacity ${duration}ms ${EASING};`,
    bubbleMode: state.bubbleMode,
    durationMs: duration
  };
}

module.exports = {
  PHASES,
  PHASE_SEQUENCE,
  PHASE_SECONDS,
  PHASE_MS,
  PHASE_LABELS,
  PHASE_SUBTITLES,
  PHASE_TRANSITION_MS,
  DEFAULT_TITLE,
  DEFAULT_SUBTITLE,
  clamp,
  lerp,
  easeInOutSine,
  createSession,
  startSession,
  stopSession,
  updateSession,
  phasePrompt,
  phaseSubtitle,
  getSceneState,
  buildSceneStyles,
  totalCycleMs
};
