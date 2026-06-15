# VidForge 开发记录 & 迭代交接

> 本文件是跨 session 的「项目记忆」与下一轮迭代的起点。新 session 接手时**先读本文件 + `aidlc-docs/aidlc-state.md`**。

## 版本历史

### v0.1.0 — 第一版（2026-06-15）✅ 本地测试通过
- **流程**：完整走 AI-DLC（INCEPTION→CONSTRUCTION→Build&Test）。
- **分支/提交**：`feat/initial-implementation` @ `db57f06`，已推送 origin。
- **状态**：本地 Mac/Windows 实测功能通过。

## 架构速览（v1 实现）

Electron 严格进程隔离，单一 npm 包，5 个单元：

| 单元 | 路径 | 职责 |
|---|---|---|
| core-config | `src/main/core-config/` | ConfigManager（配置/端点解析）+ KeyVault（keytar 密钥链） |
| api-client | `src/main/api-client/` | HappyHorseClient（提交/查询）+ RequestBuilder（请求构造/校验/Base64） |
| task-engine | `src/main/task-engine/` | TaskEngine（状态机/并发队列）+ Poller + Persistence(SQLite) + IpcGateway + services(S1-S5) |
| media-store | `src/main/media-store/` | MediaStore（视频下载落盘 + 历史） |
| ui | `src/renderer/` + `src/preload/` | React/AntD/Zustand + i18n；preload 经 contextBridge 暴露 `window.vidforge` |

共享层 `src/shared/`：types / capabilities（model 名、端点、参数约束常量）/ errors（错误码→中英映射）/ ipc（通道名）。

## 锁定的关键决策（v2 沿用，除非明确推翻）

- 纯客户端，用户自带 API Key（不做后端）
- Electron + React/TS + Ant Design + Zustand
- 进程隔离：明文 Key 仅 main 进程用，绝不进 renderer / 不入日志
- SQLite(better-sqlite3) 持久化；keytar 存 Key
- 素材本地文件→Base64 内联（≤20MB 校验）
- 并发任务队列（上限 `MAX_CONCURRENT=3`，在 `TaskEngine.ts`）
- 轮询 15s（`POLL_INTERVAL_MS`），task/video 24h 有效期（`TASK_TTL_MS`）
- 测试：fast-check PBT（Partial：强制纯逻辑），UI/网络用集成测试

## 环境注意事项（踩过的坑）

1. **原生模块编译**：better-sqlite3 / keytar 需要 C++ 工具链。本开发环境曾缺 `g++`，靠 `sudo dnf install -y gcc-c++` 解决。新环境 `npm install` 失败先查 g++/make/python3。
2. **preload 必须 CJS**：sandbox 模式下 preload 不能是 ESM；`electron.vite.config.ts` 已强制 preload 输出 `format: 'cjs'` + `.js`。
3. **纯逻辑测试不要顶层 import electron**：`ConfigManager` 用 `getElectronApp()` 懒加载 electron，避免测试时拉入 electron 二进制。
4. **此 Linux 服务器无显示器**，跑不了 Electron GUI；GUI 实测须在本地 Mac/Windows。

## 测试与构建

```bash
npm install
npm test          # 15 passed (12 PBT + 3 集成)
npm run typecheck
npm run build     # electron-vite → out/
npm run package:mac / package:win
```

## v2 候选事项（待用户确认优先级，尚未排期）

来自 v1 有意省略的部分 + 已知改进点：

- [ ] 安装包**代码签名 / 公证**（macOS notarization、Windows 签名）
- [ ] 历史库增强：**缩略图生成**、搜索、分类、删除
- [ ] 素材输入支持 **公网 URL / OSS**（绕开 20MB Base64 限制，尤其 video-edit 大视频）
- [ ] renderer bundle 1.8MB → **代码分割 / 懒加载**（超 vite 默认警告阈值）
- [ ] 任务失败的**指数退避重试**更完善；网络中断恢复体验
- [ ] **错误码映射表补全**（对照百炼错误码文档逐条覆盖）
- [ ] 设置项：可配置并发度、轮询间隔、默认下载目录可改
- [ ] **CI**（GitHub Actions）：跑测试 + 多平台打包；PBT seed 日志
- [ ] r2v 的 `[Image N]` 指代在 UI 上做可视化插入辅助
- [ ] i18n 文案审校；更多语言
- [ ] 进度展示更真实（目前 TaskQueuePanel 进度条是占位百分比）

## 下一个 session 怎么接手

1. 读 `aidlc-state.md`（状态）+ 本文件（架构/决策/坑/待办）。
2. 项目现在是 **Brownfield**。按 AI-DLC，v2 可选：
   - 让 AI 做 Reverse Engineering 重新理解代码，或
   - 直接以现有设计工件（`aidlc-docs/inception/application-design/`）+ 本文件为上下文，进入 Requirements Analysis 谈 v2 需求。
3. 从 `feat/initial-implementation`（或合并到 main 后）拉新分支做 v2。
