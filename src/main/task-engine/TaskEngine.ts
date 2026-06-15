// U3 task-engine — TaskEngine
// 任务容器（Task）+ 单次生成（Generation）的全生命周期：
// 创建任务、入队生成、串行调度（全局并发=1）、状态机守卫、持久化、提交、轮询、重启恢复。
// 事件：
//   'generation-updated'：每次生成状态变更后触发，供 IpcGateway 推送 renderer。
//   'task-list-updated'：任务容器列表变更（新建/改名/删除）后触发。

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { GenParams, Generation, Task, Capability, TaskStatus, AuthContext } from '@shared/types';
import { AppError, errorKeyForCode } from '@shared/errors';
import { deriveTaskName } from '@shared/capabilities';
import { assertTransition, isTerminal, mapRemoteStatus } from './stateMachine';
import type { Persistence } from './Persistence';
import type { Poller } from './Poller';
import type { ConfigManager } from '../core-config/ConfigManager';
import type { KeyVault } from '../core-config/KeyVault';
import type { HappyHorseClient } from '../api-client/HappyHorseClient';
import type { RequestBuilder } from '../api-client/RequestBuilder';

const MAX_CONCURRENT = 1; // v2：全局同时只跑一个生成（前一个完成才能提交下一个）

/** 下载回调由 media-store 注入，避免 task-engine 直接依赖 media-store 实现 */
export type DownloadFn = (gen: Generation) => Promise<string>; // 返回 localVideoPath

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

  // ---- 任务容器 ----
  /** 新建任务容器，能力创建时固定。初始用占位名，首次生成时按 prompt 回填。 */
  createTask(capability: Capability, name: string): Task {
    const now = new Date().toISOString();
    const task: Task = { id: randomUUID(), name, capability, createdAt: now, updatedAt: now };
    this.persistence.upsertTaskContainer(task);
    this.#emitTaskList();
    return task;
  }

  listTaskContainers(): Task[] {
    return this.persistence.listTaskContainers();
  }

  renameTask(taskId: string, name: string): void {
    const t = this.persistence.getTaskContainer(taskId);
    if (!t) return;
    t.name = name;
    t.updatedAt = new Date().toISOString();
    this.persistence.upsertTaskContainer(t);
    this.#emitTaskList();
  }

  deleteTask(taskId: string): void {
    // 取消该任务下所有进行中的生成轮询
    for (const g of this.persistence.listGenerationsByTask(taskId)) {
      this.poller.stopPolling(g.localId);
    }
    this.persistence.deleteTaskContainer(taskId);
    this.#emitTaskList();
  }

  listGenerationsByTask(taskId: string): Generation[] {
    return this.persistence.listGenerationsByTask(taskId);
  }

  listGenerations(): Generation[] {
    return this.persistence.listGenerations();
  }

  /** 任意生成处于活动态（用于 UI 全局串行约束的兜底判断） */
  hasActiveGeneration(): boolean {
    return this.#activeCount() > 0;
  }

  // ---- 生成 ----
  /** 在指定任务下入队一个新生成 */
  async enqueue(taskId: string, params: GenParams, profileId: string): Promise<{ localId: string }> {
    const task = this.persistence.getTaskContainer(taskId);
    if (!task) throw new AppError('validation.failed', 'error.validation.failed', `task ${taskId} not found`);

    const now = new Date().toISOString();
    const gen: Generation = {
      localId: randomUUID(),
      taskId,
      status: 'QUEUED',
      params,
      profileId,
      createdAt: now,
      updatedAt: now
    };
    this.persistence.upsertGeneration(gen);

    // 首次生成 + prompt 非空 → 用 prompt 回填任务名（占位名才覆盖，用户已手改的不动）
    this.#maybeNameTask(task, params);

    this.#emit(gen);
    void this.#pump();
    return { localId: gen.localId };
  }

  async cancel(localId: string): Promise<void> {
    const g = this.persistence.getGeneration(localId);
    if (!g || isTerminal(g.status)) return;
    this.poller.stopPolling(localId);
    this.#transition(g, 'CANCELLED');
    void this.#pump(); // 释放并发额度，推进队列中的下一个
  }

  async retry(localId: string): Promise<void> {
    const g = this.persistence.getGeneration(localId);
    if (!g) return;
    if (g.status === 'FAILED' || g.status === 'EXPIRED') {
      g.taskRemoteId = undefined;
      g.errorCode = undefined;
      g.errorMessage = undefined;
      g.createdAt = new Date().toISOString();
      this.#transition(g, 'QUEUED');
      void this.#pump();
    }
  }

  /** 启动恢复：对未完成生成重挂轮询或重新提交（FR-3.4） */
  async recoverOnStartup(): Promise<void> {
    const unfinished = this.persistence.listUnfinishedGenerations();
    const now = Date.now();
    for (const g of unfinished) {
      if (g.taskRemoteId && (g.status === 'PENDING' || g.status === 'RUNNING')) {
        if (now - new Date(g.createdAt).getTime() > 24 * 3600_000) {
          this.#transition(g, 'EXPIRED');
        } else {
          this.poller.startPolling(g.localId);
        }
      } else if (g.status === 'QUEUED' || g.status === 'SUBMITTING') {
        if (g.status === 'SUBMITTING') {
          this.persistence.upsertGeneration({ ...g, status: 'QUEUED', updatedAt: new Date().toISOString() });
          this.#emit({ ...g, status: 'QUEUED' });
        }
      } else if (g.status === 'DOWNLOADING') {
        this.persistence.upsertGeneration({ ...g, status: 'SUCCEEDED', updatedAt: new Date().toISOString() });
        void this.#tryDownload(this.persistence.getGeneration(g.localId)!);
      }
    }
    void this.#pump();
  }

  /** 轮询回调：查询远端状态并推进 */
  async pollOnce(localId: string): Promise<void> {
    const g = this.persistence.getGeneration(localId);
    if (!g || !g.taskRemoteId || isTerminal(g.status)) {
      this.poller.stopPolling(localId);
      return;
    }
    const profile = this.config.listProfiles().find((p) => p.id === g.profileId);
    if (!profile) return;
    try {
      const apiKey = await this.keyVault.getKey(profile.id);
      const url = this.config.queryUrl(profile, g.taskRemoteId);
      const res = await this.client.query(url, apiKey);
      const mapped = mapRemoteStatus(res.status);

      if (mapped === 'SUCCEEDED') {
        this.poller.stopPolling(localId);
        g.videoUrl = res.videoUrl;
        this.#transition(g, 'SUCCEEDED');
        void this.#tryDownload(this.persistence.getGeneration(localId)!);
      } else if (mapped === 'FAILED' || mapped === 'EXPIRED') {
        this.poller.stopPolling(localId);
        g.errorCode = res.errorCode;
        g.errorMessage = res.errorMessage;
        this.#transition(g, mapped);
        void this.#pump();
      } else if (mapped !== g.status) {
        this.#transition(g, mapped); // PENDING→RUNNING
      }
    } catch (e) {
      this.emit('poll-error', { localId, error: (e as Error).message });
    }
  }

  // ---- 内部：队列泵 ----
  #activeCount(): number {
    return this.persistence
      .listGenerations()
      .filter((g) => g.status === 'SUBMITTING' || g.status === 'PENDING' || g.status === 'RUNNING' || g.status === 'DOWNLOADING')
      .length;
  }

  async #pump(): Promise<void> {
    if (this.#activeCount() >= MAX_CONCURRENT) return;
    // 按创建时间挑最早的排队生成，保证串行先来先到
    const queued = this.persistence
      .listGenerations()
      .filter((g) => g.status === 'QUEUED')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const g of queued) {
      if (this.#activeCount() >= MAX_CONCURRENT) break;
      void this.#submit(g);
    }
  }

  async #submit(gen: Generation): Promise<void> {
    this.#transition(gen, 'SUBMITTING');
    try {
      const profile = this.config.listProfiles().find((p) => p.id === gen.profileId);
      if (!profile) throw new AppError('config.noActiveProfile', 'error.config.noActiveProfile');
      const apiKey = await this.keyVault.getKey(profile.id);
      const auth: AuthContext = { apiKey, endpoint: this.config.submitUrl(profile) };

      const validation = this.builder.validate(gen.params);
      if (!validation.ok) throw new AppError('validation.failed', 'error.validation.failed', validation.errors.join('; '));

      const body = this.builder.build(gen.params, /* resolveMedia */ true);
      const { taskId } = await this.client.submit(body, auth);
      gen.taskRemoteId = taskId;
      this.#transition(gen, 'PENDING');
      this.poller.startPolling(gen.localId);
    } catch (e) {
      const err = e instanceof AppError ? e : new AppError('network.error', errorKeyForCode(undefined), (e as Error).message);
      gen.errorCode = err.code;
      gen.errorMessage = err.detail ?? err.message;
      this.#transition(gen, 'FAILED');
      void this.#pump(); // 失败也要释放额度
    }
  }

  async #tryDownload(gen: Generation): Promise<void> {
    if (!this.downloadFn || !gen.videoUrl) return;
    this.#transition(gen, 'DOWNLOADING');
    try {
      const localPath = await this.downloadFn(gen);
      gen.localVideoPath = localPath;
      this.#transition(gen, 'COMPLETED');
    } catch (e) {
      gen.errorCode = 'download.failed';
      gen.errorMessage = (e as Error).message;
      this.#transition(gen, 'FAILED');
    } finally {
      void this.#pump(); // 终态后推进队列
    }
  }

  // ---- 任务命名 ----
  /** 若任务仍是占位名且本次 params 有 prompt，则用 prompt 回填任务名 */
  #maybeNameTask(task: Task, params: GenParams): void {
    const existing = this.persistence.listGenerationsByTask(task.id);
    const isFirst = existing.length <= 1; // 本次入队已写入，故 <=1 视为首次
    if (!isFirst) return;
    const derived = deriveTaskName(params.prompt);
    if (!derived) return;
    // 占位名形如 'unnamed::' 前缀；仅当未被用户改过时覆盖
    if (task.name.startsWith('unnamed::')) {
      this.renameTask(task.id, derived);
    }
  }

  // ---- 状态转移（守卫 + 持久化 + 事件） ----
  #transition(gen: Generation, to: TaskStatus): void {
    assertTransition(gen.status, to);
    gen.status = to;
    gen.updatedAt = new Date().toISOString();
    this.persistence.upsertGeneration(gen);
    this.#emit(gen);
  }

  #emit(gen: Generation): void {
    this.emit('generation-updated', { ...gen });
  }

  #emitTaskList(): void {
    this.emit('task-list-updated', this.persistence.listTaskContainers());
  }
}
