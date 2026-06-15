// preload — contextBridge 白名单 API。renderer 仅能访问 window.vidforge，无 Node 能力。

import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '@shared/ipc';
import type { GenParams, Profile, AppConfig, TaskRecord, HistoryItem } from '@shared/types';

/** 统一的 invoke 包装：解开 {ok,data,error} 信封，失败则 reject 一个可读错误 */
async function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, payload)) as
    | { ok: true; data: T }
    | { ok: false; error: { code: string; messageKey: string; detail?: string } };
  if (res.ok) return res.data;
  const err = new Error(res.error.detail ?? res.error.messageKey);
  (err as any).code = res.error.code;
  (err as any).messageKey = res.error.messageKey;
  throw err;
}

const api = {
  submitTask: (params: GenParams) => invoke<{ localId: string }>(IPC.TASK_SUBMIT, params),
  cancelTask: (localId: string) => invoke<void>(IPC.TASK_CANCEL, localId),
  retryTask: (localId: string) => invoke<void>(IPC.TASK_RETRY, localId),
  listTasks: () => invoke<TaskRecord[]>(IPC.TASK_LIST),

  listHistory: () => invoke<HistoryItem[]>(IPC.HISTORY_LIST),
  regenerateFrom: (historyId: string) => invoke<{ localId: string }>(IPC.HISTORY_REGENERATE, historyId),
  openInFolder: (historyId: string) => invoke<void>(IPC.HISTORY_OPEN_FOLDER, historyId),
  retryDownload: (localId: string) => invoke<void>(IPC.HISTORY_RETRY_DOWNLOAD, localId),

  getConfig: () => invoke<AppConfig>(IPC.CONFIG_GET),
  updateConfig: (patch: Partial<AppConfig>) => invoke<AppConfig>(IPC.CONFIG_UPDATE, patch),

  listProfiles: () => invoke<Profile[]>(IPC.PROFILE_LIST),
  upsertProfile: (p: Profile) => invoke<Profile>(IPC.PROFILE_UPSERT, p),
  deleteProfile: (id: string) => invoke<void>(IPC.PROFILE_DELETE, id),
  setActiveProfile: (id: string) => invoke<void>(IPC.PROFILE_SET_ACTIVE, id),
  setKey: (profileId: string, apiKey: string) => invoke<void>(IPC.PROFILE_SET_KEY, { profileId, apiKey }),
  hasKey: (profileId: string) => invoke<boolean>(IPC.PROFILE_HAS_KEY, profileId),

  pickFiles: (opts: { filters?: { name: string; extensions: string[] }[]; multi?: boolean }) =>
    invoke<string[]>(IPC.PICK_FILES, opts),

  /** 订阅任务更新事件，返回取消订阅函数 */
  onTaskUpdate: (cb: (t: TaskRecord) => void): (() => void) => {
    const listener = (_e: unknown, t: TaskRecord) => cb(t);
    ipcRenderer.on(IPC.EVT_TASK_UPDATED, listener);
    return () => ipcRenderer.removeListener(IPC.EVT_TASK_UPDATED, listener);
  }
};

export type VidforgeApi = typeof api;
contextBridge.exposeInMainWorld('vidforge', api);
