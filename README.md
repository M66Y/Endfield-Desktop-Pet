# 洁尔佩塔桌宠（Gilberta Desktop Pet）

《明日方舟：终末地》洁尔佩塔 Q版桌面宠物。
**画面直接采用你的参考图**：图像处理管线把立绘抠图并切成可动零件（双马尾 ×2 / 狐耳 ×2 / 双腿 ×2 / 身体底图），
代码只负责让这些原图零件动起来——表情、造型与原图 1:1，无手绘感。

## 运行

```bash
npm install        # 已装过可跳过
npm start          # 启动桌宠
```

> 国内网络安装 Electron 较慢时：`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install`

## 交互

| 操作 | 反应 |
| --- | --- |
| 待机 | 呼吸起伏、随机眨眼、狐尾轻摆飘动、随机狐耳抖动；偶尔歪头 / 尾巴快摆 / 双耳竖起 |
| 单击 | 小幅踢腿 + 轻跳（连续点击换腿），约 1 秒后回到待机；表情始终是原图 |
| 按住拖动 | 身体随移动方向惯性摆动；松手后阻尼晃动恢复 |

> 表情永远保持原图，不做手绘叠加。想换表情（坏笑/开心），用 `tools/face.py` 换上
> 同角色不同表情的生成图，见下文「表情变体」。
| 透明区域 | 鼠标穿透，不挡桌面操作 |
| 托盘图标 | 缩放 256↔512、窗口置顶开关、退出 |

- 点击判定基于角色实际不透明像素（α 遮罩），透明区域不误触；按下后移动超过 7px 才算拖拽。
- 位置 / 缩放 / 置顶状态自动记忆，重启后恢复。

## 生成素材 / 预览

```bash
python tools/process.py   # 从参考图重新切割零件 -> assets/（需 Pillow + numpy）
npm run preview           # 输出姿势截图 + preview/animation.gif 动画（12fps，待机+一次点击）
```

## 表情变体（换脸）

在豆包AI里用与参考图相同的提示词、只改表情再生成一张（同构图同尺寸最佳），例如：

> 同一位Q版棕发红瞳狐耳女孩，双马尾，红色连衣裙黑色外套，纯白背景，全身正面站立，坏笑表情

然后：

```bash
python tools/face.py 新图.png smug          # 默认按参考图脸部范围切割
python tools/face.py 新图.png smug x0 y0 x1 y1 dx dy   # 脸部位置有偏移时手动指定
npm start
```

切好的脸会存为 `assets/face_smug.png`；点击桌宠时自动换成坏笑脸（命名 `happy` 则拖拽时使用）。
坐标不对就调 `dx dy`，重跑 `npm run preview` 检查。

- 参考图路径写在 `tools/process.py` 的 `SRC`，换成新立绘后重跑即可。
- 若零件切缝不理想，调整 `process.py` 里的折线（`earL_line`、`tailR_line`、`legL_line` 等）。

## 目录结构

```
main.js            主进程：透明置顶窗口、鼠标穿透、托盘、位置记忆
preload.js         IPC 桥接（穿透开关 / 移动窗口 / 截图）
src/index.html     页面壳
src/renderer.js    纸偶合成渲染 + 动画状态机（idle/click/drag）+ 鼠标交互
tools/process.py   图像处理管线：去白底、去水印、部件折线切割、底图挖孔、输出 manifest
assets/            零件 PNG + manifest.js（由 process.py 生成）
```

## 动画实现说明

- 每帧先在离屏画布按素材原分辨率合成所有零件（旋转/平移），再整体缩放到主画布，
  避免逐层缩放在图层交界处漏出桌面。
- 底图挖孔时沿零件轮廓保留 3~4px 原图边缘环，零件小幅旋转的位移会被边缘环盖住，不露缝。
- 眨眼：从原图采样的肤色画眼睑滑片 + 睫毛线，只在快速闭眼时出现，不叠加任何手绘表情。
- 拖拽倾斜与松手回弹用弹簧-阻尼模型（`renderer.js` 中 `lean` 相关参数）。

## 常见问题

- **窗口透明异常 / 花屏**：部分老显卡可尝试 `./node_modules/.bin/electron . --disable-gpu`。
- **桌宠不见了**：托盘区找到狐狸头图标可缩放/退出；或删除配置重置位置
  （`%APPDATA%/gilberta-desktop-pet/pet-config.json`）。
