/**
 * 呼吸光团渲染器
 * ---------------------------------------------------------------------------
 * 视觉底图来自用户提供的设计图裁切结果：assets/breath-orb/orb-source.png。
 * 渲染器不再生成粒子、波形或水波位移，只对这张设计图做：
 *   1. 缓慢旋转
 *   2. 吸气收缩、屏息保持、呼气恢复放大
 *   3. 亮度做极小幅变化
 *
 * 图片的亮部直径约占 1512 像素裁切框的 1393/1512；绘制时按这个比例
 * 反推贴图尺寸，保证设计图在页面中的视觉直径不被错误放大或缩小。
 */

const { PHASES, getMotionState } = require('./breath-orb-machine');

const ENGINE = 'breath-orb-design-image';
const SOURCE_ORB_DIAMETER_RATIO = 1393 / 1512;

function follow(current, target, amount) {
  return current + (target - current) * amount;
}

function createRenderer(options) {
  const ctx = options.ctx;
  const vw = Math.max(1, options.width);
  const vh = Math.max(1, options.height);
  const cx = vw * (options.centerX == null ? 0.5 : options.centerX);
  const cy = vh * (options.centerY == null ? 0.5 : options.centerY);
  // 设计图中光团亮部直径约占屏幕宽度的 64.5%，画布宽度为屏宽的 88%。
  const radius = Math.min(vw, vh) * (options.radiusRatio == null ? 0.367 : options.radiusRatio);

  let sourceImage = null;
  let rotation = 0;
  let visual = Object.assign({}, getMotionState(PHASES.IDLE, 0));

  function updateVisual(dt, motion) {
    const amount = 1 - Math.exp(-Math.max(0.001, dt) * 9);
    visual.gather = follow(visual.gather, motion.gather, amount);
    visual.brightness = follow(visual.brightness, motion.brightness, amount);
    visual.scale = follow(visual.scale, motion.scale, amount);
    visual.rotationSpeed = follow(visual.rotationSpeed, motion.rotationSpeed, amount);
  }

  function drawOrb() {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, vw, vh);

    if (!sourceImage) return;

    const orbScale = visual.scale * (1 - visual.gather * 0.13);
    const drawSize = (radius * 2 / SOURCE_ORB_DIAMETER_RATIO) * orbScale;
    const alpha = 0.72 + visual.brightness * 0.28;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.drawImage(
      sourceImage,
      -drawSize * 0.5,
      -drawSize * 0.5,
      drawSize,
      drawSize
    );
    ctx.restore();

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  return {
    engine: ENGINE,
    cx: cx,
    cy: cy,
    radius: radius,
    get sourceReady() {
      return Boolean(sourceImage);
    },

    setSourceImage(image) {
      sourceImage = image || null;
      drawOrb();
    },

    renderIdle() {
      rotation = 0;
      visual = Object.assign({}, getMotionState(PHASES.IDLE, 0));
      drawOrb();
    },

    render(dt, time, motion) {
      const next = motion || getMotionState(PHASES.IDLE, 0);
      updateVisual(dt, next);
      rotation += Math.max(0, dt || 0) * visual.rotationSpeed;
      drawOrb();
    }
  };
}

module.exports = {
  ENGINE,
  SOURCE_ORB_DIAMETER_RATIO,
  createRenderer
};
