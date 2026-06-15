// renderer — Zustand 全局 store。任务容器 / 生成 / 配置的前端镜像。

import { create } from 'zustand';
import type { AppConfig, Profile, Task, Generation, Capability } from '@shared/types';

/** 活动态：占用全局唯一生成额度的状态集合 */
const ACTIVE_STATUSES = ['QUEUED', 'SUBMITTING', 'PENDING', 'RUNNING', 'DOWNLOADING'];

interface AppState {
  config: AppConfig | null;
  profiles: Profile[];
  tasks: Task[]; // 任务容器列表
  generationsByTask: Record<string, Generation[]>; // 按任务分组的生成
  activeTaskId: string | null;

  refreshAll: () => Promise<void>;
  refreshConfig: () => Promise<void>;
  refreshProfiles: () => Promise<void>;
  refreshTasks: () => Promise<void>;
  refreshGenerations: (taskId: string) => Promise<void>;

  createTask: (capability: Capability, name?: string) => Promise<Task>;
  deleteTask: (taskId: string) => Promise<void>;
  selectTask: (taskId: string | null) => void;

  upsertGeneration: (g: Generation) => void;
  setTasks: (tasks: Task[]) => void;

  /** 全局是否已有生成在跑（串行约束：true 时禁止再提交） */
  hasActiveGeneration: () => boolean;
}

export const useStore = create<AppState>((set, get) => ({
  config: null,
  profiles: [],
  tasks: [],
  generationsByTask: {},
  activeTaskId: null,

  refreshAll: async () => {
    await Promise.all([get().refreshConfig(), get().refreshProfiles(), get().refreshTasks()]);
    // 预载全部生成，便于全局 active 判定
    const all = await window.vidforge.listAllGenerations();
    const grouped: Record<string, Generation[]> = {};
    for (const g of all) (grouped[g.taskId] ??= []).push(g);
    set({ generationsByTask: grouped });
  },
  refreshConfig: async () => set({ config: await window.vidforge.getConfig() }),
  refreshProfiles: async () => set({ profiles: await window.vidforge.listProfiles() }),
  refreshTasks: async () => set({ tasks: await window.vidforge.listTaskContainers() }),
  refreshGenerations: async (taskId) => {
    const list = await window.vidforge.listGenerationsByTask(taskId);
    set((s) => ({ generationsByTask: { ...s.generationsByTask, [taskId]: list } }));
  },

  createTask: async (capability, name) => {
    const task = await window.vidforge.createTask(capability, name);
    await get().refreshTasks();
    set({ activeTaskId: task.id });
    return task;
  },
  deleteTask: async (taskId) => {
    await window.vidforge.deleteTask(taskId);
    await get().refreshTasks();
    set((s) => {
      const next = { ...s.generationsByTask };
      delete next[taskId];
      return { generationsByTask: next, activeTaskId: s.activeTaskId === taskId ? null : s.activeTaskId };
    });
  },
  selectTask: (taskId) => {
    set({ activeTaskId: taskId });
    if (taskId) void get().refreshGenerations(taskId);
  },

  /** 收到 generation-updated 事件时合并单条生成 */
  upsertGeneration: (g) =>
    set((s) => {
      const list = s.generationsByTask[g.taskId] ?? [];
      const idx = list.findIndex((x) => x.localId === g.localId);
      const nextList = idx >= 0 ? list.map((x) => (x.localId === g.localId ? g : x)) : [...list, g];
      return { generationsByTask: { ...s.generationsByTask, [g.taskId]: nextList } };
    }),

  setTasks: (tasks) => set({ tasks }),

  hasActiveGeneration: () => {
    const groups = get().generationsByTask;
    for (const list of Object.values(groups)) {
      if (list.some((g) => ACTIVE_STATUSES.includes(g.status))) return true;
    }
    return false;
  }
}));
