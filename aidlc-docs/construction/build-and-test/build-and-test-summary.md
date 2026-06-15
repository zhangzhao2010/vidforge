# Build and Test Summary — vidforge

## 环境前置
- Node 18+（开发用 v24.16.0）
- 原生模块编译依赖：`gcc-c++`、`make`、`python3`（本环境缺 g++，已 `sudo dnf install -y gcc-c++` 解决）
- `npm install`（编译 better-sqlite3 / keytar）

## 构建指令
```bash
npm run typecheck   # tsc --noEmit，类型检查
npm run build       # electron-vite build → out/{main,preload,renderer}
npm run package:mac # electron-builder → release/*.dmg
npm run package:win # electron-builder → release/*.exe (nsis)
```

## 测试指令
```bash
npm test            # vitest run（PBT + 集成）
```

## 测试结果（最近一次）
- **15 passed**（4 test files）
  - `tests/core-config/resolveEndpoint.pbt.test.ts` — 4（PBT：端点解析不变量/幂等/custom 缺 baseUrl 抛错）
  - `tests/api-client/requestBuilder.pbt.test.ts` — 4（PBT：build↔extract 往返、model 不变量、applyDefaults 幂等、duration 越界校验）
  - `tests/task-engine/stateMachine.pbt.test.ts` — 4（PBT：终态无出边、can/assert 一致、目标合法、无自环）
  - `tests/task-engine/taskEngine.integration.test.ts` — 3（集成：提交→PENDING、全链路→COMPLETED、FAILED→retry）
- typecheck：通过
- build：通过（main 36KB / preload 2.4KB / renderer 1.8MB）

## PBT 合规小结（fast-check, Partial 模式：强制 PBT-02/03/07/08/09）
- **PBT-02 往返**：RequestBuilder build↔extractParams；Persistence serialize/deserializeParams（JSON 往返）✅
- **PBT-03 不变量**：状态机合法转移、端点无双斜杠、model 映射、duration 越界恒 false ✅
- **PBT-07 生成器**：使用领域生成器（合法 region / capability / 参数范围 / baseURL），未用裸原始类型 ✅
- **PBT-08 shrinking/seed**：fast-check 默认开启 shrinking，失败报告 seed 可复现 ✅
- **PBT-09 框架**：fast-check 已选定并入 devDependencies ✅
- UI 层（renderer）与网络 I/O 按既定策略用集成/示例测试，不强制 PBT。

## 已知后续事项（第一版未做，非阻断）
- renderer bundle 1.8MB 超 vite 默认 chunk 警告阈值（功能不受影响，可后续做代码分割）
- electron-builder 打包未在本环境实跑（需各目标平台或 CI；配置已就绪）
- 代码签名/公证、缩略图生成、URL/OSS 素材方式 — 列入第二版
