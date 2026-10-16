/**
 * 页面层呼吸控制器
 * ---------------------------------------------------------------------------
 * 把状态机输出整理成页面可直接渲染的 view model，避免页面自行拼装阶段文案。
 */

const machine = require('./whale-breath-machine');

function createView(update, forcePhaseChanged) {
  const running = update.phase !== machine.PHASES.IDLE;
  return {
    running,
    phase: update.phase,
    phaseIndex: update.phaseIndex,
    cycle: update.cycle,
    remainingSeconds: update.remainingSeconds,
    phaseChanged: Boolean(forcePhaseChanged || update.phaseChanged),
    cycleChanged: Boolean(update.cycleChanged),
    title: machine.DEFAULT_TITLE,
    promptText: running
      ? machine.phasePrompt(update.phase, update.remainingSeconds)
      : machine.DEFAULT_SUBTITLE,
    statusText: running
      ? machine.phasePrompt(update.phase, update.remainingSeconds)
      : machine.DEFAULT_SUBTITLE,
    subtitle: running ? machine.phaseSubtitle(update.phase) : machine.DEFAULT_SUBTITLE,
    scene: machine.buildSceneStyles(update.phase)
  };
}

function createBreathingController() {
  const session = machine.createSession();

  function snapshot() {
    return createView(machine.updateSession(session, Date.now()), false);
  }

  return {
    start(now) {
      machine.startSession(session, now);
      return createView(machine.updateSession(session, now), true);
    },

    sync(now) {
      return createView(machine.updateSession(session, now), false);
    },

    stop() {
      machine.stopSession(session);
      return createView(machine.updateSession(session, Date.now()), true);
    },

    snapshot,

    isRunning() {
      return session.running;
    },

    getSession() {
      return session;
    }
  };
}

module.exports = Object.assign({}, machine, {
  createView,
  createBreathingController
});
