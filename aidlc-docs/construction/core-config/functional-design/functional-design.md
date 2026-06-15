# U1 core-config — Functional Design（精简）

> 自主模式：采用推荐项 C1=A/C2=A/C3=A/C4=A。本文浓缩业务逻辑、规则、实体；细节见代码注释。

## Domain Entities
- **Profile** `{ id, name, region, baseUrl? }`：一组 Key+region+可选 baseURL。Key 本身不在实体内，存 OS 密钥链，键名 `vidforge:<profileId>`。
- **AppConfig** `{ activeProfileId, downloadDir, language, defaults{resolution,duration,watermark} }`：存 SQLite config 表（单行 JSON）。

## Business Logic
- **ConfigManager**：读写 AppConfig；管理 Profile 列表（增删改、设激活档）；`resolveEndpoint(profile)` 解析提交端点。
- **KeyVault**：基于 keytar 的 setKey/getKey/hasKey/deleteKey。`getKey` 仅 main 内部调用，明文不外传。

## Business Rules
- **R1 端点解析优先级**（C2=A）：`baseUrl` 非空 → 用 baseUrl；否则 region≠custom → 查 `ENDPOINT_BY_REGION`；region=custom 且无 baseUrl → 抛 `config.missingBaseUrl`。
- **R2 端点拼接**：最终 `submitUrl = endpoint + SUBMIT_PATH`，`queryUrl = endpoint + TASK_PATH(taskId)`。去除 endpoint 尾部多余 `/`。
- **R3 Key 轻校验**（C3=A）：trim 后非空即可；空则 `config.missingKey`。不强制 `sk-` 前缀。
- **R4 激活档**（C1=A）：可存多 Profile；`activeProfileId` 指向当前用于提交的档；删除激活档后 activeProfileId 置空。
- **R5 默认值**（C4=A）：downloadDir 默认 `<userData>/downloads` 或系统下载目录下 vidforge；language 跟随系统（zh/en），未知→zh；defaults resolution=1080P/duration=5/watermark=true。

## Testable Properties (PBT-01)
- `resolveEndpoint`：**不变量**——输出永远不含 `//api`（无重复斜杠）、永远以 `SUBMIT_PATH` 结尾的 host 合法。（PBT-03）
- `resolveEndpoint`：**幂等性**——对同一 profile 多次调用结果一致。（PBT-04，advisory）
- region 表映射：所有非 custom region 都能解析出非空 host。（PBT-03）

## Integration Points
- 被 S1 GenerationService（取端点+Key 组 AuthContext）、S5 ConfigService（读写）、Persistence（AppConfig 落库）调用。
