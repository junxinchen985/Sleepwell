/**
 * 萤火虫粒子系统 + 呼吸阶段机（纯逻辑，不依赖 wx.*，可直接单测）
 * ---------------------------------------------------------------------------
 * 两层结构：
 *   1. 呼吸阶段机 session：把「吸气 → 屏气 → 呼气」翻译成 0~1 的汇聚进度 gather
 *   2. 粒子推进 stepParticle：把 gather 翻译成每只萤火虫的位置、大小、透明度
 *
 * 想调节奏只改两处：
 *   · RHYTHM 默认秒数（4-7-8）
 *   · MOTION 里的粒子物理参数
 */

// ---------------------------------------------------------------------------
// 一、动效令牌
// ---------------------------------------------------------------------------

/** 呼吸节奏默认值（秒）。会从小程序设置里覆盖 */
const RHYTHM = { inhale: 4, hold: 7, exhale: 8 };

const MOTION = {
  // 汇聚形态
  gatherRadiusRatio: 0.18,  // 吸到底时半径收缩到散落半径的 18%
  gatherSpread: 0.55,       // 每只萤火虫最终落点再乘 0.55~1.6，形成一团松散的云而不是一个钢圈
  gatherDelayMax: 0.22,     // 每颗粒子 0~22% 的启动延迟，制造"先后被吸进去"的层次

  // 主光球
  breathPeriod: 6500,       // 静止时的呼吸周期（毫秒）
  breathAmplitude: 0.05,    // 静止呼吸振幅 ±5%
  gatherScaleBoost: 1.14,   // 吸到底时额外放大
  holdTremor: 1.3,          // 屏气时的颤动强度（0 = 完全静止）

  // 绘制
  gatherThreshold: 0.5,     // 进度过半即视为"已汇入"，仅用于统计
  // 上限必须 ≥ 设计稿的粒子数，否则会被静默截断
  // （参考图需要 140 颗，这里留到 160 的余量）
  maxParticles: 160
};

const PHASES = {
  IDLE: 'idle',
  INHALE: 'inhale',
  HOLD: 'hold',
  EXHALE: 'exhale',
  COMPLETED: 'completed'
};

const DEFAULT_PALETTE = ['#FFD700', '#FFE08A', '#FFCB7D'];

// ---------------------------------------------------------------------------
// 二、基础数学与缓动
// ---------------------------------------------------------------------------

