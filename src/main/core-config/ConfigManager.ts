// U1 core-config — ConfigManager
// 管理非敏感配置（AppConfig）与 Profile 列表，并解析提交端点。
// 业务规则见 aidlc-docs/construction/core-config/functional-design/functional-design.md

import { join } from 'node:path';
import type { AppConfig, Profile, Region } from '@shared/types';
import { ENDPOINT_BY_REGION, SUBMIT_PATH, TASK_PATH } from '@shared/capabilities';
import { AppError } from '@shared/errors';

// 延迟获取 electron.app，避免在纯逻辑（测试）环境下顶层导入 electron 二进制。
function getElectronApp(): { getLocale?: () => string; getPath?: (n: string) => string } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('electron').app ?? null;
  } catch {
    return null;
  }
}

/** 持久化抽象：ConfigManager 不直接依赖 SQLite，便于测试与单元解耦 */
export interface ConfigStore {
  getConfig(): AppConfig | undefined;
  setConfig(c: AppConfig): void;
  listProfiles(): Profile[];
  upsertProfile(p: Profile): void;
  deleteProfile(id: string): void;
}

/** 系统语言 → 应用语言（zh/en），未知回退 zh（R5） */
function detectLanguage(): 'zh' | 'en' {
  const app = getElectronApp();
  const locale = app?.getLocale?.() ?? 'zh-CN';
  return locale.toLowerCase().startsWith('en') ? 'en' : 'zh';
}

function defaultConfig(): AppConfig {
  let downloadDir = join(process.cwd(), 'downloads');
  const app = getElectronApp();
  try {
    if (app?.getPath) downloadDir = join(app.getPath('downloads'), 'vidforge');
  } catch {
    /* app 未就绪时回退（如测试环境） */
  }
  return {
    activeProfileId: null,
    downloadDir,
    language: detectLanguage(),
    defaults: { resolution: '1080P', duration: 5, watermark: true }
  };
}

export class ConfigManager {
  constructor(private store: ConfigStore) {}

  getConfig(): AppConfig {
    return this.store.getConfig() ?? this.#initConfig();
  }

  #initConfig(): AppConfig {
    const c = defaultConfig();
    this.store.setConfig(c);
    return c;
  }

  updateConfig(patch: Partial<AppConfig>): AppConfig {
    const next = { ...this.getConfig(), ...patch };
    this.store.setConfig(next);
    return next;
  }

  listProfiles(): Profile[] {
    return this.store.listProfiles();
  }

  upsertProfile(p: Profile): Profile {
    this.store.upsertProfile(p);
    // 若尚无激活档，新建的第一个自动激活（R4）
    const cfg = this.getConfig();
    if (!cfg.activeProfileId) this.updateConfig({ activeProfileId: p.id });
    return p;
  }

  deleteProfile(id: string): void {
    this.store.deleteProfile(id);
    const cfg = this.getConfig();
    if (cfg.activeProfileId === id) this.updateConfig({ activeProfileId: null });
  }

  setActiveProfile(id: string): void {
    const exists = this.store.listProfiles().some((p) => p.id === id);
    if (!exists) throw new AppError('config.noActiveProfile', 'error.config.noActiveProfile', `profile ${id} not found`);
    this.updateConfig({ activeProfileId: id });
  }

  getActiveProfile(): Profile | undefined {
    const { activeProfileId } = this.getConfig();
    if (!activeProfileId) return undefined;
    return this.store.listProfiles().find((p) => p.id === activeProfileId);
  }

  /**
   * 解析提交端点（业务规则 R1/R2）。
   * 优先级：自定义 baseUrl > region 内置端点；custom 且无 baseUrl → 抛错。
   * 返回去除尾部斜杠的基址（不含路径）。
   */
  resolveEndpoint(profile: Profile): string {
    let base: string;
    if (profile.baseUrl && profile.baseUrl.trim()) {
      base = profile.baseUrl.trim();
    } else if (profile.region === 'custom') {
      throw new AppError('config.missingBaseUrl', 'error.config.missingBaseUrl');
    } else {
      base = ENDPOINT_BY_REGION[profile.region as Exclude<Region, 'custom'>];
    }
    return base.replace(/\/+$/, ''); // 去尾部斜杠，避免拼接出 '//'
  }

  /** 完整的提交 URL */
  submitUrl(profile: Profile): string {
    return this.resolveEndpoint(profile) + SUBMIT_PATH;
  }

  /** 完整的任务查询 URL */
  queryUrl(profile: Profile, taskId: string): string {
    return this.resolveEndpoint(profile) + TASK_PATH(taskId);
  }
}
