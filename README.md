<div align="center">

<img src="docs/demo.gif" width="256" alt="桌宠演示动画：待机 → 踢腿 → 害羞 → 开心 → 哭泣">

# Gilberta Desktop · 洁尔佩塔桌宠

**《明日方舟：终末地》洁尔佩塔 Q 版桌面宠物** · v1.2

一只住在屏幕角落的狐耳小姑娘：画面 1:1 取自官方风格立绘（抠图切件、原样拼合），
会呼吸、眨眼、摇尾巴，偶尔自己害羞一下，按一下 <kbd>Q</kbd> 就给你表演节目。

**Windows 10 / 11 · x64 · 免安装单文件**

</div>

---

## ✨ 她会做什么

- **常驻桌面**：透明背景、窗口置顶（可关），桌面其余区域完全鼠标穿透；鼠标移到她身上才能点住
- **四个小动作**：按 <kbd>Q</kbd> 循环播放「踢腿」「害羞」（完全还原参考图：双手胸前合十、
  八字眉下垂眼、脸红抿嘴）、「开心」（视频同款原地欢快步，约 6 秒）和「哭泣」
  （嚎啕大哭：`><` 眼角挂泪珠、双手攥拳抵胸，保持期一抽一抽地啜泣）
- **待机也有戏**：呼吸起伏、随机眨眼、狐尾轻摆、狐耳抖动，偶尔歪头，低概率自己害羞一下
- **随手拖走**：按住拖到屏幕任意位置，松手还会晃两下才站稳
- **状态记忆**：位置、大小、置顶、Q 键开关，重启后原样恢复

## 🖥 技术栈

