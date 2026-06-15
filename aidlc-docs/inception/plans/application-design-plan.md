# Application Design Plan — vidforge

本计划先确认几个关键设计决策（下方问题），再据此生成正式设计文档。请填写每个 `[Answer]:`，完成后告诉我 "完成 / done"。

## 计划任务清单
- [ ] 确认 Electron 进程架构与安全边界（Q-A1）
- [ ] 确认 IPC 通信风格（Q-A2）
- [ ] 确认任务持久化的本地存储方案（Q-A3）
- [ ] 确认前端状态管理方案（Q-A4）
- [ ] 确认图片/视频素材的传输方式（URL vs Base64）（Q-A5）
- [ ] 确认 UI 组件库（Q-A6）
- [ ] 生成 components.md（组件定义与职责）
- [ ] 生成 component-methods.md（方法签名）
- [ ] 生成 services.md（服务编排）
- [ ] 生成 component-dependency.md（依赖与数据流）
- [ ] 生成 application-design.md（汇总）
- [ ] 校验设计完整性与一致性

---

## 关键设计决策问题

## Q-A1：Electron 进程架构与安全边界
（这是本项目最重要的架构决策，影响所有模块。）

A) **严格分层（推荐）**：renderer（React UI）完全不碰明文 API Key、不直接发外网请求；所有密钥解密、HappyHorse API 调用、文件下载都在 main 进程；renderer 通过 IPC 请求 main。开启 contextIsolation、关闭 nodeIntegration、用 preload + contextBridge 暴露受限 API。安全性最好，符合 Electron 官方最佳实践。

B) 宽松模式：renderer 直接用 Node 能力发请求、读写文件（开发快，但 Key 暴露在渲染层、XSS 风险高，不推荐用于开源分发软件）

X) Other（请描述）

[Answer]: A

## Q-A2：IPC 通信风格
A) **请求/响应用 `ipcRenderer.invoke` + `ipcMain.handle`，任务进度等持续更新用 main→renderer 的事件推送（webContents.send）**（推荐，职责清晰）

B) 全部用事件（send/on）手动配对

C) 你按合理默认决定

X) Other（请描述）

[Answer]: A

## Q-A3：任务与历史的本地持久化方案
（需要持久化：任务队列状态、生成历史、配置。Key 不在此列，Key 走 OS 密钥链。）

A) **SQLite**（结构化查询强，适合历史库增长、并发任务，推荐；用 better-sqlite3）

B) **轻量文件型 DB**（lowdb / 单个 JSON 文件，简单，但任务多/历史大时性能与并发较弱）

C) 你按合理默认决定

X) Other（请描述）

[Answer]: A

## Q-A4：前端状态管理
A) **Zustand**（轻量、上手快，适合中等复杂度，推荐）

B) Redux Toolkit（重，生态全，适合大型复杂状态）

C) 仅用 React Context + hooks（最简，状态复杂后易乱）

D) 你推荐

X) Other（请描述）

[Answer]: A

## Q-A5：图片/视频素材如何传给 HappyHorse API
（API 支持公网 URL 或 Base64。用户素材来自本地文件。）

A) **本地文件读取后转 Base64 内联到请求**（推荐 — 纯客户端无需上传到任何图床/OSS，零额外服务；注意 ≤20MB 限制，视频编辑的视频可能较大需校验）

B) 先上传到用户自己的 OSS/图床拿 URL 再调用（需要额外配置，第一版不做）

C) 同时支持：小文件 Base64、用户也可直接填 URL

X) Other（请描述）

[Answer]: A

## Q-A6：UI 组件库
A) **Ant Design**（中后台/表单密集型友好，中文生态好，组件全，推荐）

B) Material UI (MUI)

C) shadcn/ui + Tailwind（高度可定制，更现代，但要自己拼更多）

D) 你推荐

X) Other（请描述）

[Answer]: A

---

## 补充：对架构/设计还有其他约束或偏好吗？（没有可留空）
[Answer]:
