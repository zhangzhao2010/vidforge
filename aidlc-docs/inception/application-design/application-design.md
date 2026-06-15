# Application Design（汇总）— vidforge

> 本文汇总 components.md / component-methods.md / services.md / component-dependency.md。详细业务逻辑见后续 Functional Design（per-unit）。

## 1. 设计决策（已确认）

| 决策 | 选择 | 出处 |
|---|---|---|
| 桌面框架 | Electron | Q2=B |
| 前端 | React + TypeScript | Q3=A |
| 进程架构 | 严格分层：main 持密钥/网络/文件，renderer 仅 UI，preload+contextBridge | Q-A1=A |
| IPC 风格 | invoke/handle（命令）+ webContents.send（进度事件） | Q-A2=A |
| 持久化 | SQLite（better-sqlite3） | Q-A3=A |
| 前端状态 | Zustand | Q-A4=A |
| 素材传输 | 本地文件→Base64 内联（≤20MB 校验） | Q-A5=A |
| UI 组件库 | Ant Design | Q-A6=A |
| 密钥存储 | OS 密钥链（keytar） | Q9=A |
| i18n | 中英双语 | Q10=C |
| 测试 | fast-check（PBT Partial）+ 普通单测/集成测试 | Q14→Partial |

## 2. 架构总览

Electron 严格进程分层。renderer（React/AntD/Zustand）经唯一通道 preload contextBridge 与 main 通信。main 进程承载全部敏感能力（密钥、网络、文件、SQLite），通过 services 编排 9 个 main 组件完成业务。详见 components.md 顶部架构图。

**安全基线（即便 Security 扩展未启用，仍作为硬约束）**：
- 明文 API Key 仅存在于 main 进程内存的瞬时使用期，取自 OS 密钥链，绝不经 IPC 传给 renderer，绝不写日志。
- renderer 开启 contextIsolation、关闭 nodeIntegration，仅能访问 preload 白名单 API。
- 本地素材文件的读取与 Base64 编码在 main 完成，renderer 只传文件路径。

## 3. 组件清单（5 单元，16 组件）

- **core-config**：C1 ConfigManager、C2 KeyVault
- **api-client**：C3 HappyHorseClient、C4 RequestBuilder
- **task-engine**：C5 TaskEngine、C6 Poller、C8 Persistence、C9 IpcGateway、S1–S5 services
- **media-store**：C7 MediaStore
- **ui**：C10 PreloadBridge、C11 CapabilityForms、C12 ParameterPanel、C13 TaskQueuePanel、C14 HistoryLibrary、C15 SettingsView、C16 AppShell/i18n/Store

（方法签名见 component-methods.md）

## 4. 服务编排

S1 GenerationService（提交）、S2 TaskMonitorService（轮询+出片+下载）、S3 RecoveryService（重启恢复）、S4 HistoryService（历史/重生成）、S5 ConfigService（配置/密钥）。IPC 通道清单与时序见 services.md。

## 5. 依赖与数据流

单元依赖无环，方向：ui → task-engine →（api-client / media-store / core-config）。task-engine 为编排枢纽。4 条关键数据流（提交含安全边界、轮询出片、重启恢复、配置密钥）见 component-dependency.md。

## 6. 任务状态机（核心）

```
QUEUED → SUBMITTING → PENDING → RUNNING → SUCCEEDED → (download) → 完成
                          │         │           
   cancel→CANCELLED       │         └→ FAILED (可 retry)
   submit失败→FAILED      └→ 超24h/UNKNOWN → EXPIRED
```
此状态机是 task-engine 单元 Functional Design 的核心，也是 PBT 状态流转测试对象。

## 7. 已知技术风险与处理

| 风险 | 处理 |
|---|---|
| video_url 24h 失效 | 成功即自动下载落盘 + 下载失败重试（MediaStore） |
| video-edit 视频可能 >20MB | RequestBuilder.validate 前置校验，超限明确报错 |
| Key/region/baseUrl 不一致致调用失败 | ConfigManager.resolveEndpoint + 提交前一致性校验 |
| 关窗导致任务丢失 | 任务持久化 + 启动恢复（RecoveryService） |
| Key 泄露 | 严格进程分层 + OS 密钥链 + 不入日志/不进 renderer |

## 8. 待后续阶段细化
- 各单元详细业务规则、状态机转移条件、错误码全量映射表 → Functional Design（per-unit）
- 技术栈精确版本、fast-check 配置、并发度/轮询参数 → NFR Requirements
- 加密/重试/节流模式落地 → NFR Design
- 打包分发（electron-builder 等）→ Build and Test
