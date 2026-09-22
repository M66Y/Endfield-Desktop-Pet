<div align="center">

# Endfield Desktop Pet · 终末地桌宠

**《明日方舟：终末地》同人 Q 版桌面宠物** —— 洁尔佩塔、莱万汀、庄方宜、汤汤，四只小姑娘住进你的桌面。

**免安装单文件 exe · 完全离线 · 多宠同屏 · 全局热键互动**

[![Release](https://img.shields.io/github/v/release/M66Y/Endfield-Desktop-Pet)](https://github.com/M66Y/Endfield-Desktop-Pet/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011%20x64-0078D6)](#-常见问题)
[![License](https://img.shields.io/github/license/M66Y/Endfield-Desktop-Pet)](LICENSE)
[![Electron](https://img.shields.io/badge/electron-33-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Stars](https://img.shields.io/github/stars/M66Y/Endfield-Desktop-Pet?style=social)](https://github.com/M66Y/Endfield-Desktop-Pet/stargazers)

<p>
  <img src="docs/demo.gif" width="200" alt="洁尔佩塔演示动画：待机 → 踢腿 → 害羞 → 开心 → 哭泣">
  <img src="docs/lewantin.gif" width="200" alt="莱万汀演示动画：持雪糕 → 吃雪糕 → 掉了委屈 → 生气抱臂 → 打瞌睡 → 被叫醒">
  <img src="docs/zhuangfangyi.gif" width="200" alt="庄方宜演示动画：安静待机 → 害羞 → 比心 → 生气 → 开心">
  <img src="docs/tangtang.gif" width="200" alt="汤汤演示动画：待机倒茶 → 打哈欠 → 开心蹦跳 → 害羞">
</p>

[快速开始](#-快速开始) · [功能特性](#-功能特性) · [使用与配置](#-使用与配置) · [常见问题](#-常见问题) · [参与贡献](#-参与贡献) · [相关链接](#-相关链接)

</div>

---

## 🚀 快速开始

> 本项目**不依赖任何在线服务或 API Key**，下载即用，完全离线运行。

### 方式一：下载 exe（推荐）

到 [Releases](https://github.com/M66Y/Endfield-Desktop-Pet/releases) 下载对应桌宠的 exe 即可，双击运行，免安装。每只桌宠独立打包，文件名格式 `Endfield-Desktop-Pet-<版本>-Windows-x64-<桌宠>.exe`（以 v1.5.0 为例）：

| 文件 | 双击后出现 |
| --- | --- |
| `Endfield-Desktop-Pet-1.5.0-Windows-x64-Gilberta.exe` | 洁尔佩塔 |
| `Endfield-Desktop-Pet-1.5.0-Windows-x64-Lewantin.exe` | 莱万汀 |
| `Endfield-Desktop-Pet-1.5.0-Windows-x64-ZhuangFangyi.exe` | 庄方宜 |
| `Endfield-Desktop-Pet-1.5.0-Windows-x64-Tangtang.exe` | 汤汤 |

- **多宠同屏**：再运行一个 exe 就行——第二只会自动并入第一只的进程，热键不打架。
- 便携版首次启动需自解压，稍等 1～2 秒她才会出现；托盘狐狸头图标右键可退出、缩放、开关热键。
- 首次运行若被 SmartScreen 拦截，见[常见问题](#-常见问题)。

### 方式二：从源码运行

**前置条件**：Windows 10 / 11 x64；[Node.js](https://nodejs.org/) ≥ 18 LTS（含 npm）；Git。 <!-- TODO: 如实际验证过更低的 Node 版本可用，请调整此处 -->

```bat
git clone https://github.com/M66Y/Endfield-Desktop-Pet.git
cd Endfield-Desktop-Pet
npm install

npm start                 &rem 洁尔佩塔（默认）
npm run lewantin          &rem 莱万汀
npm run zhuangfangyi      &rem 庄方宜
npm run tangtang          &rem 汤汤
```

也可以直接双击对应桌宠的 `启动XX.bat`（如 `启动洁尔佩塔.bat`）。

国内网络拉取 Electron 较慢时，先执行 `set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 再 `npm install`。

自己打包（分宠产物，命名见上表）：

```bat
npm run dist              &rem 四只全打
npm run dist:gilberta     &rem 只打洁尔佩塔
npm run dist:lewantin     &rem 只打莱万汀
npm run dist:zhuangfangyi &rem 只打庄方宜
npm run dist:tangtang     &rem 只打汤汤
```

## ✨ 功能特性

| 特性 | 说明 |
| --- | --- |
| **常驻桌面** | 透明背景、窗口置顶（可关）；桌面其余区域完全鼠标穿透，只有她身上能点住 |
| **随手拖走** | 按住拖到屏幕任意位置，松手晃两下才站稳；拖拽可以打断任何动作——也能把睡着的莱万汀拖醒 |
| **多宠同屏** | 四只可以同时住在桌面上；键盘只作用于鼠标悬停 / 点击选中的那一只，互不串扰 |
| **状态记忆** | 每只的位置、大小、置顶互相独立，重启后原样恢复 |
| **托盘控制** | 每只独立：显示 / 隐藏、缩放 256↔512、置顶、重启、关闭；全局热键可分别开关 |
| **完全离线** | 程序不联网、无任何 API Key，配置只存在本机 `%APPDATA%` |

### 四只桌宠

| 角色 | 待机演出 | 动作与操作 |
| --- | --- | --- |
| **洁尔佩塔** | 呼吸、眨眼、尾巴飘、耳朵抖，偶尔歪头害羞（画面 1:1 取自官方风格立绘：抠图切件、原样拼合） | <kbd>Q</kbd> 循环「踢腿」「害羞」「开心」（视频同款欢快步，约 6 秒）「哭泣」（嚎啕大哭 + 一抽一抽地啜泣）；<kbd>Alt</kbd>+<kbd>1</kbd>～<kbd>4</kbd> 直选 <!-- TODO: 补充“视频同款”的出处链接（B站/YouTube 视频地址） --> |
| **莱万汀** | 盘腿坐着举一支老冰棒，呼吸起伏、轻轻摇曳 | 「雪糕小剧场」六动作全上线：<kbd>Q</kbd> 按链循环，<kbd>Alt</kbd>+<kbd>1</kbd>～<kbd>6</kbd> 直选 |
| **庄方宜** | 站姿举茶倒水的安静性子 | <kbd>Alt</kbd>+<kbd>1</kbd>～<kbd>4</kbd> 直选「害羞」（捧颊扭捏）「比心」（心跳扑通）「生气」（攥拳闷气）「开心」（难得的雀跃挥手） |
| **汤汤** | 守着茶桌倒茶待机 | <kbd>Q</kbd> / <kbd>Alt</kbd>+<kbd>1</kbd>～<kbd>3</kbd> 播放「打哈欠」「开心蹦跳」「害羞」——帧序列动画（哈欠三连、腾空蹦跳带星星、捂脸扭捏） |

<div align="center"><img src="docs/lewantin_poses.png" width="600" alt="莱万汀六动作：持雪糕 / 吃雪糕 / 掉了委屈 / 生气抱臂 / 打瞌睡 / 被叫醒"></div>

**莱万汀·雪糕小剧场动作表**：

| # | 动作 | 节奏 |
| --- | --- | --- |
| 1 | 持雪糕 | 举着老冰棒发呆（待机同画面） |
| 2 | 吃雪糕 | 「啊呜啊呜」啃咬起伏，约 3.8 秒 |
| 3 | 雪糕掉了委屈 | 低头 + 一抽一抽地抽噎，约 4.6 秒 |
| 4 | 生气抱臂 | 「哼！」气鼓节奏、抱臂后仰抬下巴，约 4.2 秒 |
| 5 | 打瞌睡 | 慢慢睡着后**一直睡**（深睡呼吸 + Zzz），直到被叫醒 |
| 6 | 被叫醒 | 猛地坐直、揉眼迷糊，缓缓回神，约 3.5 秒 |

## 💻 技术栈

| 层 | 技术 |
| --- | --- |
| 壳 / 多宠管理 | [Electron](https://www.electronjs.org/) 33 —— PetManager 多窗口、单实例锁 + `second-instance` 唤出、全局热键、托盘 |
| 渲染 | 原生 HTML/CSS/JS 整帧序列动画；[pixi.js](https://pixijs.com/) 6 + pixi-live2d-display 仅用于实验性的 Live2D 分支 |
| 打包 | [electron-builder](https://www.electron.build/) 25 —— Windows portable x64，每宠独立 exe |
| 素材管线 | Python 脚本（亮/黑底抠图、切件、多帧配准、打包）+ `ffmpeg` 抽帧 |

架构设计与「如何新增一只桌宠 / 一个动作」见[参与贡献](#-参与贡献)中的开发者指南。

## 🎮 使用与配置

### 交互一览

| 操作 | 反应 |
| --- | --- |
| <kbd>Q</kbd> 键（全局） | 当前选中的桌宠循环播放下一动作 |
| <kbd>Alt</kbd>+<kbd>1</kbd>～<kbd>6</kbd> | 直选对应编号的动作（超出该宠动作数则忽略） |
| 鼠标悬停 / 点击某只 | 该只成为键盘作用目标（多宠并行时避免串扰） |
| 按住拖动 | 跟着鼠标走，身体随速度倾斜，松手晃两下站稳 |
| 静静看着 | 洁尔佩塔：呼吸 / 眨眼 / 尾巴飘 / 耳朵抖；莱万汀、庄方宜、汤汤：呼吸起伏轻摇曳 |
| 托盘图标 | 每只独立：显示 / 隐藏、缩放 256↔512、置顶、重启、关闭；全局：Q 开关、Alt+数字开关、退出 |
| 其余桌面区域 | 完全穿透，点不到、挡不着 |

### 配置与数据

- 所有配置只存本机 `%APPDATA%\gilberta-desktop-pet\`：每宠独立的 `pets\<宠名>\config.json`（位置 / 缩放 / 置顶 / 热键开关）与 `logs\<宠名>.log`。
- 若某只位置跑丢，删除 `%APPDATA%\gilberta-desktop-pet\pets\<宠名>\config.json` 可将她复位到初始位置。
- 托盘里的开关状态会自动记住，重启后生效依旧。

## ❓ 常见问题

**首次运行被 SmartScreen / 杀毒软件拦截？**
便携 exe 未做代码签名，SmartScreen / 杀软可能提示未知发布者：点「更多信息」→「仍要运行」，或添加信任即可。不放心可以完全从源码自行构建。

**想同时养多只？**
先后运行多个 exe 即可，第二只会自动并入第一只的进程（单实例锁 + `additionalData` 转发 petId），热键只注册一份、按选中的桌宠分发，互不串扰。

**找不到她了？**
托盘区有狐狸头图标，菜单里每只都可以单独显示 / 隐藏；若位置跑丢，见上文「配置与数据」的复位方法。

**全局 <kbd>Q</kbd> 键影响打字？**
<kbd>Q</kbd> 是系统级热键，桌宠运行期间在任何程序里按 <kbd>Q</kbd> 都会触发动作且不会输入到那个程序；数字直选用 <kbd>Alt</kbd>+数字，不影响日常打字。托盘右键可分别关闭。

**进入全屏游戏会遮挡？**
她们永远置顶，进入全屏应用前建议托盘退出。

**画面透明异常 / 花屏？**
源码运行时可用 `.\node_modules\.bin\electron . --disable-gpu`（老显卡兼容模式）。

**支持 macOS / Linux 吗？**
官方仅适配并打包 Windows 10 / 11 x64；源码在其他系统上未测试，欢迎反馈。 <!-- TODO: 若你确认过 macOS/Linux 可跑或不可跑，请更新此条 -->

**`npm run live2d` 是什么？**
开发中的 Live2D 渲染链路验证，当前为官方示例模型占位，示例模型版权归 Live2D Inc.，不随作品分发。

## 🤝 参与贡献

欢迎 [Issue](https://github.com/M66Y/Endfield-Desktop-Pet/issues) 反馈 bug、提议新动作 / 新桌宠的点子；PR 同样欢迎，动手前建议先跑 `npm run preview` 做回归验证（六张姿势截图应与 `tools/pets/jielpeita/regress_v13_base/` 逐像素一致）。

<details>
<summary><b>开发者指南：多宠架构与素材管线</b></summary>

```
main.js                     主进程：PetManager 多窗口 / 单实例锁 + second-instance 唤出
                            / 全局热键(Q + Alt+数字)按激活桌宠路由 / 托盘 / 按宠配置与日志
preload.js                  IPC 桥（petId 由主进程按 sender 反查，客户端不可伪造）
src/shell.js + index.html   通用壳：按 ?pet=<id> 加载该宠 manifest 与 renderer
src/core/                   通用运行时：pet-runtime.js（初始化/资源解析/输入绑定/悬停上报）
                            + action-registry.js（Q 循环 = Alt+数字序）+ frame-pet.js（整帧桌宠模板）
src/pets/<petId>/           每宠独立包：pet.json 描述符（动作链/标签）+ renderer.js（模板配置或专属渲染）
assets/pets/<petId>/        每宠独立资源：素材 + manifest.js（管线生成）
tools/shared/               共享素材管线：pose_lib.py（亮/黑底抠图、统一规格、多帧配准）+ make_gif.py
tools/pets/<petId>/         每宠动作打包脚本（<动作>_pack.py，8 行调用共享管线）
userData/pets/<petId>/      每宠独立配置（位置/缩放/置顶）；userData/logs/<petId>.log 独立日志
```

**新增一只桌宠** = `src/pets/<id>/pet.json` + `renderer.js`（整帧宠只需 ~20 行 `createFramePet` 配置）+ `assets/pets/<id>/` 三件套，main.js 扫描注册表自动发现；再仿照 `dist:lewantin` 加一条打包脚本即可得到独立 exe。不同 exe 共用同一份 userData（配置与单实例锁），双开时第二个实例通过 `requestSingleInstanceLock` 的 `additionalData` 把自己的 petId 转发给已运行实例，同进程唤出、热键唯一注册。

**新增一个动作**：参考图放 `tools/pets/<id>/ref_<动作>.png` → 仿照 `eat_pack.py` 写 8 行打包脚本（共享管线 `tools/shared/pose_lib.py`：亮/黑底泛洪去底、水印清除、大连通域过滤、封闭黑洞清除、统一规格角色高632·帧640·底心锚定；离散帧序列用 `pack_sequence` 统一配准，支持带位移的蹦跳类动画）→ 模板 `poseTable` 加一条情绪节奏曲线（`hold: Infinity` 即持续态）→ `pet.json` 的 `actions` 登记编号（顺序即 Q 循环与 Alt+数字序，上限 9）。

| 想改的东西 | 用什么 |
| --- | --- |
| 洁尔佩塔基础切片 | `tools/pets/jielpeita/process.py` —— 参考图抠图、去水印、按折线切可动零件 |
| 害羞 / 哭泣整身姿势 | `shy_pose_pack.py` / `cry_pose_pack.py` —— 整只抠出（去底 + 刘海NCC对齐 + 脚底锚点配准 + 去白边） |
| 开心帧序列 | `ffmpeg` 抽帧 → `happy_frames.py` 去底 → `happy_pack.py` 打包 → `happy_fix.py` 切灰边配色 → `happy_fit.py` 等比适配 |
| 莱万汀姿势动作 | `tools/pets/lewantin/pose_lib.py` 共享管线 + 各动作 `*_pack.py`（idle / eat / drop_sad / angry_arms / sleep / wake） |
| 前臂零件 / 表情贴片 / 去白边 | `arms.py` / `face.py` / `defringe.py` |
| 预览 / 动图 | `npm run preview [-- --pet=lewantin]` 生成截图与帧序列，`python tools/shared/make_gif.py [petId]` 合成 GIF |
| 回归验证 | `npm run preview` 六张姿势截图应与 `tools/pets/jielpeita/regress_v13_base/` 逐像素一致 |

**隔离设计要点**：每宠独立 BrowserWindow（独立渲染进程，动画状态天然隔离）；资源解析限定 `assets/pets/<petId>/`；IPC 一律由主进程按 sender 反查归属；键盘热键全局只注册一份，按「最近悬停命中或点击选中」的桌宠分发；单实例锁 + additionalData 保证多开 exe 在同一进程内唤出对应桌宠。
</details>

## 🗺 路线图

1. **持续陪伴行为**：挂机一段时间自己打瞌睡、随机小剧场等自动编排（汤汤的打瞌睡持续态已就绪）
2. **Live2D 化**：使用 Live2D 对基于豆包生成的模型进行优化，让呼吸、摇晃、表情变成真正的连续变形
3. **互动气泡**：添加对话 / 情绪气泡，她们会说话、会吐槽
4. **更多互动动作**：持续扩充动作库（打招呼、被戳的搞笑反应……）

## 📄 许可证

[MIT](LICENSE)。

**素材与版权声明**：洁尔佩塔、莱万汀、庄方宜、汤汤角色设定归《明日方舟：终末地》官方（鹰角网络 / Hypergryph）所有；项目内立绘为 AI 生成的同人素材，仅供个人娱乐，请勿商用。本项目为非官方同人作品，与官方无关。

## 🔗 相关链接

- [Releases（下载与更新日志）](https://github.com/M66Y/Endfield-Desktop-Pet/releases)
- [Issues（问题反馈与建议）](https://github.com/M66Y/Endfield-Desktop-Pet/issues)
- [路线图](#-路线图)
- 演示视频：<!-- TODO: 补充 B站 / YouTube 演示视频链接 -->

---

<div align="center">

她们真好看 ✨

</div>
