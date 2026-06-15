# Unit of Work — vidforge

系统拆分为 **5 个单元（逻辑模块）**，全部位于**单一 npm 包**内（Q-U1=A）。实现顺序自底向上（Q-U2=A）。保持 5 单元不合并（Q-U3=A）。共享类型独立于 `src/shared`（Q-U4=A）。

## 代码组织策略（Greenfield）

```
vidforge/
├── package.json                # 单一包
├── electron.vite.config.ts     # electron-vite 构建（main/preload/renderer）
├── tsconfig.json
├── src/
│   ├── shared/                 # 跨进程共享：类型 + 纯工具（renderer 只引类型）
│   │   ├── types.ts            # Capability, GenParams, TaskRecord, Profile, ...
│   │   ├── capabilities.ts     # 四能力的 model 名、默认参数、约束常量
│   │   └── errors.ts           # AppError、错误码映射表（中英）
│   ├── main/                   # main 进程
│   │   ├── index.ts            # app 启动、窗口、注册 IpcGateway、RecoveryService
│   │   ├── core-config/        # 单元 U1
│   │   │   ├── ConfigManager.ts
│   │   │   └── KeyVault.ts
│   │   ├── api-client/         # 单元 U2
│   │   │   ├── HappyHorseClient.ts
│   │   │   └── RequestBuilder.ts
│   │   ├── task-engine/        # 单元 U3（枢纽）
│   │   │   ├── TaskEngine.ts
│   │   │   ├── Poller.ts
│   │   │   ├── Persistence.ts
│   │   │   ├── IpcGateway.ts
│   │   │   └── services/       # S1-S5 编排
│   │   └── media-store/        # 单元 U4
│   │       └── MediaStore.ts
│   ├── preload/                # 单元 U5 的桥接部分
│   │   └── index.ts            # contextBridge → window.vidforge
│   └── renderer/               # 单元 U5（ui）
│       ├── main.tsx
│       ├── store/              # Zustand
│       ├── i18n/               # 中英
│       ├── components/         # CapabilityForms, ParameterPanel, TaskQueuePanel, HistoryLibrary, SettingsView
│       └── views/AppShell.tsx
├── tests/                      # 单测 / 集成测试 / PBT(fast-check)
└── aidlc-docs/                 # 文档（不打包进应用）
```

## 单元定义

### U1. core-config
- **职责**：配置与密钥管理。ConfigManager（region/baseUrl/下载目录/语言/默认参数）+ KeyVault（OS 密钥链存取 API Key）。
- **组件**：C1, C2
- **对外接口**：被 services（S1/S5）调用；KeyVault.getKey 仅 main 内部。
- **PBT 关注**：ConfigManager.resolveEndpoint（region→端点映射的不变量）。
- **覆盖 FR**：FR-1.*

### U2. api-client
- **职责**：HappyHorse 协议封装。HappyHorseClient（提交/查询/错误映射）+ RequestBuilder（请求体构造、参数校验、Base64、默认值）。
- **组件**：C3, C4
- **对外接口**：被 TaskEngine/Poller/services 调用；不持有状态。
- **PBT 关注**（重点）：RequestBuilder.build/validate/applyDefaults（往返、不变量、幂等、生成器）。
- **覆盖 FR**：FR-2.*（四能力映射）

### U3. task-engine（枢纽）
- **职责**：任务全生命周期。状态机、并发队列、轮询、SQLite 持久化、重启恢复、IPC 网关、S1-S5 编排服务。
- **组件**：C5, C6, C8, C9, S1-S5
- **对外接口**：IPC 通道（services.md 清单）；向 renderer 推送 task-updated。
- **PBT 关注**：TaskEngine 状态机流转（合法转移不变量）；Persistence 参数序列化往返。
- **覆盖 FR**：FR-3.*，并编排 FR-2/FR-4。

### U4. media-store
- **职责**：结果视频下载落盘、下载重试、历史记录、缩略图、基于历史重生成的参数回取。
- **组件**：C7
- **对外接口**：被 S2/S4 调用。
- **PBT 关注**：历史记录序列化往返（与 Persistence 协作）。
- **覆盖 FR**：FR-4.*

### U5. ui
- **职责**：React 界面 + preload 桥接。四能力输入、参数面板、任务队列面板、历史库、设置、i18n、Zustand。
- **组件**：C10–C16
- **对外接口**：仅经 window.vidforge（preload 白名单）。
- **测试**：普通单测/集成测试（非 PBT 强制，C3=A）。
- **覆盖 FR**：FR-2 输入侧、FR-3 展示、FR-4 历史 UI、FR-5 i18n。

## 实现顺序（自底向上，Q-U2=A）
1. **U1 core-config** → 2. **U2 api-client** → 3. **U3 task-engine** → 4. **U4 media-store** → 5. **U5 ui**

> 项目脚手架（package.json、electron-vite、tsconfig、src/shared 类型骨架、fast-check 配置）作为 U1 Code Generation 的前置一并搭建。
