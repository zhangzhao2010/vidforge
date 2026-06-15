// preload — contextBridge 白名单 API。renderer 仅能访问 window.vidforge，无 Node 能力。

import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '@shared/ipc';
import type { GenParams, Profile, AppConfig, Task, Generation, Capability } from '@shared/types';

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
  // 任务容器
  createTask: (capability: Capability, name?: string) => invoke<Task>(IPC.TASK_CREATE, { capability, name }),
  listTaskContainers: () => invoke<Task[]>(IPC.TASK_CONTAINER_LIST),
  deleteTask: (taskId: string) => invoke<void>(IPC.TASK_DELETE, taskId),
  renameTask: (taskId: string, name: string) => invoke<void>(IPC.TASK_RENAME, { taskId, name }),

  // 生成
  submitGeneration: (taskId: string, params: GenParams) =>
    invoke<{ localId: string }>(IPC.GENERATION_SUBMIT, { taskId, params }),
  listGenerationsByTask: (taskId: string) => invoke<Generation[]>(IPC.GENERATION_LIST_BY_TASK, taskId),
  listAllGenerations: () => invoke<Generation[]>(IPC.GENERATION_LIST_ALL),
  cancelGeneration: (localId: string) => invoke<void>(IPC.GENERATION_CANCEL, localId),
  retryGeneration: (localId: string) => invoke<void>(IPC.GENERATION_RETRY, localId),
  openInFolder: (localId: string) => invoke<void>(IPC.GENERATION_OPEN_FOLDER, localId),

  // 配置 / Profile
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

  /** 把本地图片读成 data URL 供表单 <img> 预览；非图片/超限/读失败返回 null */
  readImageDataUrl: (path: string) => invoke<string | null>(IPC.READ_IMAGE_DATA_URL, path),

  /** 订阅单条生成更新事件，返回取消订阅函数 */
  onGenerationUpdate: (cb: (g: Generation) => void): (() => void) => {
    const listener = (_e: unknown, g: Generation) => cb(g);
    ipcRenderer.on(IPC.EVT_GENERATION_UPDATED, listener);
    return () => ipcRenderer.removeListener(IPC.EVT_GENERATION_UPDATED, listener);
  },

  /** 订阅任务容器列表更新事件，返回取消订阅函数 */
  onTaskListUpdate: (cb: (tasks: Task[]) => void): (() => void) => {
    const listener = (_e: unknown, tasks: Task[]) => cb(tasks);
    ipcRenderer.on(IPC.EVT_TASK_LIST_UPDATED, listener);
    return () => ipcRenderer.removeListener(IPC.EVT_TASK_LIST_UPDATED, listener);
  }
};

export type VidforgeApi = typeof api;
contextBridge.exposeInMainWorld('vidforge', api);
