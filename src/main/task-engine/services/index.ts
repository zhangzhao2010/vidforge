// U3 task-engine — 编排服务
// main 进程的业务编排层，被 IpcGateway 路由调用。

import type { GenParams, Profile, AppConfig, Task, Generation, Capability, MediaInput } from '@shared/types';
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

  // ---- 任务（容器） ----
  /** 新建任务容器。name 缺省时用占位名（首次生成有 prompt 时引擎自动回填）。 */
  createTask(capability: Capability, name?: string): Task {
    const placeholder = `unnamed::${capability}::${new Date().toISOString()}`;
    return this.engine.createTask(capability, name?.trim() || placeholder);
  }
  listTaskContainers(): Task[] {
    return this.engine.listTaskContainers();
  }
  deleteTask(taskId: string): void {
    this.engine.deleteTask(taskId);
  }
  renameTask(taskId: string, name: string): void {
    this.engine.renameTask(taskId, name);
  }

  // ---- 生成 ----
  /** 在指定任务下提交一次生成：校验激活档+Key，持久化素材，再入队 */
  async submitGeneration(taskId: string, params: GenParams): Promise<{ localId: string }> {
    const profile = this.config.getActiveProfile();
    if (!profile) throw new AppError('config.noActiveProfile', 'error.config.noActiveProfile');
    if (!(await this.keyVault.hasKey(profile.id))) {
      throw new AppError('config.missingKey', 'error.config.missingKey');
    }
    const persistedParams = await this.#persistMedia(params);
    return this.engine.enqueue(taskId, persistedParams, profile.id);
  }

  /** 把 file 源素材拷进 assets 目录，改写 path（保留 originalPath 供展示） */
  async #persistMedia(params: GenParams): Promise<GenParams> {
    if (!params.media || params.media.length === 0) return params;
    const media: MediaInput[] = [];
    for (const m of params.media) {
      if (m.source.kind === 'file') {
        const copied = await this.media.persistAsset(m.source.path);
        media.push({ type: m.type, source: { kind: 'file', path: copied }, originalPath: m.source.path });
      } else {
        media.push(m);
      }
    }
    return { ...params, media };
  }

  listGenerationsByTask(taskId: string): Generation[] {
    return this.engine.listGenerationsByTask(taskId);
  }
  listAllGenerations(): Generation[] {
    return this.engine.listGenerations();
  }
  cancelGeneration(localId: string): Promise<void> {
    return this.engine.cancel(localId);
  }
  retryGeneration(localId: string): Promise<void> {
    return this.engine.retry(localId);
  }
  async openInFolder(localId: string): Promise<void> {
    const g = this.persistence.getGeneration(localId);
    if (g?.localVideoPath) await this.media.openInFolder(g.localVideoPath);
  }

  // ---- 配置 / Profile（明文 Key 不外传） ----
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
