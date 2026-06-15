// U3 task-engine — TaskEngine
// 任务全生命周期：并发队列、状态机守卫、持久化、提交、轮询调度、重启恢复。
// 事件：'task-updated' 在每次状态变更后触发，供 IpcGateway 推送 renderer。

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { GenParams, TaskRecord, TaskStatus, AuthContext } from '@shared/types';
import { AppError, errorKeyForCode } from '@shared/errors';
import { assertTransition, isTerminal, mapRemoteStatus } from './stateMachine';
import type { Persistence } from './Persistence';
import type { Poller } from './Poller';
import type { ConfigManager } from '../core-config/ConfigManager';
import type { KeyVault } from '../core-config/KeyVault';
import type { HappyHorseClient } from '../api-client/HappyHorseClient';
import type { RequestBuilder } from '../api-client/RequestBuilder';

const MAX_CONCURRENT = 3; // 并发提交/进行中的任务上限

/** 下载回调由 media-store 注入，避免 task-engine 直接依赖 media-store 实现 */
export type DownloadFn = (task: TaskRecord) => Promise<string>; // 返回 localVideoPath

export class TaskEngine extends EventEmitter {
  private downloadFn?: DownloadFn;

  constructor(
    private persistence: Persistence,
    private poller: Poller,
    private config: ConfigManager,
    private keyVault: KeyVault,
    private client: HappyHorseClient,
    private builder: RequestBuilder
  ) {
    super();
  }

  setDownloadFn(fn: DownloadFn): void {
    this.downloadFn = fn;
  }

  /** 入队一个新任务 */
  async enqueue(params: GenParams, profileId: string): Promise<{ localId: string }> {
    const now = new Date().toISOString();
    const record: TaskRecord = {
      localId: randomUUID(),
      status: 'QUEUED',
      params,
      profileId,
      createdAt: now,
      updatedAt: now
    };
    this.persistence.upsertTask(record);
    this.#emit(record);
    void this.#pump();
    return { localId: record.localId };
  }

  listTasks(): TaskRecord[] {
    return this.persistence.listTasks();
  }

  async cancel(localId: string): Promise<void> {
    const t = this.persistence.getTask(localId);
    if (!t || isTerminal(t.status)) return;
    this.poller.stopPolling(localId);
    this.#transition(t, 'CANCELLED');
  }

  async retry(localId: string): Promise<void> {
    const t = this.persistence.getTask(localId);
    if (!t) return;
    if (t.status === 'FAILED' || t.status === 'EXPIRED') {
      // 重置为新任务周期（新的 24h 起点）
      t.taskId = undefined;
      t.errorCode = undefined;
      t.errorMessage = undefined;
      t.createdAt = new Date().toISOString();
      this.#transition(t, 'QUEUED');
      void this.#pump();
    }
  }

  /** 启动恢复：对未完成任务重挂轮询或重新提交（FR-3.4） */
  async recoverOnStartup(): Promise<void> {
    const unfinished = this.persistence.listUnfinishedTasks();
    const now = Date.now();
    for (const t of unfinished) {
      if (t.taskId && (t.status === 'PENDING' || t.status === 'RUNNING')) {
        // 仍在 24h 内 → 重挂轮询；否则置 EXPIRED
        if (now - new Date(t.createdAt).getTime() > 24 * 3600_000) {
          this.#transition(t, 'EXPIRED');
        } else {
          this.poller.startPolling(t.localId);
        }
      } else if (t.status === 'QUEUED' || t.status === 'SUBMITTING') {
        // 未真正提交 → 回到队列重新走
        if (t.status === 'SUBMITTING') {
          // 直接复位为 QUEUED（SUBMITTING 不是合法的起始恢复态）
          this.persistence.upsertTask({ ...t, status: 'QUEUED', updatedAt: new Date().toISOString() });
          this.#emit({ ...t, status: 'QUEUED' });
        }
      } else if (t.status === 'DOWNLOADING') {
        // 下载中断 → 回到 SUCCEEDED 触发重新下载
        this.persistence.upsertTask({ ...t, status: 'SUCCEEDED', updatedAt: new Date().toISOString() });
        void this.#tryDownload(this.persistence.getTask(t.localId)!);
      }
    }
    void this.#pump();
  }