| 层 | 技术 |
| --- | --- |
| 应用壳 | [Electron](https://www.electronjs.org/) 33 —— 透明置顶无边框窗口、鼠标穿透、托盘、全局热键 |
| 渲染 | 原生 **Canvas 2D**「纸偶」实时合成：立绘切片零件（双马尾/狐耳/腿/前臂）在素材像素坐标系里旋转平移，造型与原图完全一致 |
| 动作素材 | 害羞 / 哭泣 = 生成图整身姿势单帧淡入淡出（哭泣保持期带啜泣起伏）；开心 = 视频帧序列（73 帧 / 12fps） |
| 素材管线 | **Python**（Pillow / NumPy / SciPy）：泛洪抠图、模板匹配对齐、色彩配准、去杂边 |
| 开发中 | pixi-live2d-display + Live2D Cubism 4 渲染路径（`npm run live2d` 可体验占位链路） |
| 打包 | electron-builder（Windows 便携 exe） |

## 📦 使用方法

### 方式一：下载 exe（推荐，免装 Node.js）

1. 到 [Releases](https://github.com/M66Y/Endfield-Desktop-Pet/releases) 下载
   **`Gilberta.Desktop.v1.2.Windows.x64.exe`**
2. 双击运行即可——单文件免安装，托盘右键可退出
3. 首次运行若被 SmartScreen 拦截：点「更多信息」→「仍要运行」

> 便携版首次启动需自解压，稍等 1～2 秒她才会出现。

### 方式二：从源代码构建

```bat
git clone https://github.com/M66Y/Endfield-Desktop-Pet.git
cd Endfield-Desktop-Pet
npm install
npm start
```

国内网络拉取 Electron 较慢时，先执行下面这句再 `npm install`：

```bat
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
```

也可以双击 **启动桌宠.bat** 启动。自己打包单文件 exe：

```bat
npm run dist
```

产物在 `dist\Gilberta.Desktop.v1.2.Windows.x64.exe`（需 Node.js ≥ 18）。

### 交互一览

| 操作 | 反应 |
| --- | --- |
| <kbd>Q</kbd> 键（全局） | 循环触发：踢腿 → 害羞 → 开心 → 哭泣 → 踢腿…… |
| 单击 | 小踢腿 |
| 按住拖动 | 跟着鼠标走，身体随速度倾斜，松手晃两下站稳 |
| 静静看着 | 呼吸、眨眼、尾巴飘、耳朵抖，偶尔歪头，低概率自己害羞 |
| 托盘图标 | 缩放 256↔512、窗口置顶开关、Q 键开关、退出 |
| 其余桌面区域 | 完全穿透，点不到、挡不着 |

## ⚠️ 使用注意事项

- **全局 Q 键是系统级热键**：桌宠运行期间，在任何程序（聊天框、文档、游戏）里按
  <kbd>Q</kbd> 都会触发动作，且该按键不会输入到那个程序里。需要打字时，托盘右键 →
  取消「键盘 Q 切换表情（全局）」，该开关会自动记住。
- **杀毒软件误报**：便携 exe 未做代码签名，SmartScreen/杀软可能提示未知发布者，
  添加信任即可；不放心可以完全从源码自行构建。
- **系统要求**：Windows 10 / 11 x64；程序不联网，配置只存在本机 `%APPDATA%`。
- **全屏游戏**：她永远置顶，进入全屏应用前建议托盘退出，避免遮挡。
- **找不到她了**：托盘区有狐狸头图标；若位置跑丢，删除
  `%APPDATA%\gilberta-desktop-pet\pet-config.json` 可复位到初始位置。
- **老显卡透明异常/花屏**：源码运行时可用 `.\node_modules\.bin\electron . --disable-gpu`。
- **Live2D 模式（开发中）**：`npm run live2d` 当前为官方示例模型占位，仅作渲染链路验证，
  示例模型版权归 Live2D Inc.。

<details>
<summary><b>给开发者：项目结构与素材管线</b></summary>

```
main.js            主进程：透明置顶窗口、鼠标穿透、托盘、位置记忆、全局 Q 热键
preload.js         IPC 桥接（穿透开关 / 移动窗口 / 截图 / 热键转发）
src/renderer.js    纸偶合成渲染 + 动作状态机（idle/kick/drag/shy/happy帧序列）+ 热键循环
tools/             素材处理管线（Python + Pillow/numpy/scipy，视频管线另需 ffmpeg）
assets/            零件 PNG + 动作素材 + manifest.js（由管线生成）
```

| 想改的东西 | 用什么 |
| --- | --- |
| 基础切片 | `tools/process.py` —— 参考图抠图、去水印、按折线切可动零件 |
| 害羞整身姿势 | `tools/shy_pose_pack.py` —— 参考图整只角色抠出（去底 + 刘海NCC对齐 + 眉眼暗结构精化 + 脚底锚点配准 + 去白边），单帧 clip 淡入淡出 |
| 哭泣整身姿势 | `tools/cry_pose_pack.py` —— 与害羞同管线；扩边画布防止耳尖/马尾尖被基准画布裁切（对齐解超画布时保完整包围盒） |
| 开心帧序列 | `ffmpeg` 抽帧 → `tools/happy_frames.py` 去底 → `tools/happy_pack.py` 打包 → `tools/happy_fix.py` 切灰边并向纸偶配准色调 → `tools/happy_fit.py` 等比适配纸偶比例（高 622 / 脚底 640 / 居中） |
| 前臂零件 | `tools/arms.py` —— 切出前臂+手套并修补底图挖孔 |
| 换表情贴片 | `tools/face.py` —— 从同角色不同表情生成图切脸贴回（命名 `happy` 拖拽时自动使用） |
| 去白边 | `tools/defringe.py` —— 白底抠图边缘残留的白色混合像素逆向清除 |
| 预览 / 动图 | `npm run preview` 生成透明底姿势截图与帧序列，`python tools/make_gif.py` 合成 GIF |

Q 键动作循环在 `src/renderer.js` 的 `ACTIONS` 注册表：新动作 = 一条注册 + 一个 start 函数；单帧姿势类动作在 `POSE` 表加时间曲线即可。
</details>

## 🗺 未来开发方向

1. **Live2D 化**：使用 Live2D 对基于豆包生成的模型进行优化，让呼吸、摇晃、表情变成真正的连续变形
2. **互动气泡**：添加对话/情绪气泡，她会说话、会吐槽
3. **更多互动动作**：持续扩充动作库（打招呼、睡觉、被戳的搞笑反应……）

## 📄 许可

[MIT](LICENSE) —— 洁尔佩塔角色设定归《明日方舟：终末地》官方所有，项目内立绘为 AI
生成的同人素材，仅供个人娱乐，请勿商用。

---

<div align="center">

# ✨ 她真好看！ ✨

</div>
