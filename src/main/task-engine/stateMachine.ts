// U3 task-engine — 任务状态机（纯逻辑，PBT 对象）
// 定义合法状态转移。TaskEngine 通过 canTransition/assertTransition 守卫所有状态变更。

import type { TaskStatus } from '@shared/types';

/** 合法转移表：from → 允许的 to 集合 */
export const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  QUEUED: ['SUBMITTING', 'CANCELLED'],
  SUBMITTING: ['PENDING', 'FAILED', 'CANCELLED'],
  PENDING: ['RUNNING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED'],
  RUNNING: ['SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED'],
  SUCCEEDED: ['DOWNLOADING', 'COMPLETED', 'FAILED'],
  DOWNLOADING: ['COMPLETED', 'FAILED'],
  COMPLETED: [], // 终态
  FAILED: ['QUEUED'], // 允许 retry 回到队列
  EXPIRED: ['QUEUED'], // 允许基于原参数重试
  CANCELLED: [] // 终态
};

/** 终态集合 */
export const TERMINAL: ReadonlySet<TaskStatus> = new Set<TaskStatus>(['COMPLETED', 'CANCELLED']);

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminal(s: TaskStatus): boolean {
  return TERMINAL.has(s);
}

export class IllegalTransitionError extends Error {
  constructor(from: TaskStatus, to: TaskStatus) {
    super(`illegal task transition: ${from} -> ${to}`);
    this.name = 'IllegalTransitionError';
  }
}

export function assertTransition(from: TaskStatus, to: TaskStatus): void {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
}

/** DashScope task_status → 内部 TaskStatus 映射 */
export function mapRemoteStatus(remote: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN'): TaskStatus {
  switch (remote) {
    case 'PENDING':
      return 'PENDING';
    case 'RUNNING':
      return 'RUNNING';
    case 'SUCCEEDED':
      return 'SUCCEEDED';
    case 'FAILED':
      return 'FAILED';
    case 'UNKNOWN':
      return 'EXPIRED';
  }
}
