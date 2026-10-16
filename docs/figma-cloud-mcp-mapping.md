# 深呼吸云页 Figma-MCP 映射说明

## 数据边界

当前仓库没有收到本次两个 Frame 的 `fileKey`、`nodeId` 或原始 MCP JSON。
实现以用户附带的四张截图、仓库已有 Figma 设计令牌和现有微信小程序组件约定为准。
拿到真实设计文件后，可直接用 `get_design_context` 返回的节点字段逐项覆盖下表映射。

## 节点到代码

| Figma 节点 | 小程序节点 | 说明 |
| --- | --- | --- |
| `Main/Container` | `.cloud-page` | 100vh 根容器，固定顶部导航与底部按压区 |
| `Backdrop/Cloud_1` | `.cloud--one` | 基础云层，待机可见，吸气阶段淡出 |
| `Backdrop/Cloud_2` | `.cloud--two` | 聚拢云层，吸气进入，屏息保持 |
| `Backdrop/Cloud_3` | `.cloud--three` | 散开云层，呼气进入 |
| `UI/NavBar/Back` | `.cloud-topbar__icon--left` | 返回上一页或首页 |
| `UI/NavBar/Title` | `.cloud-topbar__title` | 固定文案“深呼吸” |
| `UI/NavBar/Subtitle` | `.cloud-topbar__subtitle` | 待机文案“放松身心，回到当下”，运行时逐秒显示“吸气 4 秒 / 屏气 7 秒 / 吐气 8 秒”并递减 |
| `UI/NavBar/Settings` | `.cloud-topbar__icon--right` | 打开内联“呼吸设置”底部弹层 |
| `UI/Bottom/PressRing` | `.cloud-press` | 点击开始，再次点击停止并复位 |
| `Settings/Sheet` | `.cloud-sheet-root` | 页面内联底部弹层、遮罩与 backdrop-filter |
| `Settings/Sheet/List` | `wx:for="{{settingRows}}"` | 列表数据由 JS 统一生成 |

## 列表数据映射

`utils/cloud-breath.js` 的 `buildSettingsRows(settings, rhythm, targetCycles)`
把设置模型转换为 WXML 可直接循环的数组：

```js
[
  { id: 'rhythm', type: 'select', label: '呼吸节奏', value: '4-7-8' },
  { id: 'targetCycles', type: 'select', label: '呼吸次数', value: '6 次' },
  { id: 'hapticEnabled', type: 'switch', label: '触觉反馈', checked: true },
  { id: 'soundEnabled', type: 'switch', label: '声音（微风）', checked: false },
  { id: 'endSoundEnabled', type: 'switch', label: '结束提示音', checked: false }
]
```

WXML 以 `item.type` 决定渲染右侧箭头或自定义 Switch。
切换设置后先写入 `services/storage.js`，再重建 `settingRows`，
因此页面状态机读取的 `this.rhythm`、`targetCycles` 和开关值会立即更新。

## 动效映射

- 吸气：`cloud_1 -> cloud_2`，云层通过内联 `opacity/transform` 过渡聚拢，圆环变亮变大。
- 屏气：保持 `cloud_2`，以低幅度 `scale/translate` 起伏。
- 吐气：`cloud_2 -> cloud_3`，云层缩小散开；`cloud_1` 保留低透明度底层，避免背景完全消失。
- 页面使用单一 100ms `setInterval` 检查阶段截止时间，阶段切换与文案、震动、音频同步。
- 所有关键帧仅使用 `transform: translate3d()` 与 `opacity`，避免触发布局重排。

## 性能与内存

- 三张 `1280x2278` 原图已压缩为 `750x1335`，单张约 70KB。
- 页面加载后调用 `wx.getImageInfo` 预热三张本地图片。
- 页面只保留三个 `<image>` 节点，不创建 Canvas 或逐帧 JS 动画。
- 环境音只保留一个循环 `InnerAudioContext`，页面卸载时调用 `destroy()`。
- Skyline 下圆环与云层动画均交给合成层，JS 只负责 4/7/8 阶段计时与音频目标音量。
