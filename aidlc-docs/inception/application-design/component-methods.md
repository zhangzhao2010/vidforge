# Component Methods — vidforge

方法签名为高层接口契约（TypeScript 风格示意）。详细业务规则在 Functional Design（per-unit）阶段细化。类型以 `types.ts` 共享定义为准。

## 共享类型（示意）

```ts
type Capability = 't2v' | 'i2v' | 'r2v' | 'video-edit';
type Region = 'cn-beijing' | 'ap-southeast-1' | 'us-east-1' | 'eu-central-1' | 'custom';
type TaskStatus = 'QUEUED' | 'SUBMITTING' | 'PENDING' | 'RUNNING'
                | 'SUCCEEDED' | 'FAILED' | 'EXPIRED' | 'CANCELLED';

interface GenParams {
  capability: Capability;
  prompt?: string;
  media?: MediaInput[];          // i2v: 1 first_frame; r2v: 1-9 reference_image; video-edit: video+image
  resolution?: '720P' | '1080P';
  ratio?: string;                // '16:9' | '9:16' | ...
  duration?: number;             // 3-15
  watermark?: boolean;
  seed?: number;
}

interface MediaInput { type: 'first_frame'|'reference_image'|'video'; source: {kind:'file', path:string} | {kind:'url', url:string}; }
interface Profile { id: string; name: string; region: Region; baseUrl?: string; }
interface TaskRecord { taskId?: string; localId: string; status: TaskStatus; params: GenParams;
  profileId: string; createdAt: string; updatedAt: string; videoUrl?: string;
  localVideoPath?: string; errorCode?: string; errorMessage?: string; }
interface ValidationResult { ok: boolean; errors: string[]; }
```

## C1. ConfigManager
```ts
getConfig(): AppConfig
updateConfig(patch: Partial<AppConfig>): AppConfig
resolveEndpoint(profile: Profile): string   // 自定义 baseUrl 优先，否则按 region 映射默认端点
```

## C2. KeyVault
```ts
setKey(profileId: string, apiKey: string): Promise<void>     // 写 OS 密钥链
getKey(profileId: string): Promise<string>                   // 仅 main 内部；不经 IPC 外传
hasKey(profileId: string): Promise<boolean>
listProfiles(): Promise<Profile[]>
deleteKey(profileId: string): Promise<void>
```

## C3. HappyHorseClient
```ts
submit(capability: Capability, body: RequestBody, auth: AuthContext): Promise<{taskId: string}>
query(taskId: string, auth: AuthContext): Promise<TaskResult>   // 映射 task_status + video_url/错误码
mapError(httpStatus: number, payload: unknown): AppError        // 错误码→可读消息
// AuthContext = { apiKey, endpoint }，apiKey 由 KeyVault 在 main 内提供
```

## C4. RequestBuilder（PBT 重点）
```ts
build(params: GenParams): RequestBody          // 组装 model + input + media + parameters
validate(params: GenParams): ValidationResult  // 数量/格式/尺寸/≤20MB/取值范围 校验
toDataUri(filePath: string, mime: string): string   // 'data:{mime};base64,{data}'
applyDefaults(params: GenParams): GenParams    // 按 capability 填默认 resolution/ratio/duration/watermark
```
> 属性：`build` 的输出对参数序列化往返保持一致（PBT-02）；`applyDefaults` 幂等；`validate` 对越界输入恒返回 ok=false（PBT-03/07）。

## C5. TaskEngine
```ts
enqueue(params: GenParams, profileId: string): Promise<{localId: string}>
cancel(localId: string): Promise<void>
retry(localId: string): Promise<void>
listTasks(): Promise<TaskRecord[]>
recoverOnStartup(): Promise<void>              // 从 Persistence 恢复未完成任务，重挂轮询
on(event: 'task-updated', cb: (t: TaskRecord) => void): void
private transition(localId, next: TaskStatus): void   // 状态机（PBT 对象）
```

## C6. Poller
```ts
startPolling(localId: string): void            // 约 15s 间隔 + 退避
stopPolling(localId: string): void
private isExpired(record: TaskRecord, now: number): boolean   // 24h 判定
```

## C7. MediaStore
```ts
download(localId: string, videoUrl: string): Promise<string>   // 返回 localVideoPath
retryDownload(localId: string): Promise<string>
listHistory(filter?: HistoryFilter): Promise<HistoryItem[]>
getHistoryParams(historyId: string): Promise<GenParams>        // 供"基于历史重生成"
openInFolder(historyId: string): Promise<void>
private makeThumbnail(videoPath: string): Promise<string|null>
```

## C8. Persistence (SQLite)
```ts
tasks.upsert(t: TaskRecord): void
tasks.get(localId: string): TaskRecord | undefined
tasks.list(filter?): TaskRecord[]
tasks.delete(localId: string): void
history.insert(h: HistoryItem): void
history.list(filter?): HistoryItem[]
config.get(): AppConfig
config.set(c: AppConfig): void
migrate(): void        // 建表/迁移
serializeParams(p: GenParams): string  // PBT-02 往返
deserializeParams(s: string): GenParams
```

## C9. IpcGateway
```ts
register(): void       // 注册所有 ipcMain.handle 通道（见 services.md）
broadcastTaskUpdate(t: TaskRecord): void   // webContents.send('task-updated', t)
```

## C10. PreloadBridge（contextBridge 暴露给 window.vidforge）
```ts
submitTask(params: GenParams): Promise<{localId:string}>
cancelTask(localId): Promise<void>
retryTask(localId): Promise<void>
listTasks(): Promise<TaskRecord[]>
listHistory(filter?): Promise<HistoryItem[]>
regenerateFrom(historyId): Promise<{localId:string}>
getConfig(): Promise<AppConfig>;  updateConfig(patch): Promise<AppConfig>
setKey(profileId, apiKey): Promise<void>;  hasKey(profileId): Promise<boolean>
listProfiles(): Promise<Profile[]>;  deleteProfile(profileId): Promise<void>
onTaskUpdate(cb: (t: TaskRecord) => void): () => void   // 返回取消订阅
```

## renderer C11–C16
- React 组件方法为内部 UI 逻辑，调用 `window.vidforge.*`，详细在 ui 单元的 Functional Design 阶段细化。
