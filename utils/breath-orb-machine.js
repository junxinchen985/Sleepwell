/**
 * 呼吸光团 4-7-8 状态机
 * ---------------------------------------------------------------------------
 * 只处理时间推进与视觉参数，不依赖 wx.*，方便单元测试。
 * 页面层按固定频率读取 updateSession()，因此息屏、切后台或掉帧后
 * 仍能根据真实时间自动修正到正确阶段。
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
const PHASE_LABELS = {
  inhale: '吸气',
  hold: '屏息',
  exhale: '呼气'
};
const DEFAULT_SUBTITLE = '放松身心，回到当下';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(from, to, progress) {
  return from + (to - from) * progress;
}

function easeOutCubic(progress) {
  const p = clamp(progress, 0, 1);
  return 1 - Math.pow(1 - p, 3);
}

function easeInOutCubic(progress) {
  const p = clamp(progress, 0, 1);
  return p < 0.5
    ? 4 * p * p * p
    : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function normalizeDurations(options) {
  const source = options || {};
  return {
    inhale: Math.max(1, Number(source.inhaleMs) || PHASE_SECONDS.inhale * 1000),
    hold: Math.max(0, Number(source.holdMs) || PHASE_SECONDS.hold * 1000),
    exhale: Math.max(1, Number(source.exhaleMs) || PHASE_SECONDS.exhale * 1000)
  };
}

function totalCycleMs(session) {
  return PHASE_SEQUENCE.reduce((sum, phase) => sum + session.durations[phase], 0);
}

function phaseOffsetMs(session, phaseIndex) {
  let offset = 0;
  for (let index = 0; index < phaseIndex; index += 1) {
    offset += session.durations[PHASE_SEQUENCE[index]];
  }
  return offset;
}

function createSession(options) {
  return {
    running: false,
    phase: PHASES.IDLE,
    phaseIndex: -1,
    cycle: 0,
    startedAt: 0,
    phaseStartedAt: 0,
    phaseEndsAt: 0,
    phaseProgress: 0,
    remainingSeconds: 0,
    durations: normalizeDurations(options)
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
  session.phaseEndsAt = startedAt + session.durations.inhale;
  session.phaseProgress = 0;
  session.remainingSeconds = Math.ceil(session.durations.inhale / 1000);
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
  const cycleMs = totalCycleMs(session);
  const cycle = Math.floor(elapsedMs / cycleMs);
  let cursor = elapsedMs - cycle * cycleMs;
  let phaseIndex = PHASE_SEQUENCE.length - 1;

  for (let index = 0; index < PHASE_SEQUENCE.length; index += 1) {
    const duration = session.durations[PHASE_SEQUENCE[index]];
    if (cursor < duration || index === PHASE_SEQUENCE.length - 1) {
      phaseIndex = index;
      break;
    }
    cursor -= duration;
  }

  const phase = PHASE_SEQUENCE[phaseIndex];
  const duration = session.durations[phase];
  const previousPhase = session.phase;
  const previousCycle = session.cycle;
  const phaseStartedAt = session.startedAt + cycle * cycleMs + phaseOffsetMs(session, phaseIndex);
  const phaseEndsAt = phaseStartedAt + duration;

  session.phase = phase;
  session.phaseIndex = phaseIndex;
  session.cycle = cycle;
  session.phaseStartedAt = phaseStartedAt;
  session.phaseEndsAt = phaseEndsAt;
  session.phaseProgress = clamp(cursor / duration, 0, 1);
  session.remainingSeconds = Math.max(1, Math.ceil((phaseEndsAt - current) / 1000));

  return {
    phase: phase,
    phaseIndex: phaseIndex,
    phaseProgress: session.phaseProgress,
    remainingSeconds: session.remainingSeconds,
    cycle: cycle,
    elapsedMs: elapsedMs,
    phaseChanged: phase !== previousPhase,
    cycleChanged: cycle !== previousCycle
  };
}

function phasePrompt(phase, remainingSeconds) {
  const label = PHASE_LABELS[phase];
  if (!label) return DEFAULT_SUBTITLE;
  return `${label}${Math.max(1, Number(remainingSeconds) || 1)}秒`;
}

/**
 * 把阶段进度转换成设计图的呼吸参数。
 * 只保留聚拢、亮度、整体尺寸和旋转速度，不再生成水波位移。
 */
function getMotionState(phase, progress) {
  const p = clamp(Number(progress) || 0, 0, 1);

  if (phase === PHASES.INHALE) {
    const swell = easeOutCubic(p);
    const brighten = easeOutCubic(p);
    return {
      gather: lerp(0.04, 0.72, swell),
      brightness: lerp(0.74, 0.95, brighten),
      scale: 1,
      rotationSpeed: lerp(0.085, 0.135, brighten)
    };
  }

  if (phase === PHASES.HOLD) {
    return {
      gather: 0.84,
      brightness: 0.98,
      scale: 1,
      rotationSpeed: 0.175
    };
  }

  if (phase === PHASES.EXHALE) {
    const soften = easeOutCubic(p);
    return {
      gather: lerp(0.84, 0.04, soften),
      brightness: lerp(0.98, 0.74, soften),
      scale: 1,
      rotationSpeed: lerp(0.175, 0.085, soften)
    };
  }

  return {
    gather: 0.04,
    brightness: 0.74,
    scale: 1,
    rotationSpeed: 0.085
  };
}

module.exports = {
  PHASES,
  PHASE_SEQUENCE,
  PHASE_SECONDS,
  PHASE_LABELS,
  DEFAULT_SUBTITLE,
  clamp,
  lerp,
  easeOutCubic,
  easeInOutCubic,
  createSession,
  startSession,
  stopSession,
  updateSession,
  phasePrompt,
  getMotionState,
  totalCycleMs
};
