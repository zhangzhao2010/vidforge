# Components — vidforge

应用基于 Electron 严格进程分层（Q-A1=A）：**main 进程**持有所有敏感能力（密钥、网络、文件），**renderer 进程**仅做 UI，经由 **preload + contextBridge** 暴露的受限 API（IPC）与 main 通信。

```
┌─────────────────────────────────────────────────────────┐
│ RENDERER PROCESS (React + TS, Ant Design, Zustand)        │
│  UI 组件 + 前端状态。无 Node 能力，无明文 Key，不发外网请求 │
└───────────────▲───────────────────────────┬──────────────┘
                │ IPC events (progress)      │ IPC invoke (commands)
                │ webContents.send           │ contextBridge → ipcRenderer.invoke
┌───────────────┴───────────────────────────▼──────────────┐
│ PRELOAD (contextBridge)  — 受限、白名单化的 API 暴露        │
└───────────────▲───────────────────────────┬──────────────┘
                │                            │
┌───────────────┴───────────────────────────▼──────────────┐
│ MAIN PROCESS                                              │
│  IpcGateway → Services → Components:                      │
│  ConfigManager / KeyVault / HappyHorseClient /           │
│  TaskEngine / Poller / MediaStore / Persistence(SQLite)  │
└──────────────────────────────────────────────────────────┘
```

---

## main 进程组件

### C1. ConfigManager（单元：core-config）
- **目的**：管理非敏感配置（当前选中的 region、自定义 baseURL、下载目录、语言、水印默认值等）。
- **职责**：读写配置（持久化到 SQLite 或配置文件）；校验 region 与 baseURL 一致性；提供默认值。
- **接口**：`getConfig()`, `updateConfig(patch)`, `resolveEndpoint()`（根据 region/自定义 baseURL 得出实际调用 URL）。

### C2. KeyVault（单元：core-config）
- **目的**：API Key 的安全存储与取用，明文绝不落盘、绝不进日志（NFR-2.1）。
- **职责**：通过 OS 密钥链（macOS Keychain / Windows Credential Manager，库：keytar）加密存取 Key；按 region 管理多组 Key；提供"是否已配置"查询而不回传明文给 renderer。
- **接口**：`setKey(profileId, apiKey)`, `getKey(profileId)`（仅 main 内部使用）, `hasKey(profileId)`, `listProfiles()`, `deleteKey(profileId)`。
- **安全约束**：`getKey` 返回的明文只在 main 进程网络请求时使用，不经 IPC 传给 renderer。

### C3. HappyHorseClient（单元：api-client）
- **目的**：封装 HappyHorse 统一端点的提交与查询，屏蔽四种能力差异。
- **职责**：构造请求体（按 capability 映射 model 与 input/media 结构）；附加 `X-DashScope-Async: enable` 与 `Authorization`；提交任务拿 task_id；查询任务状态；错误码→可读消息映射。
- **接口**：`submit(capability, payload, auth)` → `{taskId}`；`query(taskId, auth)` → `TaskResult`。
- **不负责**：轮询循环、持久化、下载（由 TaskEngine/MediaStore 负责）。

### C4. RequestBuilder（单元：api-client，C3 的内部协作者）
- **目的**：把 UI 传来的能力参数构造成合法请求体；是 PBT 重点对象（PBT-01/02/03/07）。
- **职责**：t2v/i2v/r2v/video-edit 的 input 与 media 数组组装；参数（resolution/ratio/duration/watermark/seed）校验与默认值填充；Base64 数据 URI 拼装（`data:{mime};base64,{data}`）；素材约束校验（数量、格式、尺寸、≤20MB）。
- **接口**：`build(capability, params)` → `RequestBody`；`validate(capability, params)` → `ValidationResult`。

### C5. TaskEngine（单元：task-engine）
- **目的**：任务全生命周期管理 —— 并发队列、状态机、持久化、重启恢复。
- **职责**：接收提交请求并入队；控制并发度；驱动状态机 `QUEUED→SUBMITTING→PENDING→RUNNING→SUCCEEDED/FAILED/EXPIRED`；持久化每次状态变更；启动时从持久层恢复未完成任务并重新挂上轮询；任务成功后委托 MediaStore 下载。
- **接口**：`enqueue(capability, params)`, `cancel(taskId)`, `retry(taskId)`, `listTasks()`, `recoverOnStartup()`。

### C6. Poller（单元：task-engine，C5 的协作者）
- **目的**：按节流间隔轮询任务状态，遵守 RPS 限制。
- **职责**：以约 15 秒间隔查询；指数退避处理瞬时网络错误；检测 24h 过期（UNKNOWN→EXPIRED）；将状态变化回报 TaskEngine。
- **接口**：`startPolling(taskId)`, `stopPolling(taskId)`。

### C7. MediaStore（单元：media-store）
- **目的**：结果视频下载落盘 + 生成历史管理（应对 video_url 24h 失效，FR-4）。
- **职责**：在有效期内下载 video_url 到配置目录；下载失败重试；记录历史（prompt、参数、能力、时间、本地路径）；（尽力）生成缩略图；提供历史查询与"基于历史重生成"所需的参数回取。
- **接口**：`download(taskId, videoUrl)`, `retryDownload(taskId)`, `listHistory(filter)`, `getHistoryParams(historyId)`, `openInFolder(historyId)`。

### C8. Persistence（单元：task-engine / 共享）
- **目的**：SQLite 数据访问层（Q-A3=A，better-sqlite3）。
- **职责**：tasks、history、config 三类表的 CRUD；序列化/反序列化任务参数（PBT-02 往返测试对象）；迁移与初始化。
- **接口**：`tasks.upsert/get/list/delete`, `history.insert/list/get`, `config.get/set`。

### C9. IpcGateway（单元：task-engine / main 入口）
- **目的**：main 进程统一的 IPC 入口，注册 `ipcMain.handle` 处理器，向 renderer 推送进度事件。
- **职责**：把 renderer 命令路由到对应 Service；订阅 TaskEngine 的状态变更并 `webContents.send` 推给 renderer；做入参基本校验与错误封装。
- **接口（IPC 通道）**：见 services.md。

## preload 组件

### C10. PreloadBridge（单元：ui / 桥接）
- **目的**：用 contextBridge 暴露白名单化的 `window.vidforge` API 给 renderer。
- **职责**：包装 `ipcRenderer.invoke(channel, args)` 为类型化方法；订阅 main 推送事件并转交回调。**不暴露任意 ipcRenderer、不暴露 Node。**
- **接口**：`window.vidforge.{submitTask, cancelTask, retryTask, listTasks, listHistory, getConfig, updateConfig, setKey, hasKey, listProfiles, onTaskUpdate(cb), ...}`。

## renderer 进程组件（React，单元：ui）

### C11. CapabilityForms
- t2v / i2v / r2v / video-edit 四个能力的素材输入与 prompt 输入区（无素材 / 单图 / 多图 / 视频+图）。含本地文件选择、前端预校验、r2v 的 `[Image N]` 指代插入。

### C12. ParameterPanel
- 分辨率、宽高比、时长、水印、seed 的参数面板，按当前能力动态展示可选项与默认值。

### C13. TaskQueuePanel
- 并发任务列表，展示每个任务状态、进度、错误信息；取消/重试入口；订阅 `onTaskUpdate` 实时刷新。

### C14. HistoryLibrary
- 已完成视频的本地历史库：列表/缩略图、播放、查看参数、一键重生成、打开所在文件夹。

### C15. SettingsView
- API Key + region + 自定义 baseURL 配置、下载目录、语言切换、默认参数。Key 输入后经 IPC 存入 KeyVault，输入框不回显明文。

### C16. AppShell + i18n + Store
- 应用外壳（导航/布局，Ant Design）、i18n（中英双语，Q10=C）、Zustand 全局 store（任务、历史、配置的前端镜像）。
