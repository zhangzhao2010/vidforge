# Unit of Work Plan — vidforge

单元边界已在 Application Design 中基本确定为 5 个单元（core-config / api-client / task-engine / media-store / ui）。本计划确认代码组织与实现顺序后生成单元工件。请填 `[Answer]:`，完成后告诉我 "完成 / done"。

## 计划任务清单（Part 2 已执行）
- [x] 生成 `unit-of-work.md`（单元定义、职责、代码组织策略）
- [x] 生成 `unit-of-work-dependency.md`（单元依赖矩阵与构建顺序）
- [x] 生成 `unit-of-work-story-map.md`（功能需求 FR → 单元映射；本项目无 user stories，改用 FR 映射）
- [x] 校验单元边界与依赖（无环）
- [x] 确认所有 FR 都已分配到单元

---

## 待确认问题

## Q-U1：代码组织结构（Electron + 单一应用）
（5 个单元在同一个 Electron 应用里。这决定目录长什么样。）

A) **单一 npm 包 + 按单元分目录（推荐，最简单）**：一个 package.json，源码按 `src/main/{core-config,api-client,task-engine,media-store}` + `src/renderer`(ui) + `src/preload` + `src/shared`(共享类型) 组织。第一版无需 monorepo 复杂度。

B) **pnpm/npm workspaces monorepo**：每个单元独立 package（@vidforge/api-client 等）。边界更硬、可独立测试发布，但配置更重，对单应用偏过度。

C) 你按工程角度推荐

X) Other（请描述）

[Answer]: A

## Q-U2：单元实现顺序
（单元有依赖：core-config 是底层叶子，ui 在顶层。AI-DLC 会逐单元走 Functional Design→...→Code Generation。）

A) **按依赖自底向上（推荐）**：core-config → api-client → task-engine → media-store → ui。每个单元实现时其依赖已就绪，可真实联调。

B) 先做一条最薄的端到端竖切（t2v 全链路打通）再回头补全各单元能力

C) 你按合理默认决定

X) Other（请描述）

[Answer]: A

## Q-U3：是否合并某些单元以简化第一版
（core-config 和 api-client 都较小。）

A) **保持 5 个单元不变（推荐）**：边界清晰，task-engine 已是重单元，其余各自独立利于测试。

B) 把 api-client 并入 task-engine（减少一个单元，但混淆"协议封装"与"任务调度"职责，不推荐）

C) 你按合理默认决定

X) Other（请描述）

[Answer]:A

## Q-U4：共享类型/工具的放置
A) **独立 `src/shared`（推荐）**：GenParams、TaskRecord、Capability 等类型与纯工具放共享目录，main/renderer/preload 都可引用（注意：renderer 只引类型，不引 main 实现）。

B) 各单元自带类型，按需复制

C) 你按合理默认决定

X) Other（请描述）

[Answer]: A

---

## 补充：对单元拆分/代码组织还有其他要求吗？（没有可留空）
[Answer]:
