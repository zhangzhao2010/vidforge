// U3 task-engine — IpcGateway
// main 进程统一 IPC 入口：注册 ipcMain.handle 命令，订阅 TaskEngine 事件推送 renderer。

import { ipcMain, dialog, type BrowserWindow } from 'electron';
import type { GenParams, Profile, AppConfig, TaskRecord } from '@shared/types';
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
    this.#handle(IPC.TASK_SUBMIT, (_e, params: GenParams) => this.services.submitTask(params));
    this.#handle(IPC.TASK_CANCEL, (_e, id: string) => this.services.cancelTask(id));
    this.#handle(IPC.TASK_RETRY, (_e, id: string) => this.services.retryTask(id));
    this.#handle(IPC.TASK_LIST, () => this.services.listTasks());

    this.#handle(IPC.HISTORY_LIST, () => this.services.listHistory());
    this.#handle(IPC.HISTORY_REGENERATE, (_e, id: string) => this.services.regenerateFrom(id));
    this.#handle(IPC.HISTORY_OPEN_FOLDER, (_e, id: string) => this.services.openInFolder(id));
    this.#handle(IPC.HISTORY_RETRY_DOWNLOAD, (_e, id: string) => this.services.retryDownload(id));

    this.#handle(IPC.CONFIG_GET, () => this.services.getConfig());
    this.#handle(IPC.CONFIG_UPDATE, (_e, patch: Partial<AppConfig>) => this.services.updateConfig(patch));

    this.#handle(IPC.PROFILE_LIST, () => this.services.listProfiles());
    this.#handle(IPC.PROFILE_UPSERT, (_e, p: Profile) => this.services.upsertProfile(p));
    this.#handle(IPC.PROFILE_DELETE, (_e, id: string) => this.services.deleteProfile(id));
    this.#handle(IPC.PROFILE_SET_ACTIVE, (_e, id: string) => this.services.setActiveProfile(id));
    // 注意：setKey 接收明文，但仅 renderer→main 单向写入密钥链；main 不回传明文
    this.#handle(IPC.PROFILE_SET_KEY, (_e, args: { profileId: string; apiKey: string }) =>
      this.services.setKey(args.profileId, args.apiKey)
    );
    this.#handle(IPC.PROFILE_HAS_KEY, (_e, id: string) => this.services.hasKey(id));

    this.#handle(IPC.PICK_FILES, (_e, opts: { filters?: Electron.FileFilter[]; multi?: boolean }) =>
      this.#pickFiles(opts)
    );

    // 任务状态变更 → 推送 renderer
    this.engine.on('task-updated', (t: TaskRecord) => {
      this.getWindow()?.webContents.send(IPC.EVT_TASK_UPDATED, t);
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
