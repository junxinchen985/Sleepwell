/**
 * 粒子系统 + 呼吸阶段机自测
 * 运行：node --test outputs/miniprogram/test/firefly-particles.test.js
 * 这一层不依赖 wx.*，动效逻辑改动后可即时回归。
 */

const test = require('node:test');
const assert = require('node:assert');

const fx = require('../utils/firefly-particles');
const design = require('../data/fireflies');

const FIELD_RADIUS = 195;
const P = fx.PHASES;

function sessionWith(options) {
  return fx.createSession(Object.assign({ inhale: 4, hold: 7, exhale: 8, targetCycles: 6 }, options || {}));
}

// ===========================================================================
// 一、缓动曲线
// ===========================================================================

test('吸气缓动 ease-out：端点精确、单调不减、前段推进明显更快', () => {
  assert.strictEqual(fx.easeOutCubic(0), 0);
  assert.strictEqual(fx.easeOutCubic(1), 1);
  let prev = -1;
  for (let i = 0; i <= 20; i++) {
    const v = fx.easeOutCubic(i / 20);
    assert.ok(v >= prev, '缓动必须单调不减');
    prev = v;
  }
  // ease-out 的特征：一半时间已经走完大半路程（不能用匀速）
  assert.ok(fx.easeOutCubic(0.5) > 0.7, '吸气应为快速启动，实际 ' + fx.easeOutCubic(0.5));
});

test('呼气缓动 ease-in-out：一半时间为一半路程，且起手极慢', () => {
  assert.strictEqual(fx.easeInOutCubic(0), 0);
  assert.strictEqual(fx.easeInOutCubic(1), 1);
  assert.ok(Math.abs(fx.easeInOutCubic(0.5) - 0.5) < 1e-9);
  // 前 20% 时间只走掉极少路程 → 松开后不会"弹"开
  assert.ok(fx.easeInOutCubic(0.2) < 0.06, '呼气起手应极缓，实际 ' + fx.easeInOutCubic(0.2));
});

// ===========================================================================
// 二、呼吸阶段机
// ===========================================================================

test('阶段顺序：吸气 → 屏气 → 呼气 → 下一轮吸气', () => {
  const s = sessionWith();
  assert.strictEqual(s.phase, P.IDLE);
  assert.strictEqual(fx.startSession(s, 0), true);
  assert.strictEqual(s.phase, P.INHALE);

  // 4 秒吸气结束
  fx.updateSession(s, 4000);
  assert.strictEqual(s.phase, P.HOLD, '4 秒后应进入屏气');
  assert.strictEqual(s.gather, 1);

  // 再 7 秒屏气结束
  fx.updateSession(s, 11000);
  assert.strictEqual(s.phase, P.EXHALE, '11 秒后应进入呼气');

  // 再 8 秒呼气结束 → 完成一轮，自动进入下一轮吸气
  const r = fx.updateSession(s, 19000);
  assert.strictEqual(s.cycle, 1, '一轮结束应记一次');
  assert.strictEqual(r.cycleChanged, true);
  assert.strictEqual(s.phase, P.INHALE, '未达目标次数应自动进入下一轮');
  assert.strictEqual(s.gather, 0);
});

test('吸气阶段采用缓动，不是匀速', () => {
  const s = sessionWith();
  fx.startSession(s, 0);

  fx.updateSession(s, 2000);                     // 吸气进行到一半
  assert.ok(s.gather > 0.7, '吸气一半时应已聚拢大半，实际 ' + s.gather);
  assert.strictEqual(s.tremor, 0);

  fx.updateSession(s, 4000);                     // 终点
  assert.strictEqual(s.gather, 1);
});

test('屏气阶段：光点集中在中心，并保持轻微颤动', () => {
  const s = sessionWith();
  fx.startSession(s, 0);
  fx.updateSession(s, 4000);                     // 进入屏气

  const samples = [];
  // 采样到 10500，避开 11000 这个「屏气 → 呼气」的边界
  for (let t = 4000; t < 11000; t += 500) {
    fx.updateSession(s, t);
    assert.strictEqual(s.phase, P.HOLD);
    assert.strictEqual(s.gather, 1, '屏气期间必须一直聚在中心');
    samples.push(s.tremor);
  }
  const max = Math.max.apply(null, samples);
  const min = Math.min.apply(null, samples);
  assert.ok(min > 0, '屏气时必须保留颤动强度');
  assert.ok(max - min > 0.5, '颤动应有起伏，实际幅度 ' + (max - min).toFixed(2));
});

