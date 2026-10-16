# 深海鲸鱼助眠 · Figma-MCP 数据映射

## 数据边界

本次收到的输入是用户提供的 `1080×1920` 界面设计图，没有收到可调用的
Figma 文件 URL、`fileKey`、`nodeId` 或 `get_design_context` 原始 JSON。
因此没有伪造 MCP 节点数据，而是按设计图直接提取视觉关系与色值，并将原图
拆成水面底图、鲸鱼主体、胸鳍和尾鳍四层资源。

## 色值与页面变量

| 设计采样 | 色值 | 页面变量 |
| --- | --- | --- |
| 底部深海 | `#020918` | `--whale-ink` |
| 中部海水 | `#061D33` | `--whale-deep` |
| 鲸鱼上方海水 | `#224C7A` | `--whale-water` |
| 鲸鱼边缘光 | `#60ABE5` | `--whale-light` |
| 丁达尔光束 | `#B9DDFF` | `--whale-ray` |
| 标题与月白光 | `#F4F8FF` / `#ABB4BF` | `--whale-text` / 按钮内核 |

## 节点到小程序

| 设计层 | 小程序节点 | 实现说明 |
| --- | --- | --- |
| `Background/DeepSea` | `.whale-water` | 清除标题、按钮和鲸鱼后的水面底图，保留顶部水面与透射光 |
| `Subject/Whale` | `.whale-whale` | 透明鲸鱼主体，头部与尾部完整保留 |
| `Subject/WhaleFins` | `.whale-fin` | 胸鳍独立层，做缓慢摆动 |
| `Subject/WhaleTail` | `.whale-tail` | 尾鳍独立层，做缓慢摆动 |
| `Light/GodRays` | `.whale-rays` | 三束 CSS 渐变光束叠加，吸气变亮、屏息稳定、吐气变暗 |
| `Water/SurfaceRipples` | `.whale-ripples` | 四层椭圆波纹扩散，吐气阶段减速降透明 |
| `Particles/Bubbles` | `.whale-bubbles` | 16 个 CSS 气泡，吸气上升、屏息悬浮、吐气下坠 |
| `Header/Title` | `.whale-title` | 始终显示“深呼吸” |
| `Header/Subtitle` | `.whale-subtitle` | 待机显示“放松身心，回到当下”，运行中实时显示“吸气 4s”等精确文案 |
| `Bottom/PressButton/Halo` | `.whale-action__halo` | 同心圆外层柔光 |
| `Bottom/PressButton/Rings` | `.whale-action__ring--outer/inner` | 双层圆环 |
| `Bottom/PressButton/Core` | `.whale-action__core` | 月白色发光体 |
| `Bottom/ActionLabel` | `.whale-action-label` | 待机“轻触开始”，运行中“轻触停止” |
| `Navigation/Back` | 无 | 明确不渲染 |
| `Navigation/Settings` | 无 | 明确不渲染 |

## 状态与动效映射

状态机位于 `utils/whale-breath-machine.js`，页面控制器位于
`utils/whale-breath-controller.js`。

| 阶段 | 时长 | 主文案 | 鲸鱼 | 光效与环境 | 气泡 |
| --- | ---: | --- | --- | --- | --- |
| 待机 `idle` | - | 深呼吸 + 放松身心 | 轻微漂浮，鳍尾慢速摆动 | 柔光低亮度 | 缓慢悬浮 |
| 吸气 `inhale` | 4s | 深呼吸 + 吸气 4s 至 1s | 向上游动，轻微转向与倾斜 | 4s 内变亮，波纹扩散 | 上升 |
| 屏息 `hold` | 7s | 深呼吸 + 屏气 7s 至 1s | 悬停轻浮，鳍尾保持慢摆 | 保持明亮稳定 | 悬浮 |
| 吐气 `exhale` | 8s | 深呼吸 + 吐气 8s 至 1s | 缓慢下沉，轻微侧转 | 8s 内变暗，波纹平静 | 减少并下坠 |

JS 只使用 `setInterval` 每 `100ms` 校时，且只有剩余秒数或阶段变化时才
`setData`。视觉过程交给 CSS `transition` / `animation` 与 GPU 合成，不使用
逐帧 `canvas` 绘制，避免粒子数量增长后阻塞主线程。

## 真实 Figma JSON 接入

拿到 Figma-MCP 返回后，可按以下字段补齐映射：

| MCP 字段 | 使用位置 |
| --- | --- |
| `fileKey` / `node.id` | 写入本文档与页面路由说明 |
| `absoluteBoundingBox.width/height` | 校准标题、按钮与底图尺寸 |
| `fills` / `strokes` | 替换 `.whale-page` 中的颜色变量 |
| `effects` | 替换标题、按钮和光晕阴影参数 |
| `constraints` | 将绝对定位进一步换算为自适应约束 |
| `children[].name` | 替换上表的节点名称，不改现有类名 |
