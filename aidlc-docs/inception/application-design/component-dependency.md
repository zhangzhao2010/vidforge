# Component Dependencies & Data Flow — vidforge

## 依赖矩阵（→ 表示"依赖/调用"）

| 组件 | 依赖 |
|---|---|
| C11–C16 (renderer UI) | → C10 PreloadBridge（仅此一条通往 main 的路） |
| C10 PreloadBridge | → IPC 通道（C9 IpcGateway） |
| C9 IpcGateway | → S1–S5 services |
| S1 GenerationService | → C1 ConfigManager, C2 KeyVault, C4 RequestBuilder, C5 TaskEngine |
| S2 TaskMonitorService | → C5 TaskEngine, C6 Poller, C3 HappyHorseClient, C7 MediaStore, C8 Persistence, C9 IpcGateway |
| S3 RecoveryService | → C8 Persistence, C5 TaskEngine, C6 Poller |
| S4 HistoryService | → C7 MediaStore, C8 Persistence, S1 GenerationService |
| S5 ConfigService | → C1 ConfigManager, C2 KeyVault |
| C5 TaskEngine | → C3 HappyHorseClient, C6 Poller, C8 Persistence |
| C6 Poller | → C3 HappyHorseClient |
| C7 MediaStore | → C8 Persistence |
| C4 RequestBuilder | →（无，纯逻辑，PBT 核心） |
| C1/C2/C8 | →（叶子：配置/密钥/存储） |

## 单元 → 组件归属

| 单元 | 组件 |
|---|---|
| **core-config** | C1 ConfigManager, C2 KeyVault |
| **api-client** | C3 HappyHorseClient, C4 RequestBuilder |
| **task-engine** | C5 TaskEngine, C6 Poller, C8 Persistence, C9 IpcGateway, S1–S5 services |
| **media-store** | C7 MediaStore |
| **ui** | C10 PreloadBridge, C11–C16 renderer 组件 |

## 单元依赖图

```
        ui ──────────────► task-engine ──────► api-client ──────► core-config
                               │                                      ▲
                               ├──────────────► media-store           │
                               └──────────────────────────────────────┘
                               (services 编排，跨单元依赖收敛在 task-engine)
```

- **无环**：依赖方向单向收敛。core-config 是最底层叶子，ui 是最顶层。
- **task-engine 是枢纽**：承载 services 与 IPC，依赖 api-client / media-store / core-config。

## 关键数据流

### DF-1 提交生成（含安全边界）
```
[renderer] GenParams(文件用 path，不读内容)
   → IPC task:submit
   → [main] S1: validate → 读本地文件转 Base64(C4) → 取 Key(C2，明文仅 main)
   → C5 入队 → C3 submit(带 Authorization) → task_id
```
> 安全要点：明文 API Key 只在 main 进程内从 KeyVault 取出并用于 HTTP 头；**绝不经 IPC 传到 renderer**。renderer 只传文件路径，文件读取与 Base64 编码在 main 完成。

### DF-2 轮询与出片
```
[main] C6 Poller (~15s) → C3 query → C5 transition → C8 persist
   → IpcGateway broadcast 'task-updated' → [renderer] Zustand 更新 → UI 刷新
   → SUCCEEDED: C7 download(video_url) → 本地 mp4 + history 入库 → 再 broadcast
```

### DF-3 重启恢复
```
启动 → S3 RecoveryService → C8 读未完成任务
   → 仍在24h内: C6 重挂轮询 ; 已过期: 标记 EXPIRED
   → broadcast 当前任务列表 → renderer 渲染
```

### DF-4 配置与密钥
```
[renderer] SettingsView 输入 Key+region+baseUrl
   → IPC profile:setKey / config:update
   → [main] S5 → C2 写 OS 密钥链(Key) + C1 写配置(region/baseUrl，非敏感)
   → 回传仅成功/失败，明文不回流
```

## 通信模式总结
- **renderer ↔ main**：唯一通道是 preload contextBridge（C10）→ IPC。renderer 无 nodeIntegration、开 contextIsolation。
- **命令**：`ipcRenderer.invoke` / `ipcMain.handle`（请求-响应）。
- **进度**：`webContents.send('task-updated')` / `onTaskUpdate`（main→renderer 单向推送）。
- **main 内部**：直接函数调用（同进程）。
