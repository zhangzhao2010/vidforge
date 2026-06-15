// renderer — Zustand 全局 store。任务/历史/配置的前端镜像。

import { create } from 'zustand';
import type { AppConfig, HistoryItem, Profile, TaskRecord } from '@shared/types';

interface AppState {
  config: AppConfig | null;
  profiles: Profile[];
  tasks: TaskRecord[];
  history: HistoryItem[];

  refreshAll: () => Promise<void>;
  refreshConfig: () => Promise<void>;
  refreshProfiles: () => Promise<void>;
  refreshTasks: () => Promise<void>;
  refreshHistory: () => Promise<void>;
  upsertTask: (t: TaskRecord) => void;
}

export const useStore = create<AppState>((set, get) => ({
  config: null,
  profiles: [],
  tasks: [],
  history: [],

  refreshAll: async () => {
    await Promise.all([get().refreshConfig(), get().refreshProfiles(), get().refreshTasks(), get().refreshHistory()]);
  },
  refreshConfig: async () => set({ config: await window.vidforge.getConfig() }),
  refreshProfiles: async () => set({ profiles: await window.vidforge.listProfiles() }),
  refreshTasks: async () => set({ tasks: await window.vidforge.listTasks() }),
  refreshHistory: async () => set({ history: await window.vidforge.listHistory() }),

  /** 收到 task-updated 事件时合并单条任务 */
  upsertTask: (t) =>
    set((s) => {
      const idx = s.tasks.findIndex((x) => x.localId === t.localId);
      const tasks = idx >= 0 ? s.tasks.map((x) => (x.localId === t.localId ? t : x)) : [t, ...s.tasks];
      // 任务完成时刷新历史
      if (t.status === 'COMPLETED') void get().refreshHistory();
      return { tasks };
    })
}));
