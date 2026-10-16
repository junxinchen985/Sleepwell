/**
 * 渲染层自测（用假的 Canvas 上下文跑，不需要真机）
 * 运行：node --test outputs/miniprogram/test/firefly-renderer.test.js
 *
 * 重点守住一条性能红线：**径向渐变只能在初始化时创建，绝不能每帧创建**。
 * createRadialGradient 是 Canvas 2D 里最贵的调用之一，一旦滑进渲染循环，
 * 中低端机上会直接掉帧。
 */

const test = require('node:test');
const assert = require('node:assert');

const renderer = require('../utils/firefly-renderer');
const fx = require('../utils/firefly-particles');
const design = require('../data/fireflies');

/** 记录调用次数的假上下文，只实现渲染层真正用到的方法 */
function fakeCtx() {
  const stats = { gradients: 0, clearRect: 0, fillRect: 0, arcs: 0, strokes: 0 };
  const gradient = { addColorStop: function () {} };
  return {
    stats: stats,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: null,
    strokeStyle: null,
    lineWidth: 1,
    lineCap: 'butt',
    createRadialGradient: function () { stats.gradients++; return gradient; },
    save: function () {},
    restore: function () {},
    translate: function () {},
    scale: function () {},
    beginPath: function () {},
    arc: function () { stats.arcs++; },
    fill: function () {},
    fillRect: function () { stats.fillRect++; },
    clearRect: function () { stats.clearRect++; },
    moveTo: function () {},
    lineTo: function () {},
    stroke: function () { stats.strokes++; }
  };
}

function makeRenderer(count) {
  const ctx = fakeCtx();
  const r = renderer.createRenderer({
    ctx: ctx,
    width: 390,
    height: 487,
    design: design,
    count: count || 24,
    seed: 20261013,
    layoutSeed: 97531
  });
  return { ctx: ctx, renderer: r };
}

test('渲染器对外暴露稳定的接口与引擎标识', () => {
  const built = makeRenderer();
  assert.strictEqual(built.renderer.engine, 'firefly-canvas-2d');
  assert.strictEqual(typeof built.renderer.update, 'function');
  assert.strictEqual(built.renderer.pool.length, 24);
  assert.strictEqual(built.renderer.cx, 195);
  assert.strictEqual(built.renderer.gatherCx, 195);
  assert.strictEqual(built.renderer.gatherCy, 487 * 0.5);
  assert.strictEqual(built.renderer.fieldRadius, Math.min(390, 487) * 0.52);
  // 轨道中心落在中下部，粒子才不会飘到顶部标题区
  assert.ok(built.renderer.cy > 487 * 0.5, '轨道中心应偏低，实际 ' + built.renderer.cy);
});

test('发光渐变只在初始化时创建，连续 180 帧不再新增（性能红线）', () => {
  const built = makeRenderer();
  const afterInit = built.ctx.stats.gradients;
  // 2 个萤火虫精灵（黄绿 / 暖黄）+ 1 个汇聚光核 + 1 层环境光
  assert.strictEqual(afterInit, 4, '初始化应创建 4 个渐变，实际 ' + afterInit);

  for (let i = 0; i < 180; i++) {
    built.renderer.update(0.016, i * 0.016, { gather: (i % 60) / 60, tremor: 0.5 }, 1000 + i * 16);
  }
  assert.strictEqual(
    built.ctx.stats.gradients,
    4,
    '渲染循环里不允许再创建渐变，实际 ' + built.ctx.stats.gradients
  );
});

test('每帧只清屏一次，不铺不透明底色（否则会盖住原生组件下面的 DOM）', () => {
  const built = makeRenderer();
  built.renderer.update(0.016, 0, { gather: 0, tremor: 0 }, 1000);
  assert.strictEqual(built.ctx.stats.clearRect, 1, '每帧应恰好清屏一次');
  // 环境光那一次 fillRect 是 (0,0) 半径 1 的归一化绘制，不是整屏底色
  assert.strictEqual(built.ctx.stats.fillRect, 1, '整屏填充不应该出现');
});