test('呼气阶段：缓慢散开，前半程几乎停在中心附近', () => {
  const s = sessionWith();
  fx.startSession(s, 0);
  fx.updateSession(s, 11000);                    // 直接落到呼气起点
  assert.strictEqual(s.phase, P.EXHALE);
  assert.strictEqual(s.gather, 1);

  fx.updateSession(s, 11000 + 1600);             // 呼气过了 20%
  assert.ok(s.gather > 0.9, '呼气起手必须极慢，实际 ' + s.gather);

  fx.updateSession(s, 11000 + 4000);             // 过半
  assert.ok(Math.abs(s.gather - 0.5) < 1e-9, '呼气过半应为 0.5，实际 ' + s.gather);

  fx.updateSession(s, 19000);                    // 结束
  assert.strictEqual(s.gather, 0);
});

test('达到目标次数后结束，running 置为 false', () => {
  const s = sessionWith({ targetCycles: 1 });
  fx.startSession(s, 0);
  const r = fx.updateSession(s, 19000);
  assert.strictEqual(s.phase, P.COMPLETED);
  assert.strictEqual(s.running, false);
  assert.strictEqual(r.finished, true);
});

test('节奏不含屏气时（屏气 = 0），吸气结束后直接呼气', () => {
  const s = sessionWith({ hold: 0 });
  fx.startSession(s, 0);
  fx.updateSession(s, 4000);
  assert.strictEqual(s.phase, P.EXHALE, 'hold=0 时应跳过屏气');
});

test('中途停止：回到空闲且完全散开', () => {
  const s = sessionWith();
  fx.startSession(s, 0);
  fx.updateSession(s, 2000);
  assert.ok(s.gather > 0);
  fx.stopSession(s, 2000);
  assert.strictEqual(s.running, false);
  assert.strictEqual(s.phase, P.IDLE);
  assert.strictEqual(s.gather, 0);
  assert.strictEqual(fx.updateSession(s, 3000).phaseChanged, false);
});

test('倒计时按阶段剩余秒数递减', () => {
  const s = sessionWith();
  fx.startSession(s, 0);
  assert.strictEqual(fx.phaseRemaining(s, 0), 4);
  assert.strictEqual(fx.phaseRemaining(s, 2500), 2);
  assert.strictEqual(fx.phaseRemaining(s, 4000), 0);
});

test('从后台切回来跨过多个阶段也不会卡死', () => {
  const s = sessionWith();
  fx.startSession(s, 0);
  // 一次性跳过整整一轮
  fx.updateSession(s, 19500);
  assert.ok(s.phase === P.INHALE || s.phase === P.HOLD, '应自我修正到合理阶段');
  assert.strictEqual(s.cycle >= 1, true);
});

// ===========================================================================
// 三、粒子
// ===========================================================================

test('粒子池：设计数据优先，数量不足时自动补齐', () => {
  const pool = fx.createPool(design, FIELD_RADIUS, { count: 24, seed: 20261013 });
  assert.strictEqual(pool.length, 24);

  // 上限不能被静默截断：参考图需要 140 颗
  const big = fx.createPool(design, FIELD_RADIUS, { count: 140, seed: 20261013 });
  assert.strictEqual(big.length, 140, '140 颗粒子不应被 maxParticles 截断');

  design.particles.forEach((seed, i) => {
    assert.strictEqual(pool[i].id, seed.id);
    assert.ok(Math.abs(pool[i].theta - seed.theta) < 1e-9);
    assert.ok(Math.abs(pool[i].radiusRatio - seed.radiusRatio) < 1e-9);
    assert.strictEqual(pool[i].color, seed.color);
  });

  pool.slice(design.particles.length).forEach((p) => {
    // 补齐的粒子：半径 0.10~0.96，sqrt 分布铺满圆面（避免排成一圈"项链"）
    assert.ok(p.radiusRatio >= 0.10 && p.radiusRatio <= 0.96);
    assert.ok(p.sizeBase >= 1.2 && p.sizeBase <= 3.4);
  });
});

