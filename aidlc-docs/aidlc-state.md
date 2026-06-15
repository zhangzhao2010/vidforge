# AI-DLC State Tracking

## Project Information
- **Project Name**: vidforge
- **Project Type**: Greenfield → Brownfield (v1 shipped)
- **Start Date**: 2026-06-15T00:00:00Z
- **Current Phase**: v1 COMPLETE — ready for next iteration
- **Current Stage**: Idle (awaiting v2 requirements in a new session)

## Workspace State
- **Existing Code**: No
- **Programming Languages**: None (greenfield)
- **Build System**: None
- **Project Structure**: Empty
- **Reverse Engineering Needed**: No
- **Workspace Root**: /home/ecs-user/workspace/code/github/vidforge

## Code Location Rules
- **Application Code**: Workspace root (NEVER in aidlc-docs/)
- **Documentation**: aidlc-docs/ only

## Extension Configuration
| Extension | Enabled | Mode | Decided At |
|---|---|---|---|
| Security Baseline | No | — | Requirements Analysis |
| Resiliency Baseline | No | — | Requirements Analysis |
| Property-Based Testing | Yes | Partial (enforce PBT-02, PBT-03, PBT-07, PBT-08, PBT-09; others advisory) | Requirements Analysis |

Note: Although Security Baseline extension is disabled, API Key encryption via OS keychain (Q9=A) is an explicit functional requirement and will still be implemented.
PBT framework for TS/JS: fast-check (per PBT-09).

## Execution Plan Summary
- **Stages to Execute**: Application Design, Units Generation, Functional Design, NFR Requirements, NFR Design, Code Generation, Build and Test
- **Stages to Skip**: User Stories (open-source single-team tool), Infrastructure Design (local desktop app, no cloud resources)
- **Initial Units (tentative)**: core-config, api-client, task-engine, media-store, ui

## Current Status
- **Lifecycle Phase**: v1 COMPLETE
- **Status**: 第一版功能在本地（Mac/Windows）测试通过，已提交并推送到 origin/feat/initial-implementation。
- **Code org**: single npm package, src/{shared,main/{core-config,api-client,task-engine,media-store},preload,renderer}. Build order followed U1→U2→U3→U4→U5.
- **Next**: 新 session 进行 v2 迭代。届时为 Brownfield，按 AI-DLC 应先做 Reverse Engineering（或直接复用本文档与现有设计工件作为上下文）。

## Per-Unit Construction Progress (autonomous mode — recommended options)
- [x] U1 core-config: ConfigManager + KeyVault (+ resolveEndpoint PBT)
- [x] U2 api-client: HappyHorseClient + RequestBuilder (+ PBT round-trip/invariant)
- [x] U3 task-engine: TaskEngine/stateMachine/Poller/Persistence/IpcGateway/services (+ PBT + integration)
- [x] U4 media-store: MediaStore (download + history)
- [x] U5 ui: preload bridge + React/AntD/Zustand + i18n (CapabilityForms/ParameterPanel/TaskQueuePanel/HistoryLibrary/SettingsView/AppShell)
- [x] Build and Test: 15 tests pass, typecheck pass, electron-vite build pass

## Result
- Code under src/{shared,main/*,preload,renderer}; tests under tests/; build to out/.
- Env fix: installed gcc-c++ (was missing g++) for native modules.
- Tests: 15 passed (12 PBT + 3 integration). typecheck + build green.

## Key Design Decisions (locked)
Electron strict process isolation (main=secrets/network/files, renderer=UI only, preload+contextBridge) | IPC: invoke/handle + webContents.send | SQLite (better-sqlite3) | Zustand | media as local-file→Base64 (≤20MB validate) | Ant Design | keytar for keys | zh/en i18n | fast-check PBT Partial

## Stage Progress
### 🔵 INCEPTION PHASE
- [x] Workspace Detection (Greenfield confirmed)
- [x] Reverse Engineering (SKIPPED — greenfield)
- [x] Requirements Analysis (requirements.md approved)
- [x] User Stories (SKIP)
- [x] Workflow Planning (execution-plan.md generated, awaiting approval)
- [x] Application Design - EXECUTE (approved)
- [x] Units Generation - EXECUTE (approved)

### 🟢 CONSTRUCTION PHASE
- [x] Functional Design - condensed per-unit (autonomous mode)
- [x] NFR Requirements - folded into FD/code (fast-check selected; keychain; concurrency=3; poll 15s)
- [x] NFR Design - folded into code (process isolation, retry, polling throttle, persistence)
- [x] Infrastructure Design - SKIP
- [x] Code Generation - EXECUTE (all 5 units)
- [x] Build and Test - 15 tests pass, typecheck pass, build pass; v1 manually verified on local Mac/Win

### 🟡 OPERATIONS PHASE
- [ ] Operations - PLACEHOLDER

---

## v2 Iteration — Task-centric Refactor (2026-06-15)
**Status**: CONSTRUCTION complete — typecheck + 27 tests + build green; awaiting user local GUI verification.

### Locked Decisions (v2)
- 两层领域模型：`Task`（容器，capability 创建时固定）+ `Generation`（单次运行，原 `TaskRecord` 重命名，加 `taskId` 外键；远端 task_id 字段重命名 `taskRemoteId` 避免与容器 FK 冲突）。
- 并发策略：`MAX_CONCURRENT = 1`（全局同时只跑一个生成，前一个终态后泵起下一个）。
- 旧数据：清空重来（Persistence.migrate 检测 v1 扁平 tasks 表无 name 列即 drop 重建；删除 history 表）。
- 任务命名：占位名 `unnamed::{cap}::{iso}`，首次生成 prompt 非空时 `deriveTaskName` 回填（用户手改后不再覆盖）。
- 本地媒体播放：`vidforge-media://` 自定义协议（registerSchemesAsPrivileged + protocol.handle + net.fetch），仅允许 userData 子路径（`resolveMediaPath` 防目录穿越），不放开 sandbox/webSecurity。
- 素材持久化：提交时 file 源拷进 `userData/assets/`（`MediaStore.persistAsset`），改写 path、保留 originalPath。
- UI：左导航顶部「创建任务」按钮 + 「任务」可折叠列表 + 设置；移除「历史」。详情页左配置（固定 capability，无 Tabs）/ 右结果竖向 GenerationCard。

### Result (v2)
27 tests pass（原 15 → 27）；typecheck pass；electron-vite build pass（main 41.6KB）。PBT 价值体现：抓出 startsWith('..') 误杀 '..a' 合法文件名的真 bug，改为按路径段判断。