test('渲染层消费的是阶段机给出的 gather，收敛与散开都会落到画布上', () => {
  const built = makeRenderer(12);
  const pool = built.renderer.pool;

  for (let i = 0; i < 30; i++) {
    built.renderer.update(0.016, i * 0.016, { gather: 0, tremor: 0 }, 1000 + i * 16);
  }
  const spreadAvg = pool.reduce((sum, p) => sum + p.radius, 0) / pool.length;

  for (let i = 0; i < 30; i++) {
    built.renderer.update(0.016, 1 + i * 0.016, { gather: 1, tremor: 0 }, 2000 + i * 16);
  }
  const gatheredAvg = pool.reduce((sum, p) => sum + p.radius, 0) / pool.length;

  assert.ok(gatheredAvg < spreadAvg * 0.5, '汇聚后的平均半径应显著变小');
});

test('绘制调用与粒子数量同阶，没有意外的整屏级绘制', () => {
  const built = makeRenderer(24);

  // 先跑几帧让粒子的淡入进度走完（fade 从 0 涨到 1，否则首帧会被跳过）
  for (let i = 0; i < 40; i++) {
    built.renderer.update(0.016, i * 0.016, { gather: 0.4, tremor: 0.3 }, 1000 + i * 16);
  }

  built.ctx.stats.arcs = 0;
  built.renderer.update(0.016, 3, { gather: 0.4, tremor: 0.3 }, 3000);
  // 24 颗萤火虫（辉光 + 光核）+ 光球的 4 次绘制，数量级应在百次以内
  assert.ok(built.ctx.stats.arcs < 120, '单帧 arc 调用应远小于 120，实际 ' + built.ctx.stats.arcs);
  assert.ok(built.ctx.stats.arcs > 20, '粒子必须真的被画出来');
});

test('阶段机与渲染层可以独立替换：渲染层只吃 gather / tremor', () => {
  const built = makeRenderer(6);
  const s = fx.createSession({ inhale: 4, hold: 7, exhale: 8, targetCycles: 6 });
  fx.startSession(s, 0);

  // 走完吸气，把阶段机的输出喂给渲染层
  fx.updateSession(s, 4000);
  built.renderer.update(0.016, 4, { gather: s.gather, tremor: s.tremor }, 4000);
  assert.strictEqual(s.phase, fx.PHASES.HOLD);
  assert.ok(built.renderer.pool.every((p) => p.radius < built.renderer.fieldRadius));
});

test('纵向压缩生效：萤火虫集中在中下部，不会跑到顶部标题区', () => {
  const built = makeRenderer(140);
  for (let i = 0; i < 30; i++) {
    built.renderer.update(0.016, i * 0.016, { gather: 0, tremor: 0 }, 1000 + i * 16);
  }

  const H = 487;
  const ys = built.renderer.pool.map((p) => p.y);
  const above = ys.filter((y) => y < H * 0.18).length;
  const lower = ys.filter((y) => y > H * 0.5).length;

  assert.ok(above === 0, '不应有粒子进入顶部 18% 区域，实际 ' + above + ' 颗');
  assert.ok(lower > ys.length * 0.6, '多数粒子应落在下半屏，实际 ' + lower + '/' + ys.length);
});

test('聚拢中心独立于散落轨道，粒子最终回到屏幕正中央', () => {
  const built = makeRenderer(140);
  for (let i = 0; i < 60; i++) {
    built.renderer.update(0.016, 1 + i * 0.016, { gather: 1, tremor: 0 }, 2000 + i * 16);
  }

  const avgY = built.renderer.pool.reduce((sum, p) => sum + p.y, 0) / built.renderer.pool.length;
  assert.ok(
    Math.abs(avgY - built.renderer.gatherCy) < 18,
    '聚拢平均位置应回到屏幕中央，实际 ' + avgY.toFixed(1)
  );
});

test('140 颗粒子的单帧绘制量仍在可控范围', () => {
  const built = makeRenderer(140);
  for (let i = 0; i < 40; i++) {
    built.renderer.update(0.016, i * 0.016, { gather: 0.5, tremor: 0.3 }, 1000 + i * 16);
  }
  built.ctx.stats.arcs = 0;
  built.renderer.update(0.016, 3, { gather: 0.5, tremor: 0.3 }, 3000);

  // 每颗萤火虫 1 次辉光 + 1 次光核，外加汇聚光核。
  // 刚重生、还在淡入的粒子会被 alpha 阈值跳过，所以实际次数略低于 2 × 140。
  assert.ok(built.ctx.stats.arcs > 100, '粒子必须真的被画出来，实际 ' + built.ctx.stats.arcs);
  assert.ok(built.ctx.stats.arcs < 600, '单帧 arc 调用过多，实际 ' + built.ctx.stats.arcs);
});
