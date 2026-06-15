# VidForge

跨平台桌面客户端（macOS / Windows），使用阿里云百炼平台 **HappyHorse** 模型生成视频。
A cross-platform desktop client (macOS / Windows) for video generation via Aliyun Model Studio **HappyHorse** models.

> 开源工具 · 纯客户端 · 用户自带 API Key（不内置任何官方 Key，不经任何第三方后端）。

## 功能 Features

- **四种生成能力**：文生视频（t2v）、图生视频（i2v）、参考生视频（r2v，1–9 张参考图）、视频编辑（video-edit）
- **并发任务队列** + 实时进度，关闭应用后重启**自动恢复**未完成任务
- 生成结果**自动下载落盘**（HappyHorse 的 `video_url` 仅 24 小时有效）+ 本地历史库、一键重生成
- API Key 经 **操作系统密钥链**（macOS Keychain / Windows Credential Manager）加密存储
- 多组配置档（API Key + 地域 + 可选自定义 baseURL）可切换
- 中英文双语界面

## 安全设计 Security

严格的 Electron 进程隔离：
- **主进程**持有全部敏感能力（API Key 解密、网络请求、文件读写、SQLite）
- **渲染进程**仅做 UI，开启 `contextIsolation`、关闭 `nodeIntegration`、启用 `sandbox`，只能通过 preload 白名单 API（`window.vidforge`）经 IPC 与主进程通信
- 明文 API Key **绝不**经 IPC 传入渲染进程、**绝不**写入日志
- 本地素材文件的读取与 Base64 编码在主进程完成，渲染进程只传文件路径

## 技术栈 Tech Stack

Electron · React + TypeScript · Ant Design · Zustand · better-sqlite3 · keytar · i18next · fast-check（属性测试）· electron-vite · electron-builder

## 目录结构

```
src/
  shared/      跨进程共享类型、能力常量、错误映射、IPC 通道名
  main/        主进程
    core-config/   ConfigManager（配置/端点解析）+ KeyVault（密钥链）
    api-client/    HappyHorseClient（提交/查询）+ RequestBuilder（请求构造/校验）
    task-engine/   TaskEngine（状态机/队列）+ Poller + Persistence(SQLite) + IpcGateway + services
    media-store/   MediaStore（下载/历史）
  preload/     contextBridge 暴露 window.vidforge
  renderer/    React UI（创建/任务/历史/设置 + i18n + Zustand store）
tests/         PBT（fast-check）+ 集成测试
aidlc-docs/    AI-DLC 流程文档（需求/设计/单元/审计）
```

## 开发 Development

前置：Node 18+（推荐 20/22）。Linux 下编译原生模块需要 `gcc-c++`、`make`、`python3`。

```bash
npm install        # 安装依赖（含 better-sqlite3 / keytar 原生编译）
npm run dev        # 开发模式启动（electron-vite）
npm test           # 运行测试（PBT + 集成）
npm run typecheck  # 类型检查
npm run build      # 构建 main/preload/renderer
```

## 打包 Packaging

```bash
npm run package:mac   # 产出 macOS dmg
npm run package:win   # 产出 Windows nsis 安装包
```
> 第一版不含代码签名/公证；正式分发前建议配置签名。

## 使用 Usage

1. 打开应用 → **设置**：新增一个配置档，填写 **API Key** + **地域**（如「华北2·北京」）。
   - 新加坡 / 法兰克福等需 WorkspaceId 的地域，请选 `custom` 并填完整 baseURL。
2. 回到**创建**：选择能力（文生/图生/参考生/视频编辑），填提示词、选素材、设参数，点「提交生成」。
3. **任务**页查看进度；成功后视频自动下载到设置中的下载目录。
4. **历史**页可重新播放、打开文件夹、基于原参数重新生成。

## 获取 API Key

在[阿里云百炼控制台](https://bailian.console.aliyun.com/)开通服务并创建 API Key。注意：HappyHorse 视频生成按量计费，费用由你的账号承担。

## License

MIT
