# Services & Orchestration — vidforge

服务层位于 main 进程，编排各组件完成端到端业务流。IPC 通信遵循 Q-A2=A：命令用 `invoke/handle`，持续更新用事件推送。

## 服务定义

### S1. GenerationService
- **职责**：编排"提交生成任务"全流程。
- **协作**：ConfigManager（解析端点）→ KeyVault（取 Key）→ RequestBuilder（校验+构造）→ TaskEngine（入队）。
- **流程**：
  1. 接收 GenParams + profileId
  2. RequestBuilder.validate → 不通过则返回错误（含中英可读信息）
  3. ConfigManager.resolveEndpoint + KeyVault.getKey 组装 AuthContext
  4. TaskEngine.enqueue → 返回 localId
  5. 实际 HTTP submit 由 TaskEngine 在状态机 SUBMITTING 阶段调用 HappyHorseClient 完成

### S2. TaskMonitorService
- **职责**：编排任务轮询、状态推进、结果下载。
- **协作**：TaskEngine + Poller + HappyHorseClient + MediaStore + Persistence + IpcGateway。
- **流程**：
  1. 任务进入 PENDING 后 Poller.startPolling
  2. 每次轮询 HappyHorseClient.query → TaskEngine.transition → Persistence.upsert → IpcGateway.broadcastTaskUpdate
  3. SUCCEEDED → MediaStore.download（24h 内）→ 写 history → 推送最终状态
  4. FAILED/EXPIRED → 记录错误/过期 → 停止轮询 → 推送

### S3. RecoveryService
- **职责**：应用启动时恢复未完成任务（FR-3.4）。
- **协作**：Persistence + TaskEngine + Poller。
- **流程**：启动时 TaskEngine.recoverOnStartup → 读取未完成任务 → 对仍在 24h 内的重挂 Poller；已过期的标记 EXPIRED。

### S4. HistoryService
- **职责**：历史库查询、重生成、打开文件夹、下载重试。
- **协作**：MediaStore + Persistence + GenerationService（重生成时复用提交流程）。

### S5. ConfigService
- **职责**：配置与密钥的读写编排（renderer 永不接触明文 Key）。
- **协作**：ConfigManager + KeyVault。
- **约束**：`setKey` 写入后只回传成功/失败；查询只回传 `hasKey` 布尔与 Profile 元数据。

## IPC 通道清单（IpcGateway 注册）

| 通道 | 类型 | 服务 | 说明 |
|---|---|---|---|
| `task:submit` | invoke | GenerationService | 提交生成任务 |
| `task:cancel` | invoke | TaskEngine | 取消任务 |
| `task:retry` | invoke | TaskEngine | 重试失败任务 |
| `task:list` | invoke | TaskEngine | 列出当前任务 |
| `history:list` | invoke | HistoryService | 历史列表 |
| `history:regenerate` | invoke | HistoryService | 基于历史参数重生成 |
| `history:openFolder` | invoke | HistoryService | 打开视频所在文件夹 |
| `history:retryDownload` | invoke | HistoryService | 重试下载 |
| `config:get` / `config:update` | invoke | ConfigService | 读写配置 |
| `profile:setKey` / `profile:hasKey` / `profile:list` / `profile:delete` | invoke | ConfigService | 密钥与 Profile 管理 |
| `task-updated` | event (main→renderer) | TaskMonitorService | 任务状态/进度实时推送 |

## 编排时序（提交→出片，文字时序）

```
Renderer        Preload/IPC      GenerationService   TaskEngine   HappyHorseClient  Poller   MediaStore
  | submit ------->|                  |                  |              |             |          |
  |                | task:submit ---> validate/auth      |              |             |          |
  |                |                  | enqueue -------> | SUBMITTING   |             |          |
  |                |                  |                  | submit ----> | task_id     |          |
  |                |                  |                  | PENDING ---------------- startPolling |
  |<-- task-updated (PENDING) --------------------------- broadcast    |             |          |
  |                |                  |                  |              | query(15s)->| RUNNING  |
  |<-- task-updated (RUNNING) ------------------------------------------ broadcast              |
  |                |                  |                  |              | SUCCEEDED -> download -->|
  |<-- task-updated (SUCCEEDED + localVideoPath) ----------------------- broadcast (+history)    |
```

## 错误与韧性约定（NFR-3.2）
- 网络瞬时错误：HappyHorseClient/Poller 做有限次退避重试。
- 提交失败：任务置 FAILED，保留参数，支持 retry。
- 轮询到 UNKNOWN 或超 24h：置 EXPIRED，停止轮询，提示用户。
- 下载失败：保留 video_url（若仍在有效期），支持 retryDownload。
- 所有错误信息映射为中英双语可读文案。
