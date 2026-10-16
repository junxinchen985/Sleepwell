/**
 * 萤火虫渲染层（Canvas 2D）
 * ---------------------------------------------------------------------------
 * 职责边界：只负责"把状态画出来"，不含交互与节奏判断。
 * 换成别的动态作品（Figma 导出的 Canvas / Lottie / CSS 动画）时，
 * 只需要替换本文件并保持 createRenderer 接口不变。
 *
 * 分层策略（重要）：
 *   静态星空不做在 canvas 里，而是烘成一张背景图交给 WXSS。
 *   原因：canvas 是微信原生组件，层级高于普通 DOM，
 *   整屏不透明绘制会把顶部标题和底部按钮一起盖住。
 *   背景图铺满整屏、永远在文字之下，canvas 只画会动的萤火虫，
 *   并且始终保持透明底。
 *
 * 对外接口：
 *   const renderer = createRenderer({ ctx, width, height, design, count, seed, layoutSeed });
 *   renderer.update(dt, time, { gather, tremor }, now);
 */

const fx = require('./firefly-particles');

const ENGINE = 'firefly-canvas-2d';

/** 萤火虫调色板：主体黄绿，少量暖黄 */
const FIREFLY = {
  green: '#E6F14A',
  warm: '#FFF08A'
};

const DEFAULT_SPRITES = {
  primary: [
    [0, 'rgba(255,255,255,0.75)'],
    [0.14, 'rgba(230,241,74,0.62)'],
    [0.38, 'rgba(198,214,58,0.26)'],
    [0.68, 'rgba(150,170,40,0.08)'],
    [1, 'rgba(150,170,40,0)']
  ],
  secondary: [
    [0, 'rgba(255,255,255,0.78)'],
    [0.14, 'rgba(255,240,138,0.62)'],
    [0.38, 'rgba(226,224,96,0.26)'],
    [0.68, 'rgba(170,178,60,0.08)'],
    [1, 'rgba(170,178,60,0)']
  ],
  gatherCore: [
    [0, 'rgba(238,248,206,0.55)'],
    [0.28, 'rgba(214,236,132,0.24)'],
    [0.62, 'rgba(170,196,90,0.07)'],
    [1, 'rgba(170,196,90,0)']
  ],
  ambient: [
    [0, 'rgba(86,116,196,0.10)'],
    [0.45, 'rgba(86,116,196,0.035)'],
    [1, 'rgba(86,116,196,0)']
  ]
};

/**
 * 预生成所有发光精灵。
 * 渐变在 Canvas 2D 里是「创建即定坐标、绘制时套用当前变换」，
 * 所以把渐变圆心放在 (0,0)，之后 translate/scale 到任意位置复用。
 *
 * 这里是整条渲染链路上唯一创建渐变的地方：
 * 每帧都调 createRadialGradient 是最大的性能陷阱，务必保持"只在初始化时创建"。
 */
function buildSprites(ctx, overrides) {
  const stops = Object.assign({}, DEFAULT_SPRITES, overrides || {});
  const make = (radius, stops) => {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    stops.forEach((s) => g.addColorStop(s[0], s[1]));
    return { gradient: g, radius: radius };
  };

  return {
    firefly: {
      // 核心亮度 0.75：比上一版（0.6）提亮，靠大范围模糊而不是高亮来"柔"
      green: make(9, stops.primary),
      warm: make(9, stops.secondary)
    },
    // 汇聚光核：静止时几乎不可见，吸气聚拢时才在中心浮现
    gatherCore: make(90, stops.gatherCore),
    // 环境光：极弱的一层冷蓝，让画面比纯黑更有空气感
    ambient: make(1, stops.ambient)
  };
}

/**
 * 创建渲染器。
 * @param {object} opts
 *   ctx / width / height   Canvas 2D 上下文（已按 dpr 做过 scale）与逻辑尺寸
 *   design                 设计数据（data/fireflies.js）
 *   count                  粒子数量（140）
 *   seed                   粒子布局种子
 *   layoutSeed             运行时随机源种子
 */