function clamp(v, min, max) {
  return v < min ? min : (v > max ? max : v);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * 吸气缓动：ease-out cubic。
 * 起步快、收尾慢——像一口气被"吸"进去，最后轻轻落定，全程不能是匀速。
 */
function easeOutCubic(t) {
  const x = clamp(t, 0, 1);
  return 1 - Math.pow(1 - x, 3);
}

/**
 * 呼气缓动：ease-in-out cubic。
 * 起手轻、中段稳、末尾极缓，配合 8 秒时长，光点才会像蒲公英一样慢慢飘散，
 * 而不是一松开就"弹"回去。
 */
function easeInOutCubic(t) {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** 线性同余随机：同一 seed 得到同一片星云，设计稿可复现 */
function createRng(seed) {
  let s = (seed >>> 0) || 1;
  return function rng() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// 三、呼吸阶段机
//    IDLE ──按下──▶ INHALE ──▶ HOLD ──▶ EXHALE ──▶ (下一轮 INHALE | 完成)
// ---------------------------------------------------------------------------

/**
 * 建一次呼吸 session。
 * @param {object} options { inhale, hold, exhale, targetCycles, startCycle }
 */
function createSession(options) {
  const o = options || {};
  const rhythm = {
    inhale: o.inhale || RHYTHM.inhale,
    hold: o.hold == null ? RHYTHM.hold : o.hold,
    exhale: o.exhale || RHYTHM.exhale
  };
  return {
    phase: PHASES.IDLE,
    phaseStartedAt: 0,
    phaseDuration: rhythm.inhale,
    rhythm: rhythm,
    cycle: o.startCycle || 0,        // 已完成的呼吸轮数
    targetCycles: o.targetCycles || 6,
    gather: 0,                       // 0 = 完全散开，1 = 全部聚到中心
    tremor: 0,                       // 屏气颤动强度 0~1
    running: false
  };
}

/** 按下开始：从 IDLE 进入吸气 */
function startSession(session, now) {
  if (session.running) return false;
  session.running = true;
  enterPhase(session, PHASES.INHALE, now);
  return true;
}

/** 中途停止：回到完全散开的状态 */
function stopSession(session, now) {
  session.running = false;
  session.phase = PHASES.IDLE;
  session.phaseStartedAt = now;
  session.phaseDuration = 0;
  session.gather = 0;
  session.tremor = 0;
}

function enterPhase(session, phase, at) {
  session.phase = phase;
  session.phaseStartedAt = at;
  session.phaseDuration = phase === PHASES.INHALE ? session.rhythm.inhale
    : phase === PHASES.HOLD ? session.rhythm.hold
      : phase === PHASES.EXHALE ? session.rhythm.exhale
        : 0;
}

/**
 * 按当前阶段把 0~1 的时间进度翻译成 gather / tremor。
 * 这是整个动效的"节奏源头"，三段的曲线差异全部在这里。
 */
function applyPhase(session, t, now) {
  if (session.phase === PHASES.INHALE) {
    session.gather = easeOutCubic(t);        // 向内聚拢：快起慢收
    session.tremor = 0;
  } else if (session.phase === PHASES.HOLD) {
    session.gather = 1;                      // 一直集中在中心点
    // 轻微颤动：振幅走正弦，避免死板地"卡住不动"
    session.tremor = 0.55 + 0.45 * Math.sin((now / 1000) * 2 * Math.PI / 3.4);
  } else if (session.phase === PHASES.EXHALE) {
    session.gather = 1 - easeInOutCubic(t);  // 向外散开：起手轻、收尾极缓
    session.tremor = 0;
  } else if (session.phase === PHASES.IDLE || session.phase === PHASES.COMPLETED) {
    session.gather = 0;
    session.tremor = 0;
  }
}

/**
 * 每帧推进阶段机。
 * 用 while 是因为从后台切回来时可能一次跨过多个阶段，
 * guard 兜底防止极端情况下的死循环。
 * @returns {{phaseChanged:boolean, cycleChanged:boolean, finished:boolean}}
 */
function updateSession(session, now) {
  const result = { phaseChanged: false, cycleChanged: false, finished: false };
  if (!session.running) {
    session.gather = 0;
    session.tremor = 0;
    return result;
  }

  let guard = 0;
  while (guard++ < 8) {
    const elapsed = (now - session.phaseStartedAt) / 1000;
    const t = session.phaseDuration > 0 ? clamp(elapsed / session.phaseDuration, 0, 1) : 1;
    applyPhase(session, t, now);
    if (t < 1) break;

    // 用阶段边界时间推进，避免逐帧累积误差
    const boundary = session.phaseStartedAt + session.phaseDuration * 1000;
    if (session.phase === PHASES.INHALE) {
      enterPhase(session, PHASES.HOLD, boundary);
      result.phaseChanged = true;
      // 节奏为「深吸但不屏气」时，hold 为 0，直接进入呼气
      if (session.rhythm.hold <= 0) enterPhase(session, PHASES.EXHALE, boundary);
    } else if (session.phase === PHASES.HOLD) {
      enterPhase(session, PHASES.EXHALE, boundary);
      result.phaseChanged = true;
    } else if (session.phase === PHASES.EXHALE) {
      session.cycle += 1;
      result.cycleChanged = true;
      if (session.cycle >= session.targetCycles) {
        session.running = false;
        session.phase = PHASES.COMPLETED;
        session.phaseStartedAt = boundary;
        session.gather = 0;
        session.tremor = 0;
        result.finished = true;
        break;
      }
      enterPhase(session, PHASES.INHALE, boundary);
      result.phaseChanged = true;
    } else {
      break;
    }
  }
  return result;
}

/** 当前阶段剩余秒数（用于倒计时） */
function phaseRemaining(session, now) {
  if (!session.running || session.phaseDuration <= 0) return 0;
  const left = session.phaseDuration - (now - session.phaseStartedAt) / 1000;
  return Math.max(0, Math.ceil(left));
}

function phaseProgress(session, now) {
  if (!session.running || session.phaseDuration <= 0) return 0;
  return clamp((now - session.phaseStartedAt) / (session.phaseDuration * 1000), 0, 1);
}

/**
 * 主光球缩放。
 * 静止时按 6.5 秒正弦呼吸；进入呼吸循环后叠加一个缓慢的膨胀量，
 * 屏气时再叠一层极小的颤动，所以"屏住"也不会看起来像卡住了。
 */
function breathScale(now, gather, tremor) {
  const idle = 1 + MOTION.breathAmplitude * Math.sin((now / MOTION.breathPeriod) * Math.PI * 2);
  const boost = 1 + (MOTION.gatherScaleBoost - 1) * easeInOutCubic(gather);
  const pulse = 1 + (tremor || 0) * 0.018 * Math.sin((now / 1000) * 2 * Math.PI / 2.6);
  return idle * boost * pulse;
}

// ---------------------------------------------------------------------------
// 四、粒子
// ---------------------------------------------------------------------------

/**
 * 萤火虫粒子。
 * 用类而不是对象字面量：字段含义集中在构造函数里，
 * 以后要加字段（拖尾长度、色相偏移、个体缩放等）只改这一处。
 */
class Particle {
  constructor(seed, index, fieldRadius, rng) {
    const src = seed || {};

    // —— 落点：设计稿给的是比例，真机乘半径，因此与屏幕尺寸无关 ——
    // 半径用 sqrt 分布：半径的平方才是面积，sqrt 能让粒子在圆面上均匀铺开，
    // 形成参考图那种"一整片"的萤火虫群。
    // 若用线性或从较大半径起算，粒子会挤在同一圈上，看起来像一串"项链"。
    this.radiusRatio = src.radiusRatio == null
      ? 0.10 + Math.sqrt(rng()) * 0.86
      : src.radiusRatio;
    this.spreadR = this.radiusRatio * fieldRadius;
    this.radius = this.spreadR;

    // —— 尺寸 ——
    // Figma 里 FX/Firefly 的外框 = 辉光总直径，核心点要再乘 0.42，
    // 否则 14px 的组件会画成 21px 的大光球，整片星云会发白。
    // 尺寸刻意压小：140 颗的情况下，偏大的光点会连成一片糊光
    const sizeBase = src.sizeRatio
      ? clamp(src.sizeRatio * fieldRadius * 2 * 0.30, 1.2, 4.8)
      : 1.2 + rng() * 2.2;
    this.sizeBase = sizeBase;
    this.size = sizeBase;

    // —— 环绕：角速度带随机正负号，整片星云不会同步旋转 ——
    this.theta = src.theta == null ? rng() * Math.PI * 2 : src.theta;
    this.speed = src.speed == null
      ? (0.05 + rng() * 0.16) * (rng() > 0.5 ? 1 : -1)
      : src.speed * (index % 3 === 0 ? -1 : 1);

    // 每只萤火虫的最终落点不同 → 聚拢时是一团松散的云，不是一根钢圈
    this.gatherBias = MOTION.gatherSpread + rng() * 1.05;

    // —— 杂乱轨迹：两层正弦叠加，相位独立 ——
    this.wobbleAmp = src.wobbleAmp == null ? 1.5 + rng() * 3.5 : src.wobbleAmp;
    this.wobbleFreq = 0.18 + rng() * 0.42;
    this.phase = rng() * Math.PI * 2;
    this.driftAmp = 2 + rng() * 6;
    this.driftFreq = 0.12 + rng() * 0.25;

    // —— 闪烁：独立频率与相位，聚拢时依然各自明灭 ——
    this.blinkFreq = src.blinkFreq == null ? 0.6 + rng() * 2.2 : src.blinkFreq;
    this.blinkPhase = src.blinkPhase == null ? rng() * Math.PI * 2 : src.blinkPhase;
    // 基础亮度整体抬一档：140 颗同时在场时，单颗偏暗会显得整片发灰
    this.alphaBase = clamp(src.opacity == null ? 0.45 + rng() * 0.50 : src.opacity, 0.12, 1);
    this.color = src.color || DEFAULT_PALETTE[Math.floor(rng() * DEFAULT_PALETTE.length)];

    // —— 生命周期：到点就地重生，让星云永远"活着" ——
    this.life = (src.life == null ? rng() : src.life) * 14;
    this.lifeSpan = 9 + rng() * 8;
    this.fade = 0;

    // —— 个体汇聚进度（带随机启动延迟）——
    this.delay = rng() * MOTION.gatherDelayMax;
    this.progress = 0;
    this.alpha = 0;

    // —— 位置 ——
    this.x = 0;
    this.y = 0;
    this.prevX = 0;
    this.prevY = 0;
    this.initialized = false;

    this.id = src.id || ('ff-' + index);
    this.index = index;
    this.state = src.state || 'floating';
  }
}

/** 兼容工厂写法：粒子池内部统一 new Particle */
function createParticle(seed, index, fieldRadius, rng) {
  return new Particle(seed, index, fieldRadius, rng);
}

/**
 * 组装粒子池：设计数据优先，不够就用同一套规则补齐，
 * 补齐出来的粒子遵守同样的运动学，所以 6 只设计稿也能在真机上跑出一片星空。
 */
function createPool(design, fieldRadius, options) {
  const opts = options || {};
  const desired = Math.min(opts.count || 24, MOTION.maxParticles);
  const rng = createRng(opts.seed || 20261013);
  const seeds = (design && design.particles) || [];
  const pool = [];
  for (let i = 0; i < desired; i++) {
    pool.push(createParticle(seeds[i] || {}, i, fieldRadius, rng));
  }
  return pool;
}

/** 生命周期结束就地重生（不新建对象，避免 GC 抖动） */
function respawn(p, fieldRadius, rng) {
  p.theta = rng() * Math.PI * 2;
  p.radiusRatio = 0.10 + Math.sqrt(rng()) * 0.86;
  p.spreadR = p.radiusRatio * fieldRadius;
  p.gatherBias = MOTION.gatherSpread + rng() * 1.05;
  p.speed = (0.05 + rng() * 0.16) * (rng() > 0.5 ? 1 : -1);
  p.wobbleAmp = 1.5 + rng() * 3.5;
  p.wobbleFreq = 0.18 + rng() * 0.42;
  p.phase = rng() * Math.PI * 2;
  p.blinkFreq = 0.6 + rng() * 2.2;
  p.blinkPhase = rng() * Math.PI * 2;
  p.alphaBase = 0.45 + rng() * 0.50;
  p.sizeBase = 1.2 + rng() * 2.2;
  p.life = 0;
  p.lifeSpan = 9 + rng() * 8;
  p.fade = 0;
  return p;
}

/**
 * 推进一只萤火虫。
 * @param {object} p      粒子
 * @param {number} dt     距上一帧的秒数
 * @param {number} t      页面运行总秒数
 * @param {number} gather 汇聚进度（0 散开 / 1 收拢）
 * @param {object} ctx    { cx, cy, gatherCx, gatherCy, fieldRadius, rng, tremor }
 */
function stepParticle(p, dt, t, gather, ctx) {
  const tremor = ctx.tremor || 0;

  // —— 0. 生命周期 ——
  p.life += dt;
  if (p.life >= p.lifeSpan) respawn(p, ctx.fieldRadius, ctx.rng);
  p.fade = clamp(p.fade + dt / 1.2, 0, 1);   // 前 1.2 秒淡入，新生的不会"啪"地出现

  // —— 1. 个体汇聚进度 ——
  //    每只萤火虫有独立的启动延迟，把全局进度平移后再归一化，
  //    于是它们不是同时到位，而是一只接一只被吸进去。
  const local = clamp((gather - p.delay) / (1 - p.delay), 0, 1);
  p.progress = easeInOutCubic(local);

  // —— 2. 角度 ——
  //    越靠外的粒子角速度越大；聚拢过程中额外加速，像被中心"拉"了一把。
  p.theta += p.speed * dt * (0.6 + p.radiusRatio) * (1 + p.progress * 0.7);

  // —— 3. 半径：散落半径 ←→ 汇聚半径 ——
  const gatherR = MOTION.gatherRadiusRatio * ctx.fieldRadius * p.gatherBias;
  const radiusMid = lerp(p.spreadR, gatherR, p.progress);

  // —— 4. 杂乱轨迹：低频大弧线 + 高频抖动，相位独立 ——
  const wobble =
    Math.sin(t * p.wobbleFreq * Math.PI * 2 + p.phase) * p.wobbleAmp +
    Math.sin(t * p.wobbleFreq * 2.7 * Math.PI * 2 + p.phase * 1.9) * p.wobbleAmp * 0.35;

  // 聚拢时抖动收窄（画面才"聚得住"），但在中心保留一点点，避免变成死点
  const wobbleScale = lerp(1, 0.28, p.progress);
  p.radius = radiusMid + wobble * wobbleScale;

  // —— 5. 极坐标 → 屏幕坐标 ——
  //    yScale 把正圆轨道压成椭圆：参考图里萤火虫集中在中下部，
  //    用纵向压缩就能让粒子落在草丛一带，而不必写死每个点的坐标。
  const yScale = ctx.yScale == null ? 1 : ctx.yScale;
  const sin = Math.sin(p.theta);
  const cos = Math.cos(p.theta);
  const gatherCx = ctx.gatherCx == null ? ctx.cx : ctx.gatherCx;
  const gatherCy = ctx.gatherCy == null ? ctx.cy : ctx.gatherCy;
  // 只让轨道中心随聚拢进度移到屏幕中央，不改变散落形态与运动曲线。
  const centerX = lerp(ctx.cx, gatherCx, p.progress);
  const centerY = lerp(ctx.cy, gatherCy, p.progress);
  const x = centerX + cos * p.radius;
  const y = centerY + sin * p.radius * yScale +
    Math.sin(t * p.driftFreq * Math.PI * 2 + p.phase) * p.driftAmp;

  p.prevX = p.initialized ? p.x : x;
  p.prevY = p.initialized ? p.y : y;
  p.x = x;
  p.y = y;
  p.initialized = true;

  // —— 6. 透明度与尺寸 ——
  //    闪烁：每只萤火虫自己的频率与相位
  const blink = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * p.blinkFreq * Math.PI * 2 + p.blinkPhase));
  //    聚拢提亮：越靠近中心越亮一点
  const brighten = 1 + p.progress * 0.30;
  //    屏气颤动：各粒子相位不同，形成细碎的明灭而不是整体闪烁
  const tremble = 1 + tremor * 0.12 * Math.sin(t * 2.6 + p.blinkPhase);

  p.alpha = clamp(p.alphaBase * blink * brighten * tremble * p.fade, 0, 1);
  p.size = p.sizeBase * (1 + p.progress * 0.30) * (1 + tremor * 0.06 * Math.sin(t * 2.0 + p.phase));
  return p;
}

function stepPool(pool, dt, t, gather, ctx) {
  for (let i = 0; i < pool.length; i++) stepParticle(pool[i], dt, t, gather, ctx);
  return pool;
}

/** 已汇入中心的粒子数（统计用，当前页面用它做调试信息） */
function countGathered(pool) {
  let n = 0;
  for (let i = 0; i < pool.length; i++) {
    if (pool[i].progress >= MOTION.gatherThreshold) n++;
  }
  return n;
}

module.exports = {
  RHYTHM,
  MOTION,
  PHASES,
  DEFAULT_PALETTE,
  clamp,
  lerp,
  easeOutCubic,
  easeInOutCubic,
  createRng,
  createSession,
  startSession,
  stopSession,
  updateSession,
  phaseRemaining,
  phaseProgress,
  breathScale,
  Particle,
  createParticle,
  createPool,
  respawn,
  stepParticle,
  stepPool,
  countGathered
};
