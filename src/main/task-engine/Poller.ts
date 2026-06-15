// U3 task-engine — Poller
// 按节流间隔轮询单个任务状态，遵守 RPS；检测 24h 过期；回报状态变化。

import type { Generation } from '@shared/types';
import { POLL_INTERVAL_MS, TASK_TTL_MS } from '@shared/capabilities';

export type PollCallback = (localId: string) => Promise<void>;

export class Poller {
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private onPoll: PollCallback,
    private intervalMs = POLL_INTERVAL_MS
  ) {}

  startPolling(localId: string): void {
    if (this.timers.has(localId)) return;
    const timer = setInterval(() => {
      void this.onPoll(localId);
    }, this.intervalMs);
    this.timers.set(localId, timer);
  }

  stopPolling(localId: string): void {
    const t = this.timers.get(localId);
    if (t) {
      clearInterval(t);
      this.timers.delete(localId);
    }
  }

  stopAll(): void {
    for (const t of this.timers.values()) clearInterval(t);
    this.timers.clear();
  }

  /** 生成是否已超 24h（基于 createdAt） */
  static isExpired(record: Generation, now: number): boolean {
    return now - new Date(record.createdAt).getTime() > TASK_TTL_MS;
  }
}
