// 集成测试 U3 task-engine（普通示例测试，非 PBT）：
// 用内存 Persistence 桩 + mock client/keyVault/config，验证：
//  - 任务容器创建 + 提交→轮询→成功→下载 全链路
//  - 全局并发=1 串行约束（第二个生成在第一个完成前不会并发提交）
//  - 失败可重试

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskEngine } from '../../src/main/task-engine/TaskEngine';
import { Poller } from '../../src/main/task-engine/Poller';
import type { GenParams, Profile, Task, Generation, TaskQueryResult } from '../../src/shared/types';

// 极简内存 Persistence（实现 TaskEngine 用到的方法子集）
class MemPersistence {
  containers = new Map<string, Task>();
  gens = new Map<string, Generation>();

  upsertTaskContainer(t: Task) { this.containers.set(t.id, { ...t }); }
  getTaskContainer(id: string) { const t = this.containers.get(id); return t ? { ...t } : undefined; }
  listTaskContainers() { return [...this.containers.values()]; }
  deleteTaskContainer(id: string) {
    this.containers.delete(id);
    for (const [k, g] of this.gens) if (g.taskId === id) this.gens.delete(k);
  }

  upsertGeneration(g: Generation) { this.gens.set(g.localId, { ...g }); }
  getGeneration(id: string) { const g = this.gens.get(id); return g ? { ...g } : undefined; }
  listGenerations() { return [...this.gens.values()]; }
  listGenerationsByTask(taskId: string) { return this.listGenerations().filter((g) => g.taskId === taskId); }
  listUnfinishedGenerations() {
    return this.listGenerations().filter((g) => ['QUEUED', 'SUBMITTING', 'PENDING', 'RUNNING', 'DOWNLOADING'].includes(g.status));
  }
  deleteGeneration(id: string) { this.gens.delete(id); }
}

const profile: Profile = { id: 'p1', name: 'beijing', region: 'cn-beijing' };

function makeEngine(queryResults: TaskQueryResult[]) {
  const persistence = new MemPersistence();
  const poller = new Poller(() => Promise.resolve(), 999_999); // 手动驱动 pollOnce
  const config = {
    listProfiles: () => [profile],
    getActiveProfile: () => profile,
    submitUrl: () => 'https://x/api/v1/services/aigc/video-generation/video-synthesis',
    queryUrl: () => 'https://x/api/v1/tasks/t1'
  };
  const keyVault = { getKey: vi.fn().mockResolvedValue('sk-test'), hasKey: vi.fn().mockResolvedValue(true) };
  const client = {
    submit: vi.fn().mockResolvedValue({ taskId: 't1' }),
    query: vi.fn().mockImplementation(() => Promise.resolve(queryResults.shift()))
  };
  const builder = {
    validate: () => ({ ok: true, errors: [] }),
    build: () => ({ model: 'happyhorse-1.0-t2v', input: {} })
  };
  const engine = new TaskEngine(persistence as any, poller, config as any, keyVault as any, client as any, builder as any);
  return { engine, persistence, client };
}

describe('TaskEngine integration (v2 Task/Generation)', () => {
  let params: GenParams;
  beforeEach(() => {
    params = { capability: 't2v', prompt: 'hello world prompt' };
  });

  it('创建任务后提交生成进入 PENDING 并获得 task_id', async () => {
    const { engine, persistence, client } = makeEngine([]);
    const task = engine.createTask('t2v', 'unnamed::t2v::x');
    const { localId } = await engine.enqueue(task.id, params, 'p1');
    await vi.waitFor(() => expect(persistence.getGeneration(localId)!.status).toBe('PENDING'));
    expect(client.submit).toHaveBeenCalledOnce();
    expect(persistence.getGeneration(localId)!.taskRemoteId).toBe('t1');
  });

  it('首次生成的 prompt 回填占位任务名', async () => {
    const { engine, persistence } = makeEngine([]);
    const task = engine.createTask('t2v', 'unnamed::t2v::x');
    await engine.enqueue(task.id, params, 'p1');
    expect(persistence.getTaskContainer(task.id)!.name).toBe('hello world prompt');
  });

  it('全链路：PENDING→RUNNING→SUCCEEDED→下载→COMPLETED', async () => {
    const { engine, persistence } = makeEngine([
      { taskId: 't1', status: 'RUNNING' },
      { taskId: 't1', status: 'SUCCEEDED', videoUrl: 'https://x/v.mp4' }
    ]);
    engine.setDownloadFn(async () => '/tmp/v.mp4');

    const task = engine.createTask('t2v', 'unnamed::t2v::x');
    const { localId } = await engine.enqueue(task.id, params, 'p1');
    await vi.waitFor(() => expect(persistence.getGeneration(localId)!.status).toBe('PENDING'));

    await engine.pollOnce(localId);
    expect(persistence.getGeneration(localId)!.status).toBe('RUNNING');

    await engine.pollOnce(localId);
    await vi.waitFor(() => expect(persistence.getGeneration(localId)!.status).toBe('COMPLETED'));
    expect(persistence.getGeneration(localId)!.localVideoPath).toBe('/tmp/v.mp4');
  });

  it('全局并发=1：第二个生成在第一个完成前保持 QUEUED，不并发提交', async () => {
    const { engine, persistence, client } = makeEngine([]);
    const task = engine.createTask('t2v', 'unnamed::t2v::x');
    const { localId: g1 } = await engine.enqueue(task.id, params, 'p1');
    await vi.waitFor(() => expect(persistence.getGeneration(g1)!.status).toBe('PENDING'));

    const { localId: g2 } = await engine.enqueue(task.id, params, 'p1');
    // g1 仍 active（PENDING），g2 不应被提交
    await new Promise((r) => setTimeout(r, 20));
    expect(persistence.getGeneration(g2)!.status).toBe('QUEUED');
    expect(client.submit).toHaveBeenCalledOnce();

    // g1 取消（释放额度）→ g2 被泵起提交
    await engine.cancel(g1);
    await vi.waitFor(() => expect(persistence.getGeneration(g2)!.status).toBe('PENDING'));
    expect(client.submit).toHaveBeenCalledTimes(2);
  });

  it('查询返回 FAILED 时生成置为 FAILED 并可重试', async () => {
    const { engine, persistence } = makeEngine([
      { taskId: 't1', status: 'FAILED', errorCode: 'InvalidParameter', errorMessage: 'bad' }
    ]);
    const task = engine.createTask('t2v', 'unnamed::t2v::x');
    const { localId } = await engine.enqueue(task.id, params, 'p1');
    await vi.waitFor(() => expect(persistence.getGeneration(localId)!.status).toBe('PENDING'));
    await engine.pollOnce(localId);
    expect(persistence.getGeneration(localId)!.status).toBe('FAILED');
    expect(persistence.getGeneration(localId)!.errorCode).toBe('InvalidParameter');

    await engine.retry(localId);
    await vi.waitFor(() => expect(persistence.getGeneration(localId)!.status).toBe('PENDING'));
  });
});
