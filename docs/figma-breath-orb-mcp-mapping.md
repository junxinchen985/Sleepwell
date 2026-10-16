# 深呼吸 · 呼吸光团 Figma-MCP 数据映射

## 数据边界

本次实现收到的输入是用户提供的界面设计图，没有收到可调用的 Figma 文件
URL、`fileKey`、`nodeId` 或 `get_design_context` 原始 JSON。光团本体已从
设计图裁出并保存为 `assets/breath-orb/orb-source.png`，页面不再生成新的
粒子造型或水波纹理。

裁切参数：源图坐标 `x=323, y=1463`，裁切边长 `1512px`；光团亮部直径约
`1393px`。导出资源为 `512×512` 透明底 PNG，运行时按设计图比例绘制。

## 节点到小程序

| Figma 节点 | 小程序节点 | 实现说明 |
| --- | --- | --- |
| `Page/BreathOrb` | `.orb-page` | 100vh 深色根容器，`overflow:hidden` |
| `Backdrop/Grid` | `.orb-grid` | 两组 `linear-gradient` 按 72rpx 间距重复，不加载云图 |
| `Backdrop/Vignette` | `.orb-vignette` | 顶部冷色径向光与底部压暗层，维持中心聚焦 |
| `Header/Title` | `.orb-title` | 固定文案“深呼吸”，无顶部导航图标 |
| `Header/Subtitle` | `.orb-subtitle` | 待机“放松身心，回到当下”；运行中替换为倒计时 |
| `Center/ParticleOrb` | `#breathOrbCanvas` | 透明 Canvas 2D，直接绘制设计图贴图 `orb-source.png` |
| `Bottom/PressButton/Halo` | `.orb-action__halo` | 按钮外圈柔光，CSS 动画只做轻微呼吸 |
| `Bottom/PressButton/Ring` | `.orb-action__ring--outer/inner` | 双层同心圆环 |
| `Bottom/PressButton/Core` | `.orb-action__core` | 白色至冷蓝的发光内核 |
| `Bottom/ActionLabel` | `.orb-action-label` | 初始“轻触开始”，运行中“点击停止” |
| `Navigation/Back` | 无 | 明确不渲染 |
| `Navigation/Settings` | 无 | 明确不渲染 |

## 4-7-8 节点与视觉参数

状态机位于 `utils/breath-orb-machine.js`，渲染器位于
`utils/breath-orb-renderer.js`。

| 阶段 | 时长 | 文案格式 | 聚拢量 | 旋转速度 | 亮度 |
| --- | ---: | --- | --- | --- | --- |
| 待机 `idle` | - | 放松身心，回到当下 | 0.04 | 0.060 | 0.74 |
| 吸气 `inhale` | 4s | 吸气4秒 → 吸气1秒 | 0.04 → 0.66 | 0.072 → 0.120 | 0.74 → 0.95 |
| 屏息 `hold` | 7s | 屏息7秒 → 屏息1秒 | 0.78 | 0.145 | 0.98 |
| 呼气 `exhale` | 8s | 呼气8秒 → 呼气1秒 | 0.78 → 0.04 | 0.145 → 0.072 | 0.98 → 0.74 |

每帧只对设计图执行三次变换：

1. 以约 0.072-0.145 弧度/秒缓慢旋转；吸气加速、屏息保持、呼气逐渐减速。
2. 聚拢量改变贴图直径；屏息最大收缩约 10%，变化更明确但不会压成中心亮斑。
3. 呼气时从屏息尺寸缓慢恢复到待机尺寸，不会向外散成大圈。

水波位移、粒子颤动和重新绘制的球面纹理均已移除。设计图自带的前后明暗、
光丝和球缘高光继续保留，因此旋转和缩放时仍维持 3D 球感。

## 文案与定时器映射

- 按钮点击后，`phasePrompt(phase, remainingSeconds)` 返回
  `吸气N秒`、`屏息N秒`、`呼气N秒`，每个秒数都带单位，不会出现省略号。
- `setInterval` 每 100ms 校时，但只在剩余秒数变化时触发 `setData`。
- `requestAnimationFrame` 只在运行期间存在，停止、隐藏或卸载页面时调用
  `cancelAnimationFrame`。
- 停止时状态机回到 `idle`，清空 `clockTimer` 与 `rafId`，Canvas 重绘一帧
  静止微光。

## 真实 MCP JSON 接入方式

拿到 Figma-MCP 返回后，可按以下字段补齐映射：

| MCP 字段 | 使用位置 |
| --- | --- |
| `fileKey` / `node.id` | 写入本文档的节点溯源 |
| `absoluteBoundingBox.width/height` | 校准 Canvas 与按钮尺寸 |
| `fills` / `strokes` | 对应 `.orb-page`、`.orb-grid`、按钮圆环颜色 |
| `effects` | 对应光团、按钮与文字的阴影半径 |
| `children[].name` | 替换上表的节点名，不改样式类名 |
| `componentId` | 判断设计系统是否已有可复用按钮组件 |

当前实现不依赖 Figma 运行时资源，因此即使没有图床导出或云图资源，也能在
微信开发者工具中直接运行。
