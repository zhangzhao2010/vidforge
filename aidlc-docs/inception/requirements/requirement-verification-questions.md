# 需求澄清问题 — vidforge（HappyHorse 视频生成客户端）

请在每个问题的 `[Answer]:` 标签后填入字母选项（如 `[Answer]: A`）。若选项都不合适，选最后的 "Other" 并在标签后描述你的想法。全部填完后告诉我 "完成 / done"。

---

## 第一组：架构与安全（最关键 — 决定要不要做后端）

## Question 1
API Key 如何管理？这直接决定项目是"纯客户端"还是"客户端+后端服务"。
（背景：百炼视频生成按量付费且较贵。如果把你自己的 Key 打包进客户端分发，任何人都能解包提取并盗刷你的账单。）

A) **每个用户填自己的 API Key**，存在本地（纯客户端，零运营成本，最简单 — 推荐用于工具型/自用/给懂技术的人用）

B) **我自己的 Key + 自建后端代理**，用户登录后通过我的后端调用（需要做后端、用户系统、计费/额度控制 — 大幅增加工作量和运维成本）

C) 暂时只做纯客户端（A），后端以后再说

X) Other（在下方 [Answer]: 后描述）

[Answer]: A 

## Question 2
跨平台桌面技术栈选哪个？
（两者都能同时出 Mac + Windows。）

A) **Tauri**（Rust + 系统 WebView，体积小 ~10MB、内存占用低、安全性好，但生态较新、需要 Rust — 推荐）

B) **Electron**（Node + Chromium，生态成熟、资料多、上手快，但体积大 ~100MB+、吃内存）

C) 我没偏好，你按工程角度推荐一个并说明理由

X) Other（如 Flutter / .NET MAUI / Qt 等，请描述）

[Answer]: B 

## Question 3
前端 UI 用什么框架？（Tauri 和 Electron 都用 Web 前端）

A) React + TypeScript（生态最大，组件库丰富 — 推荐）

B) Vue + TypeScript

C) Svelte / SvelteKit（轻量）

D) 你推荐

X) Other（请描述）

[Answer]: A 

---

## 第二组：功能范围

## Question 4
首个版本要支持 HappyHorse 的哪几种能力？（可多选，在 Answer 后写多个字母，如 `A,B`）

A) 文生视频（t2v）— 输入文字生成视频

B) 图生视频（i2v）— 基于首帧图片生成

C) 参考生视频（r2v）— 1~9 张参考图 + prompt 融合

D) 视频编辑（video-edit）— 输入视频+参考图做风格/局部替换

E) 全部四种都要

X) Other（请描述优先级）

[Answer]:E 

## Question 5
默认调用哪个地域的端点？（端点和 API Key 必须同地域，否则调用失败）

A) 华北2·北京（dashscope.aliyuncs.com，国内最常用 — 推荐）

B) 新加坡（需要 Workspace ID）

C) 美国·弗吉尼亚

D) 让用户在设置里自己选地域

X) Other（请描述）

[Answer]: X, 用户填APIKey的时候需要同时选择region，同时也可以自己在设置里填自定义的baseurl

## Question 6
生成的视频结果 video_url 只有 **24 小时有效期**，过期即丢失。客户端如何处理？

A) **任务成功后自动下载到本地**指定文件夹，并保留生成历史（强烈推荐，否则用户的视频会丢）

B) 只显示链接和在线预览，由用户手动点击下载

C) 自动下载 + 完整的本地媒体库管理（缩略图、搜索、分类）

X) Other（请描述）

[Answer]:A 

## Question 7
应用关闭后重新打开，正在生成中的任务（轮询中）要如何处理？

A) **持久化任务到本地，重启后自动恢复轮询**（推荐 — 任务要几分钟，用户很可能会关窗口）

B) 不持久化，关闭即丢失未完成任务（简单，但体验差）

X) Other（请描述）

[Answer]:A 

## Question 8
是否需要任务队列 / 批量提交？（比如一次排几个生成任务）

A) 需要，支持多任务排队并发管理 + 进度展示

B) 简单串行即可，一次专注一个任务

C) 你按合理默认决定

X) Other（请描述）

[Answer]: A

---

## 第三组：非功能与质量

## Question 9
本地 API Key 的存储安全要求？

A) 使用操作系统密钥链/凭据管理器加密存储（macOS Keychain / Windows Credential Manager — 推荐）

B) 明文存本地配置文件即可（简单，安全性低）

C) 你按合理默认决定

X) Other（请描述）

[Answer]: A

## Question 10
界面语言？

A) 仅中文

B) 仅英文

C) 中英文双语（i18n，可切换）

X) Other（请描述）

[Answer]: C

## Question 11
这个产品的定位是？（影响质量门槛和投入程度）

A) 个人自用 / 内部工具（快速能用为主）

B) 给一小群人用的产品原型 / PoC

C) 要正式对外分发的产品（需要更高的稳定性、错误处理、安装包签名等）

X) Other（请描述）

[Answer]:X，一个开源的工具，第一版可以不用特别完整，先实现基本功能

---

## 第四组：扩展开关（AI-DLC 规则要求确认）

## Question 12: Security Extensions
是否对本项目强制执行安全扩展规则（作为阻断性约束）？

A) Yes — 强制执行所有 SECURITY 规则（推荐用于正式对外分发的产品）

B) No — 跳过所有 SECURITY 规则（适合 PoC、原型、实验性项目）

X) Other（请在下方 [Answer]: 后描述）

[Answer]:No

## Question 13: Resiliency Extensions
是否应用韧性基线（基于 AWS Well-Architected 可靠性支柱的设计期最佳实践）？
（注：这是面向云端工作负载的韧性指引。本项目是桌面客户端，相关性可能有限。）

A) Yes — 应用韧性基线作为设计期指引（推荐用于业务关键型工作负载）

B) No — 跳过韧性基线（适合 PoC、原型、客户端类项目）

X) Other（请在下方 [Answer]: 后描述）

[Answer]:No

## Question 14: Property-Based Testing Extension
是否对本项目强制执行基于属性的测试（PBT）规则？

A) Yes — 强制所有 PBT 规则（推荐用于有业务逻辑、数据转换、序列化、有状态组件的项目）

B) Partial — 仅对纯函数和序列化往返强制 PBT

C) No — 跳过所有 PBT 规则（适合简单 CRUD、纯 UI 项目）

X) Other（请在下方 [Answer]: 后描述）

[Answer]: A

---

## 补充：你还有什么必须满足的约束或想法？
（例如：必须的功能、UI 参考、deadline、预算限制、特定依赖等。没有可留空。）

[Answer]:暂无
