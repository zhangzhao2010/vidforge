# Unit of Work Dependencies — vidforge

## 依赖矩阵

| 单元 | 依赖于 | 被依赖 | 构建顺序 |
|---|---|---|---|
| U1 core-config | shared | U2(间接), U3 | 1（最先） |
| U2 api-client | shared | U3 | 2 |
| U3 task-engine | shared, U1, U2, U4 | U5 | 3 |
| U4 media-store | shared | U3 | 3.5（与 U3 协作，U3 编排时调用） |
| U5 ui | shared(仅类型), preload | — | 4（最后） |

> shared（类型/常量/错误映射）是所有单元的公共底座，不算独立"单元"，随 U1 一并建立骨架。

## 依赖图（无环）

```
                shared (types/const/errors)
                   ▲   ▲   ▲   ▲   ▲
                   │   │   │   │   │
   U1 core-config ─┘   │   │   │   └─ U5 ui (仅引类型)
        ▲              │   │   │           │
        │              │   │   │           │ (window.vidforge / preload)
   U2 api-client ──────┘   │   │           ▼
        ▲                  │   │      IPC ↔ U3
        │                  │   │
   U3 task-engine ─────────┘   │
        │  ▲                   │
        │  └─── U4 media-store ┘
        ▼
   (调用 U1/U2/U4)
```

- **方向单向**：U5 → (IPC) → U3 → {U1, U2, U4} → shared。无循环依赖。
- **U3 是编排枢纽**：唯一聚合 U1/U2/U4 的单元，并经 IPC 服务 U5。
- **安全边界对齐依赖**：U5(renderer) 不直接依赖 U1/U2/U3/U4 的实现，只能经 preload→IPC，保证明文 Key 不入 renderer。

## 实现/构建顺序（自底向上）

| 步序 | 单元 | 前置就绪 | 说明 |
|---|---|---|---|
| 0 | 脚手架 + shared | — | package.json、electron-vite、tsconfig、共享类型骨架、fast-check 配置（并入 U1 Code Gen 前置） |
| 1 | U1 core-config | shared | 配置 + 密钥链，可独立单测 |
| 2 | U2 api-client | shared | 协议封装，可对照文档 mock 测试，PBT 重点 |
| 3 | U3 task-engine | U1, U2 | 状态机/队列/持久化/轮询/IPC，依赖前两者，可真实联调提交+轮询 |
| 4 | U4 media-store | U3(协作) | 下载/历史，与 U3 的 SUCCEEDED 流对接 |
| 5 | U5 ui | preload + IPC(U3) | 界面，最后串起端到端 |

## 跨单元集成点（Build and Test 阶段验证）
- U2↔U3：提交返回 task_id、查询状态映射。
- U3↔U4：SUCCEEDED → 下载 → 写 history。
- U3↔U5：IPC 命令 + task-updated 事件推送。
- U1↔U3/U5：端点解析、Key 取用（仅 main）、Profile 元数据回传 renderer。