  /** 轮询回调：查询远端状态并推进 */
  async pollOnce(localId: string): Promise<void> {
    const t = this.persistence.getTask(localId);
    if (!t || !t.taskId || isTerminal(t.status)) {
      this.poller.stopPolling(localId);
      return;
    }
    const profile = this.config.listProfiles().find((p) => p.id === t.profileId);
    if (!profile) return;
    try {
      const apiKey = await this.keyVault.getKey(profile.id);
      const url = this.config.queryUrl(profile, t.taskId);
      const res = await this.client.query(url, apiKey);
      const mapped = mapRemoteStatus(res.status);

      if (mapped === 'SUCCEEDED') {
        this.poller.stopPolling(localId);
        t.videoUrl = res.videoUrl;
        this.#transition(t, 'SUCCEEDED');
        void this.#tryDownload(this.persistence.getTask(localId)!);
      } else if (mapped === 'FAILED' || mapped === 'EXPIRED') {
        this.poller.stopPolling(localId);
        t.errorCode = res.errorCode;
        t.errorMessage = res.errorMessage;
        this.#transition(t, mapped);
      } else if (mapped !== t.status) {
        this.#transition(t, mapped); // PENDING→RUNNING
      }
    } catch (e) {
      // 瞬时网络错误：保留任务，下一轮重试（不立刻判失败）
      this.emit('poll-error', { localId, error: (e as Error).message });
    }
  }

  // ---- 内部：队列泵 ----
  #activeCount(): number {
    return this.persistence
      .listTasks()
      .filter((t) => t.status === 'SUBMITTING' || t.status === 'PENDING' || t.status === 'RUNNING' || t.status === 'DOWNLOADING')
      .length;
  }

  async #pump(): Promise<void> {
    const queued = this.persistence.listTasks().filter((t) => t.status === 'QUEUED');
    for (const t of queued) {
      if (this.#activeCount() >= MAX_CONCURRENT) break;
      void this.#submit(t);
    }
  }

  async #submit(task: TaskRecord): Promise<void> {
    this.#transition(task, 'SUBMITTING');
    try {
      const profile = this.config.listProfiles().find((p) => p.id === task.profileId);
      if (!profile) throw new AppError('config.noActiveProfile', 'error.config.noActiveProfile');
      const apiKey = await this.keyVault.getKey(profile.id);
      const auth: AuthContext = { apiKey, endpoint: this.config.submitUrl(profile) };

      const validation = this.builder.validate(task.params);
      if (!validation.ok) throw new AppError('validation.failed', 'error.validation.failed', validation.errors.join('; '));

      const body = this.builder.build(task.params, /* resolveMedia */ true);
      const { taskId } = await this.client.submit(body, auth);
      task.taskId = taskId;
      this.#transition(task, 'PENDING');
      this.poller.startPolling(task.localId);
    } catch (e) {
      const err = e instanceof AppError ? e : new AppError('network.error', errorKeyForCode(undefined), (e as Error).message);
      task.errorCode = err.code;
      task.errorMessage = err.detail ?? err.message;
      this.#transition(task, 'FAILED');
    }
  }

  async #tryDownload(task: TaskRecord): Promise<void> {
    if (!this.downloadFn || !task.videoUrl) return;
    this.#transition(task, 'DOWNLOADING');
    try {
      const localPath = await this.downloadFn(task);
      task.localVideoPath = localPath;
      this.#transition(task, 'COMPLETED');
    } catch (e) {
      task.errorCode = 'download.failed';
      task.errorMessage = (e as Error).message;
      this.#transition(task, 'FAILED');
    }
  }

  // ---- 状态转移（守卫 + 持久化 + 事件） ----
  #transition(task: TaskRecord, to: TaskStatus): void {
    assertTransition(task.status, to);
    task.status = to;
    task.updatedAt = new Date().toISOString();
    this.persistence.upsertTask(task);
    this.#emit(task);
  }

  #emit(task: TaskRecord): void {
    this.emit('task-updated', { ...task });
  }
}
