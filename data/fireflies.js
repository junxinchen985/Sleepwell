/**
 * 由 Figma-MCP 导出的萤火虫设计数据（自动生成，请勿手改）
 * 重新生成：
 *   node outputs/design-bridge/cli.js --input <get_metadata 导出的 xml> --out outputs/design-bridge/samples/fireflies.json
 *   $npx json-to-js 或直接替换下面的 particles 数组
 *
 * 关键点：全部是"比例值"（radiusRatio / sizeRatio），
 *        因此 390pt 的设计稿可以落到任意机型，不需要按屏宽写死坐标。
 */
module.exports = {
  version: 1,
  screen: { width: 390, height: 844, safeTop: 54, gutter: 24 },
  field: {
    name: 'Molecule/FireflyField',
    cx: 195, cy: 378,
    width: 390, height: 390, radius: 195,
    minRadiusRatio: 0.24, maxRadiusRatio: 0.95
  },
  particles: [
    { id: '2:3', state: 'floating', theta: -1.7851, radiusRatio: 0.8922, sizeRatio: 0.04103, opacity: 0.92, color: '#FFE08A', speed: 0.2273, blinkFreq: 1.286, blinkPhase: 2.916, wobbleAmp: 1.94, life: 0.4099 },
    { id: '2:1', state: 'floating', theta: 0.0062, radiusRatio: 0.8257, sizeRatio: 0.03077, opacity: 0.86, color: '#FFD700', speed: 0.2135, blinkFreq: 1.902, blinkPhase: 0.741, wobbleAmp: 3.21, life: 0.6122 },
    { id: '2:4', state: 'floating', theta: -0.9299, radiusRatio: 0.7805, sizeRatio: 0.03077, opacity: 0.74, color: '#FFD700', speed: 0.2042, blinkFreq: 0.918, blinkPhase: 4.103, wobbleAmp: 2.66, life: 0.2231 },
    { id: '2:2', state: 'blinking', theta: -2.6299, radiusRatio: 0.7646, sizeRatio: 0.02564, opacity: 0.48, color: '#FFD700', speed: 0.2001, blinkFreq: 2.441, blinkPhase: 5.517, wobbleAmp: 4.02, life: 0.8743 },
    { id: '2:5', state: 'blinking', theta: 1.3413, radiusRatio: 0.5635, sizeRatio: 0.02564, opacity: 0.41, color: '#FFD700', speed: 0.1587, blinkFreq: 1.226, blinkPhase: 1.994, wobbleAmp: 2.18, life: 0.3518 },
    { id: '2:6', state: 'gathering', theta: 2.3306, radiusRatio: 0.4244, sizeRatio: 0.04103, opacity: 0.95, color: '#FFE08A', speed: 0.1294, blinkFreq: 0.702, blinkPhase: 3.365, wobbleAmp: 1.63, life: 0.7325 }
  ],
  stats: { count: 6, blinking: 2, gathering: 1, opacity: { min: 0.41, max: 0.95 }, size: { min: 10, max: 16 } }
};
