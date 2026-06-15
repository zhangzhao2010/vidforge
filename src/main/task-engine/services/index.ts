// U3 task-engine — 编排服务 S1-S5
// 这些服务是 main 进程的业务编排层，被 IpcGateway 路由调用。
// 为简洁起见合并在一个文件，按 SXX 注释分区。

import type { GenParams, Profile, AppConfig, TaskRecord, HistoryItem } from '@shared/types';
import { AppError } from '@shared/errors';
import type { ConfigManager } from '../../core-config/ConfigManager';
import type { KeyVault } from '../../core-config/KeyVault';
import type { TaskEngine } from '../TaskEngine';
import type { Persistence } from '../Persistence';
import type { MediaStore } from '../../media-store/MediaStore';

export class Services {
  constructor(
    private config: ConfigManager,
    private keyVault: KeyVault,
    private engine: TaskEngine,
    private persistence: Persistence,
    private media: MediaStore
  ) {}

  // ---- S1 GenerationService ----
  /** 提交生成任务：校验有激活档+Key，再入队 */
  async submitTask(params: GenParams): Promise<{ localId: string }> {
    const profile = this.config.getActiveProfile();
    if (!profile) throw new AppError('config.noActiveProfile', 'error.config.noActiveProfile');
    if (!(await this.keyVault.hasKey(profile.id))) {
      throw new AppError('config.missingKey', 'error.config.missingKey');
    }
    return this.engine.enqueue(params, profile.id);
  }

  cancelTask(localId: string): Promise<void> {
    return this.engine.cancel(localId);
  }
  retryTask(localId: string): Promise<void> {
    return this.engine.retry(localId);
  }
  listTasks(): TaskRecord[] {
    return this.engine.listTasks();
  }

  // ---- S4 HistoryService ----
  listHistory(): HistoryItem[] {
    return this.persistence.listHistory();
  }
  async regenerateFrom(historyId: string): Promise<{ localId: string }> {
    const h = this.persistence.getHistory(historyId);
    if (!h) throw new AppError('validation.failed', 'error.validation.failed', 'history not found');
    return this.submitTask(h.params);
  }
  openInFolder(historyId: string): Promise<void> {
    const h = this.persistence.getHistory(historyId);
    if (!h) return Promise.resolve();
    return this.media.openInFolder(h.localVideoPath);
  }
  async retryDownload(localId: string): Promise<void> {
    const t = this.persistence.getTask(localId);
    if (t) await this.engine.retry(localId); // retry 会重走，下载在成功后自动触发
  }

  // ---- S5 ConfigService（明文 Key 不外传） ----
  getConfig(): AppConfig {
    return this.config.getConfig();
  }
  updateConfig(patch: Partial<AppConfig>): AppConfig {
    return this.config.updateConfig(patch);
  }
  listProfiles(): Profile[] {
    return this.config.listProfiles();
  }
  upsertProfile(p: Profile): Profile {
    return this.config.upsertProfile(p);
  }
  deleteProfile(id: string): Promise<void> {
    this.config.deleteProfile(id);
    return this.keyVault.deleteKey(id);
  }
  setActiveProfile(id: string): void {
    this.config.setActiveProfile(id);
  }
  async setKey(profileId: string, apiKey: string): Promise<void> {
    await this.keyVault.setKey(profileId, apiKey);
  }
  hasKey(profileId: string): Promise<boolean> {
    return this.keyVault.hasKey(profileId);
  }
}