test('每颗粒子都有独立的生命周期与运动参数', () => {
  const pool = fx.createPool(design, FIELD_RADIUS, { count: 24, seed: 42 });
  const speeds = new Set(pool.map((p) => p.speed));
  const frequencies = new Set(pool.map((p) => p.blinkFreq));
  const delays = new Set(pool.map((p) => p.delay));
  const biases = new Set(pool.map((p) => p.gatherBias));

  assert.ok(speeds.size > 15, '角速度应各不相同');
  assert.ok(frequencies.size > 15, '闪烁频率应各不相同');
  assert.ok(delays.size > 15, '汇聚延迟应各不相同');
  assert.ok(biases.size > 15, '落点偏差应各不相同（形成松散的云）');

  pool.forEach((p) => {
    assert.ok(p.delay >= 0 && p.delay <= fx.MOTION.gatherDelayMax);
    assert.ok(p.gatherBias >= fx.MOTION.gatherSpread);
    assert.ok(p.lifeSpan >= 9 && p.lifeSpan <= 17);
  });
});

test('同一 seed 生成的粒子池完全一致（可复现）', () => {
  const a = fx.createPool(design, FIELD_RADIUS, { count: 24, seed: 777 });
  const b = fx.createPool(design, FIELD_RADIUS, { count: 24, seed: 777 });
  assert.deepStrictEqual(
    a.map((p) => [p.theta, p.radiusRatio, p.blinkFreq, p.phase, p.sizeBase, p.gatherBias, p.delay]),
    b.map((p) => [p.theta, p.radiusRatio, p.blinkFreq, p.phase, p.sizeBase, p.gatherBias, p.delay])
  );
});

test('散开时半径接近散落半径，汇聚时收缩到中心附近', () => {
  const pool = fx.createPool(design, FIELD_RADIUS, { count: 12, seed: 42 });
  const ctx = { cx: 0, cy: 0, fieldRadius: FIELD_RADIUS, rng: fx.createRng(1), tremor: 0 };

  pool.forEach((p) => {
    fx.stepParticle(p, 0.016, 1.0, 0, ctx);
    assert.ok(Math.abs(p.radius - p.spreadR) <= p.wobbleAmp * 1.4 + 0.5, '散开应贴近散落半径');
  });

  pool.forEach((p) => {
    fx.stepParticle(p, 0.016, 2.0, 1, ctx);
    const expected = fx.MOTION.gatherRadiusRatio * FIELD_RADIUS * p.gatherBias;
    assert.ok(
      Math.abs(p.radius - expected) <= p.wobbleAmp * 0.4 + 0.5,
      '汇聚应收缩到 ' + expected.toFixed(1) + ' 附近，实际 ' + p.radius.toFixed(1)
    );
    assert.ok(p.alpha > 0, '汇聚时不应变透明');
  });
});

test('汇聚时是一团松散的云，不是一个半径上的钢圈', () => {
  const pool = fx.createPool(design, FIELD_RADIUS, { count: 24, seed: 5 });
  const ctx = { cx: 0, cy: 0, fieldRadius: FIELD_RADIUS, rng: fx.createRng(2), tremor: 0 };
  fx.stepPool(pool, 0.016, 0, 1, ctx);

  const radii = pool.map((p) => p.radius);
  const min = Math.min.apply(null, radii);
  const max = Math.max.apply(null, radii);
  assert.ok(max - min > 10, '落点应有明显分散，实际跨度 ' + (max - min).toFixed(1));
});

test('聚拢目标点可以独立放在屏幕中央，不改变散落轨迹中心', () => {
  const pool = fx.createPool(design, FIELD_RADIUS, { count: 24, seed: 5 });
  const ctx = {
    cx: 100,
    cy: 300,
    gatherCx: 100,
    gatherCy: 120,
    fieldRadius: FIELD_RADIUS,
    rng: fx.createRng(2),
    tremor: 0
  };

  fx.stepPool(pool, 0.016, 0, 0, ctx);
  const spreadAvgY = pool.reduce((sum, p) => sum + p.y, 0) / pool.length;

  fx.stepPool(pool, 0.016, 5, 1, ctx);
  const gatheredAvgY = pool.reduce((sum, p) => sum + p.y, 0) / pool.length;

  assert.ok(spreadAvgY > 250, '散落轨道中心不应被移动');
  assert.ok(Math.abs(gatheredAvgY - 120) < 15, '聚拢点应回到指定屏幕中央，实际 ' + gatheredAvgY.toFixed(1));
});

test('屏气颤动会带来透明度与大小的细微变化', () => {
  const mk = () => fx.createPool(design, FIELD_RADIUS, { count: 6, seed: 9 });
  const base = { cx: 0, cy: 0, fieldRadius: FIELD_RADIUS, rng: fx.createRng(3), tremor: 0 };
  const shake = { cx: 0, cy: 0, fieldRadius: FIELD_RADIUS, rng: fx.createRng(3), tremor: 1 };

  const a = mk();
  const b = mk();
  fx.stepPool(a, 0.016, 3.0, 1, base);
  fx.stepPool(b, 0.016, 3.0, 1, shake);

  let changed = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i].alpha !== b[i].alpha || a[i].size !== b[i].size) changed++;
  }
  assert.ok(changed > 0, '颤动应改变至少部分粒子的透明度或大小');
});

test('生命周期结束后就地重生，不会无限累积', () => {
  const rng = fx.createRng(11);
  const p = fx.createParticle(design.particles[0], 0, FIELD_RADIUS, rng);
  const thetaBefore = p.theta;
  const ctx = { cx: 0, cy: 0, fieldRadius: FIELD_RADIUS, rng: rng, tremor: 0 };

  for (let i = 0; i < 60 * 25; i++) fx.stepParticle(p, 0.016, i * 0.016, 0, ctx);

  assert.ok(p.life < p.lifeSpan, '重生后生命计时应被重置');
  assert.ok(p.theta !== thetaBefore, '重生后应换一个环绕角度');
  assert.ok(p.radiusRatio >= 0.10 && p.radiusRatio <= 0.96);
});

test('坐标落在画布可绘制范围内（不会飞出屏幕）', () => {
  const W = 390;
  const H = 520;
  const pool = fx.createPool(design, FIELD_RADIUS, { count: 24, seed: 8 });
  const ctx = { cx: W / 2, cy: H * 0.5, fieldRadius: FIELD_RADIUS, rng: fx.createRng(4), tremor: 0.5 };

  for (let f = 0; f < 240; f++) {
    fx.stepPool(pool, 0.016, f * 0.016, 0, ctx);
    pool.forEach((p) => {
      assert.ok(p.x > -60 && p.x < W + 60, 'x 越界：' + p.x.toFixed(1));
      assert.ok(p.y > -60 && p.y < H + 60, 'y 越界：' + p.y.toFixed(1));
    });
  }
});

test('汇聚计数：全程散开为 0，全程汇聚等于总数', () => {
  const pool = fx.createPool(design, FIELD_RADIUS, { count: 24, seed: 5 });
  const ctx = { cx: 100, cy: 100, fieldRadius: FIELD_RADIUS, rng: fx.createRng(2), tremor: 0 };
  fx.stepPool(pool, 0.016, 0, 0, ctx);
  assert.strictEqual(fx.countGathered(pool), 0);
  fx.stepPool(pool, 0.016, 5, 1, ctx);
  assert.strictEqual(fx.countGathered(pool), pool.length);
});

test('光球呼吸曲线：在 1 上下波动，汇聚与颤动时额外放大', () => {
  const T = fx.MOTION.breathPeriod;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i <= 40; i++) {
    const s = fx.breathScale((i / 40) * T, 0, 0);
    min = Math.min(min, s);
    max = Math.max(max, s);
  }
  assert.ok(min > 0.9 && max < 1.1, '呼吸幅度应在 ±5% 内');
  assert.ok(fx.breathScale(T / 4, 1, 0) > fx.breathScale(T / 4, 0, 0), '汇聚时应额外放大');
});
