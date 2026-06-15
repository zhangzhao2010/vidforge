# FR → Unit Map — vidforge

> 本项目跳过了 User Stories 阶段，故以**功能需求（FR）→ 单元**映射代替 story map，确保每条需求都有归属单元。FR 编号见 `requirements.md`。

## 映射表

| 需求 | 描述 | 主单元 | 协作单元 |
|---|---|---|---|
| FR-1.1 | 用户自填 API Key（纯客户端） | U1 core-config | U5 ui(SettingsView) |
| FR-1.2 | 填 Key 时选 region | U1 core-config | U5 ui |
| FR-1.3 | 自定义 baseURL | U1 core-config | U5 ui |
| FR-1.4 | Key OS 密钥链加密存储 | U1 core-config (KeyVault) | — |
| FR-1.5 | 多组 Key/region 管理 | U1 core-config | U5 ui |
| FR-2.1 | 文生视频 t2v | U2 api-client (RequestBuilder/Client) | U3, U5 |
| FR-2.2 | 图生视频 i2v（单首帧 Base64） | U2 api-client | U3, U5 |
| FR-2.3 | 参考生视频 r2v（1-9 图，[Image N]） | U2 api-client | U3, U5 |
| FR-2.4 | 视频编辑 video-edit（视频+图） | U2 api-client | U3, U5 |
| FR-2.5 | 四能力统一提交流程 | U2 api-client | U3 |
| FR-2.6 | 参数面板（分辨率/比例/时长/水印/seed） | U5 ui (ParameterPanel) | U2 (校验/默认值) |
| FR-3.1 | 保存 task_id + 请求快照 | U3 task-engine (Persistence) | — |
| FR-3.2 | 自动轮询 + 状态展示 | U3 task-engine (Poller) | U5 ui |
| FR-3.3 | 并发任务队列 + 进度面板 | U3 task-engine | U5 ui (TaskQueuePanel) |
| FR-3.4 | 任务持久化 + 重启恢复 | U3 task-engine (RecoveryService) | — |
| FR-3.5 | 24h 过期处理 | U3 task-engine (Poller) | U5 ui |
| FR-3.6 | 失败展示错误码/信息 | U3 task-engine | U5 ui, shared/errors |
| FR-4.1 | 成功自动下载落盘 | U4 media-store | U3 |
| FR-4.2 | 生成历史记录 | U4 media-store | U3 (Persistence) |
| FR-4.3 | 历史查看/重生成 | U4 media-store | U5 ui (HistoryLibrary), S4 |
| FR-4.4 | 下载失败重试 | U4 media-store | U5 ui |
| FR-5.1 | 中英双语 i18n | U5 ui (i18n) | — |

## NFR → 单元

| NFR | 主单元 |
|---|---|
| NFR-1 跨平台/Electron/React/TS | 全局（脚手架 + 全单元） |
| NFR-2 Key 加密/不入日志/不进 renderer | U1 (KeyVault) + 架构边界（U3 IPC, U5) |
| NFR-3 长任务健壮性（重试/超时/持久化/下载重试） | U2, U3, U4 |
| NFR-4 进度反馈/可读错误 | U3, U5, shared/errors |
| NFR-5 PBT（fast-check, Partial） | U1(resolveEndpoint), U2(RequestBuilder 重点), U3(状态机/序列化) |

## 覆盖性校验
- ✅ 所有 FR-1~FR-5 均已分配主单元。
- ✅ 所有 NFR 均有承载单元或全局归属。
- ✅ PBT 强制规则（PBT-02/03/07/08/09）落到 U1/U2/U3 的纯逻辑；U4/U5 主要为集成/UI 测试。
- ✅ 单元依赖无环（见 unit-of-work-dependency.md）。
