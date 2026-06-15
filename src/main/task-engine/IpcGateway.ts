// U3 task-engine — IpcGateway
// main 进程统一 IPC 入口：注册 ipcMain.handle 命令，订阅 TaskEngine 事件推送 renderer。

import { ipcMain, dialog, type BrowserWindow } from 'electron';
import type { GenParams, Profile, AppConfig, Task, Generation, Capability } from '@shared/types';
import { IPC } from '@shared/ipc';
import { AppError } from '@shared/errors';
import type { Services } from './services';
import type { TaskEngine } from './TaskEngine';

export class IpcGateway {
  constructor(
    private services: Services,
    private engine: TaskEngine,
    private getWindow: () => BrowserWindow | null
  ) {}

  register(): void {
    // 任务容器
    this.#handle(IPC.TASK_CREATE, (_e, args: { capability: Capability; name?: string }) =>
      this.services.createTask(args.capability, args.name)
    );
    this.#handle(IPC.TASK_CONTAINER_LIST, () => this.services.listTaskContainers());
    this.#handle(IPC.TASK_DELETE, (_e, id: string) => this.services.deleteTask(id));
    this.#handle(IPC.TASK_RENAME, (_e, args: { taskId: string; name: string }) =>
      this.services.renameTask(args.taskId, args.name)
    );

    // 生成
    this.#handle(IPC.GENERATION_SUBMIT, (_e, args: { taskId: string; params: GenParams }) =>
      this.services.submitGeneration(args.taskId, args.params)
    );
    this.#handle(IPC.GENERATION_LIST_BY_TASK, (_e, taskId: string) => this.services.listGenerationsByTask(taskId));
    this.#handle(IPC.GENERATION_LIST_ALL, () => this.services.listAllGenerations());
    this.#handle(IPC.GENERATION_CANCEL, (_e, id: string) => this.services.cancelGeneration(id));
    this.#handle(IPC.GENERATION_RETRY, (_e, id: string) => this.services.retryGeneration(id));
    this.#handle(IPC.GENERATION_OPEN_FOLDER, (_e, id: string) => this.services.openInFolder(id));

    // 配置 / Profile
    this.#handle(IPC.CONFIG_GET, () => this.services.getConfig());
    this.#handle(IPC.CONFIG_UPDATE, (_e, patch: Partial<AppConfig>) => this.services.updateConfig(patch));
    this.#handle(IPC.PROFILE_LIST, () => this.services.listProfiles());
    this.#handle(IPC.PROFILE_UPSERT, (_e, p: Profile) => this.services.upsertProfile(p));
    this.#handle(IPC.PROFILE_DELETE, (_e, id: string) => this.services.deleteProfile(id));
    this.#handle(IPC.PROFILE_SET_ACTIVE, (_e, id: string) => this.services.setActiveProfile(id));
    this.#handle(IPC.PROFILE_SET_KEY, (_e, args: { profileId: string; apiKey: string }) =>
      this.services.setKey(args.profileId, args.apiKey)
    );
    this.#handle(IPC.PROFILE_HAS_KEY, (_e, id: string) => this.services.hasKey(id));

    this.#handle(IPC.PICK_FILES, (_e, opts: { filters?: Electron.FileFilter[]; multi?: boolean }) =>
      this.#pickFiles(opts)
    );

    // 生成状态变更 → 推送 renderer
    this.engine.on('generation-updated', (g: Generation) => {
      this.getWindow()?.webContents.send(IPC.EVT_GENERATION_UPDATED, g);
    });
    // 任务容器列表变更 → 推送 renderer
    this.engine.on('task-list-updated', (tasks: Task[]) => {
      this.getWindow()?.webContents.send(IPC.EVT_TASK_LIST_UPDATED, tasks);
    });
  }

  /** 包装 handler：把 AppError 归一化为可序列化的错误对象传回 renderer */
  #handle(channel: string, fn: (e: Electron.IpcMainInvokeEvent, ...args: any[]) => any): void {
    ipcMain.handle(channel, async (e, ...args) => {
      try {
        return { ok: true, data: await fn(e, ...args) };
      } catch (err) {
        if (err instanceof AppError) {
          return { ok: false, error: { code: err.code, messageKey: err.messageKey, detail: err.detail } };
        }
        return { ok: false, error: { code: 'unknown', messageKey: 'error.unknown', detail: (err as Error).message } };
      }
    });
  }

  async #pickFiles(opts: { filters?: Electron.FileFilter[]; multi?: boolean }): Promise<string[]> {
    const win = this.getWindow();
    if (!win) return [];
    const res = await dialog.showOpenDialog(win, {
      properties: opts.multi ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: opts.filters
    });
    return res.canceled ? [] : res.filePaths;
  }
}