function createRenderer(opts) {
  const ctx = opts.ctx;
  const vw = opts.width;
  const vh = opts.height;

  // 散落轨道中心：略低于屏幕中央，待机与循环结束后的星云更靠近聚拢点
  const cx = vw * (opts.centerX == null ? 0.5 : opts.centerX);
  const cy = vh * (opts.centerY == null ? 0.56 : opts.centerY);
  // 聚拢中心独立于散落轨道，默认回到屏幕正中央
  const gatherCx = vw * (opts.gatherCenterX == null ? 0.5 : opts.gatherCenterX);
  const gatherCy = vh * (opts.gatherCenterY == null ? 0.5 : opts.gatherCenterY);
  const yScale = opts.yScale == null ? 0.62 : opts.yScale;
  const fieldRadius = Math.min(vw, vh) * (opts.fieldRadiusRatio == null ? 0.52 : opts.fieldRadiusRatio);

  const rng = fx.createRng(opts.layoutSeed || 97531);
  const pool = fx.createPool(opts.design, fieldRadius, {
    count: opts.count || 140,
    seed: opts.seed || 20261014
  });
  const sprites = buildSprites(ctx, opts.sprites);

  /** 画一个缓存好的径向渐变精灵（translate + scale 复用，绘制期零分配） */
  function paint(sprite, x, y, radius, alpha) {
    const k = radius / sprite.radius;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.fillStyle = sprite.gradient;
    ctx.beginPath();
    ctx.arc(0, 0, sprite.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * 推进一步并绘制。
   * @param {number} dt     距上一帧的秒数
   * @param {number} time   页面运行总秒数（喂给所有正弦函数）
   * @param {object} state  { gather, tremor }
   * @param {number} now    真实时间戳（毫秒，用于呼吸曲线）
   */
  function update(dt, time, state, now) {
    const gather = state.gather || 0;
    const tremor = state.tremor || 0;

    // ① 粒子推进
    fx.stepPool(pool, dt, time, gather, {
      cx: cx,
      cy: cy,
      fieldRadius: fieldRadius,
      rng: rng,
      tremor: tremor,
      yScale: yScale,
      gatherCx: gatherCx,
      gatherCy: gatherCy
    });

    // ② 只清屏，不填底色。底色与星空由 WXSS 的背景图提供
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, vw, vh);

    // ③ 环境光：椭圆径向渐变，只"提亮"不"压暗"，因此不会产生色块边界。
    //    纵向范围刻意收在画布之内：如果渐变在画布边缘还没衰减到 0，
    //    画布底边就会出现一条亮度断差（原生画布与背景图的分界）。
    ctx.globalCompositeOperation = 'lighter';
    ctx.save();
    ctx.translate(cx, cy * 0.82);
    ctx.scale(vw * 1.00, vh * 0.42);
    ctx.fillStyle = sprites.ambient.gradient;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();

    // ④ 汇聚光核：随 gather 淡入，给"聚拢"一个视觉落点
    if (gather > 0.02) {
      const scale = fx.breathScale(now, gather, tremor);
      paint(sprites.gatherCore, gatherCx, gatherCy, 96 * scale, Math.min(0.9, gather * 0.9));
    }

    // ⑤ 萤火虫：彗尾 + 辉光 + 光核
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (p.alpha <= 0.01) continue;

      // 彗尾：画「上一帧到这一帧」的位移，比整屏半透明覆盖更省
      const dx = p.x - p.prevX;
      const dy = p.y - p.prevY;
      if (dx * dx + dy * dy > 0.36) {
        ctx.save();
        ctx.globalAlpha = p.alpha * (0.20 + p.progress * 0.22);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(0.6, p.size * 0.34);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.prevX, p.prevY);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.restore();
      }

      // 辉光：光点直径约为粒子尺寸的 1.85 倍。
      // 140 颗同时在场，倍率再大就会连成一片糊光，反而看不清"一颗一颗"。
      const useSecondary = opts.secondaryEvery
        ? p.index % opts.secondaryEvery === 0
        : p.color === FIREFLY.warm;
      const sprite = useSecondary ? sprites.firefly.warm : sprites.firefly.green;
      paint(sprite, p.x, p.y, p.size * 1.85, Math.min(0.86, p.alpha));

      // 光核：一颗干净的小亮点，负责"萤火虫"的辨识度
      ctx.save();
      ctx.globalAlpha = Math.min(0.95, p.alpha * 1.15);
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, p.size * 0.26), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  return {
    engine: ENGINE,
    cx: cx,
    cy: cy,
    gatherCx: gatherCx,
    gatherCy: gatherCy,
    fieldRadius: fieldRadius,
    pool: pool,
    sprites: sprites,
    update: update
  };
}

module.exports = { ENGINE, FIREFLY, DEFAULT_SPRITES, createRenderer, buildSprites };
