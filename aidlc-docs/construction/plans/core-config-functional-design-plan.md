# Functional Design Plan — U1 core-config

U1 是小单元（ConfigManager + KeyVault）。多数技术决策已定（keytar 密钥链、SQLite 配置、region/baseURL）。仅以下细节待确认。请填 `[Answer]:`，完成后告诉我 "完成 / done"。

## 计划任务清单（Part 2 将执行）
- [ ] 生成 `business-logic-model.md`（配置/密钥的核心流程）
- [ ] 生成 `business-rules.md`（校验与约束规则）
- [ ] 生成 `domain-entities.md`（Profile、AppConfig 实体）
- [ ] 标注 PBT 属性（resolveEndpoint 等）

---

## 待确认问题

## Q-C1：Profile（配置档）模型
（一个 Profile = 一组「API Key + region + 可选自定义 baseURL」。用户可能有多个。）

A) **支持多 Profile + 一个"当前激活"档（推荐）**：用户可保存多组（如北京、新加坡各一），切换激活档；提交任务用当前激活档。

B) 只支持单一全局配置（一组 Key/region/baseURL，最简单）

C) 你按合理默认决定

X) Other（请描述）

[Answer]:

## Q-C2：region → 默认端点映射 + 自定义 baseURL 的优先级
（文档给出各 region 端点；新加坡/法兰克福需要 WorkspaceId 拼接域名。）

A) **自定义 baseURL 优先；否则按 region 查内置端点表；region=custom 时必须填 baseURL（推荐）**。新加坡/法兰克福因需 WorkspaceId，第一版引导用户用"自定义 baseURL"填完整域名。

B) 第一版只内置北京端点，其他 region 一律要求填自定义 baseURL

C) 你按合理默认决定

X) Other（请描述）

[Answer]:

## Q-C3：API Key 的基本格式校验
A) **轻校验（推荐）**：非空、去除首尾空格、提示通常以 `sk-` 开头但不强制（避免误拦未来格式变化）。真正有效性由首次调用验证。

B) 严格校验必须 `sk-` 前缀 + 长度

C) 不做任何校验

X) Other（请描述）

[Answer]:

## Q-C4：配置项默认值（下载目录、语言、默认生成参数）
A) **合理默认（推荐）**：下载目录=系统"下载/vidforge"；语言=跟随系统(中/英)，否则中文；默认 resolution=1080P、duration=5、watermark=true（与 API 默认一致）。

B) 我来指定（在下方描述）

C) 你按合理默认决定

X) Other（请描述）

[Answer]:

---

## 补充：U1 还有其他要求吗？（没有可留空）
[Answer]:
