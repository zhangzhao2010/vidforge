# vidforge — 需求文档

## 1. 意图分析摘要

| 项 | 内容 |
|---|---|
| **用户请求** | 做一个跨平台（macOS + Windows）桌面客户端，使用阿里云百炼 HappyHorse 模型生成视频 |
| **请求类型** | New Project（全新项目，Greenfield） |
| **范围估计** | Multiple Components（桌面应用：UI 层 + 任务管理 + API 客户端 + 本地存储/媒体管理 + 配置/密钥管理） |
| **复杂度估计** | Moderate–Complex（异步长任务管理、并发队列、重启恢复、四种素材输入形态、跨平台打包） |
| **产品定位** | 开源工具；第一版实现完整基础功能（用户在 Q11 确认接受较重的第一版范围） |

## 2. 背景：HappyHorse API 关键事实

> 这些事实直接约束了架构，必须在设计中体现。

- **统一端点**：四种能力共用 `POST /api/v1/services/aigc/video-generation/video-synthesis`，靠请求体 `model` 字段区分：
  - `happyhorse-1.0-t2v`（文生视频）
  - `happyhorse-1.0-i2v`（图生视频，首帧）
  - `happyhorse-1.0-r2v`（参考生视频，1~9 张参考图）
  - `happyhorse-1.0-video-edit`（视频编辑）
- **全异步**：请求必须带头 `X-DashScope-Async: enable`；返回 `task_id`；轮询 `GET /api/v1/tasks/{task_id}`；状态流转 `PENDING → RUNNING → SUCCEEDED / FAILED`；耗时通常 1~5 分钟；建议轮询间隔约 15 秒；查询接口 RPS 默认 20。
- **认证**：`Authorization: Bearer {API_KEY}`；**端点 region 与 API Key region 必须一致**，否则调用失败。
- **结果时效**：成功后返回 `video_url`，**有效期仅 24 小时**；`task_id` 有效期也是 24 小时，超时查询返回 `UNKNOWN`。
- **输出格式**：MP4（H.264），24fps。
- **素材输入差异**：
  - t2v：仅 `input.prompt`
  - i2v：`input.media[]`，`type=first_frame`，**有且仅 1 张**；`url` 支持公网 URL 或 Base64（`data:{mime};base64,{data}`）；图片 JPEG/JPG/PNG/WEBP，宽高≥300px，宽高比 1:2.5~2.5:1，≤20MB
  - r2v：`input.media[]`，`type=reference_image`，**1~9 张**；prompt 用 `[Image 1]…[Image N]` 指代；图片短边≥400px，≤20MB
  - video-edit：`input.media[]` 含视频 + 参考图，配合编辑指令 prompt
- **通用参数**（`parameters`）：`resolution`（720P/1080P）、`ratio`（16:9/9:16/1:1/4:3/3:4/4:5/5:4/9:21/21:9，不同能力默认值不同）、`duration`（3~15 秒，默认 5）、`watermark`（默认 true）、`seed`（可选）。

## 3. 功能需求（Functional Requirements）

### FR-1 API Key 与配置管理
- **FR-1.1** 用户自行填写百炼 API Key（纯客户端，不内置任何官方 Key，不做后端代理）。【Q1=A】
- **FR-1.2** 填写 API Key 时同时选择 region；region 与 Key 绑定。【Q5=X】
- **FR-1.3** 设置中允许填写自定义 baseURL（覆盖默认 region 端点），用于私有/代理网关或新地域域名。【Q5=X】
- **FR-1.4** API Key 使用操作系统密钥链/凭据管理器加密存储（macOS Keychain / Windows Credential Manager），不以明文落盘。【Q9=A】
- **FR-1.5** 支持多组 Key/region 配置的管理（至少能保存并切换当前使用的配置）。

### FR-2 视频生成能力（四种全做）【Q4=E, C1=C】
- **FR-2.1 文生视频（t2v）**：输入 prompt + 通用参数，提交生成。
- **FR-2.2 图生视频（i2v）**：上传 1 张首帧图（本地文件转 Base64 或填 URL）+ 可选 prompt + 参数。需做图片格式/尺寸/大小的前端校验。
- **FR-2.3 参考生视频（r2v）**：上传 1~9 张参考图 + prompt（支持插入 `[Image N]` 指代占位）+ 参数。
- **FR-2.4 视频编辑（video-edit）**：上传视频 + 参考图 + 编辑指令 prompt + 参数。
- **FR-2.5** 四种能力共用同一提交流程（统一端点 + model 切换），UI 上按能力切换不同的素材输入区。
- **FR-2.6** 参数面板：分辨率、宽高比、时长、水印开关、seed（按各能力支持的取值动态展示，并应用各自默认值）。

### FR-3 异步任务管理【Q7=A, Q8=A, C2=B】
- **FR-3.1** 提交任务后保存返回的 `task_id`、对应请求参数、提交时间、所用 region/baseURL。
- **FR-3.2** 自动轮询任务状态（约 15 秒间隔，遵守 RPS 限制），实时展示 `PENDING/RUNNING/SUCCEEDED/FAILED`。
- **FR-3.3** **并发任务队列**：支持同时提交并管理多个任务，展示每个任务的进度与状态面板。
- **FR-3.4** **任务持久化与重启恢复**：任务状态写入本地存储；应用关闭后重开，对仍在 24 小时有效期内的未完成任务自动恢复轮询。
- **FR-3.5** 对超过 24 小时（`task_id` 失效 / 返回 `UNKNOWN`）的任务，标记为过期并停止轮询，给出明确提示。
- **FR-3.6** 任务失败时展示错误码与错误信息。

### FR-4 结果处理与本地历史【Q6=A】
- **FR-4.1** 任务 `SUCCEEDED` 后，自动将 `video_url` 指向的视频下载到用户指定的本地文件夹（因 URL 仅 24 小时有效）。
- **FR-4.2** 保留生成历史记录：保存 prompt、参数、能力类型、生成时间、本地视频文件路径、缩略图（如可行）。
- **FR-4.3** 历史列表中可重新查看/播放已下载视频、查看当时的参数、一键基于历史参数重新生成。
- **FR-4.4** 下载失败可重试（在 24 小时有效期内）。

### FR-5 国际化【Q10=C】
- **FR-5.1** 中英文双语界面，可在设置中切换（i18n）。

## 4. 非功能需求（Non-Functional Requirements）

### NFR-1 跨平台与技术栈
- **NFR-1.1** 同时支持 macOS 与 Windows。【用户初始要求】
- **NFR-1.2** 桌面框架：**Electron**。【Q2=B】
- **NFR-1.3** 前端：**React + TypeScript**。【Q3=A】
- **NFR-1.4** 能产出 macOS 与 Windows 的安装包（第一版不强制要求代码签名/公证，可后续补充）。

### NFR-2 安全
- **NFR-2.1** API Key 经 OS 密钥链加密存储，进程内不长期驻留明文，日志中不得打印 Key。【Q9=A】
- **NFR-2.2** 安全扩展（Security Baseline）整体未启用【Q12=No】，但 NFR-2.1 作为显式功能需求仍必须实现。

### NFR-3 可靠性 / 韧性
- **NFR-3.1** 韧性基线扩展未启用【Q13=No】。
- **NFR-3.2** 但因任务为长耗时异步，基本健壮性仍必须具备：网络错误重试、轮询超时处理、任务持久化（见 FR-3.4）、下载失败重试（见 FR-4.4）。

### NFR-4 可用性
- **NFR-4.1** 长任务必须有清晰的进度反馈（队列面板 + 单任务状态）。
- **NFR-4.2** 错误信息对用户可读（映射常见错误码到中英文友好提示）。

### NFR-5 可测试性（PBT — Partial 模式）【Q14=A → C3=A 收敛为 Partial】
- **NFR-5.1** 测试框架：**fast-check**（TS/JS），与项目测试运行器集成。【PBT-09】
- **NFR-5.2** 对纯逻辑强制属性测试：请求体构造、参数校验、序列化往返、任务状态机流转。【PBT-02/03】
- **NFR-5.3** 生成器须使用领域特定生成器（合法 region、合法参数取值范围、合法图片元数据），不得只用裸原始类型生成器。【PBT-07】
- **NFR-5.4** PBT 须支持 shrinking 与基于 seed 的可复现，失败时记录 seed，纳入 CI。【PBT-08】
- **NFR-5.5** UI 层与网络 I/O 层使用普通单元测试/集成测试（不强制 PBT）。【C3=A】

## 5. 范围边界（第一版）

**包含**：四种生成能力、并发任务队列、重启恢复轮询、自动下载 + 本地历史、用户填 Key + region + 自定义 baseURL、Key 加密存储、中英双语。

**明确不做（第一版）**：
- 不做后端服务、不做用户系统、不内置官方 Key。【Q1=A】
- 不做安装包代码签名/公证（可后续补）。
- 不做云端同步、不做账号体系、不做计费统计。
- 韧性基线、安全基线扩展不启用。

## 6. 关键约束与风险

- **R-1**：纯客户端用自填 Key — 用户必须自备百炼账号与额度；产品不承担费用。
- **R-2**：video_url 24h 失效 — 自动下载是硬需求，下载链路的可靠性是关键路径。
- **R-3**：第一版范围偏重（四能力 + 并发 + 恢复）— 已与用户确认接受（C1=C, C2=B）。
- **R-4**：Electron 体积与内存开销较大 — 已知取舍（Q2=B）。
- **R-5**：自定义 baseURL + region 组合 — 需保证 Key/region/端点一致性校验，避免跨域调用失败。

## 7. 关键需求小结

vidforge 是一个 **Electron + React/TS 的开源跨平台桌面客户端**，让用户用**自己的**百炼 API Key 调用 HappyHorse 的四种视频生成能力。核心难点不在"调接口"，而在**异步长任务的全生命周期管理**：并发队列、重启恢复轮询、以及因结果链接 24 小时失效而必须做的**自动下载落盘 + 本地历史**。安全上以 OS 密钥链加密 Key 为底线；质量上对纯逻辑用 fast-check 做属性测试。
