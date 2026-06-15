// 集成测试 U3 task-engine（普通示例测试，非 PBT）：
// 用内存 Persistence 桩 + mock client/keyVault/config，验证 提交→轮询→成功→下载 全链路。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskEngine } from '../../src/main/task-engine/TaskEngine';
import { Poller } from '../../src/main/task-engine/Poller';
import type { GenParams, Profile, TaskRecord, TaskQueryResult } from '../../src/shared/types';

// 极简内存 Persistence（实现 TaskEngine 用到的方法子集）
class MemPersistence {
  tasks = new Map<string, TaskRecord>();
  history: any[] = [];
  upsertTask(t: TaskRecord) { this.tasks.set(t.localId, { ...t }); }
  getTask(id: string) { const t = this.tasks.get(id); return t ? { ...t } : undefined; }
  listTasks() { return [...this.tasks.values()]; }
  listUnfinishedTasks() { return this.listTasks().filter((t) => ['QUEUED', 'SUBMITTING', 'PENDING', 'RUNNING', 'DOWNLOADING'].includes(t.status)); }
  insertHistory(h: any) { this.history.push(h); }
}

const profile: Profile = { id: 'p1', name: 'beijing', region: 'cn-beijing' };

function makeEngine(queryResults: TaskQueryResult[]) {
  const persistence = new MemPersistence();
  const poller = new Poller(() => Promise.resolve(), 999_999); // 手动驱动 pollOnce，不靠定时器
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

describe('TaskEngine integration', () => {
  let params: GenParams;
  beforeEach(() => {
    params = { capability: 't2v', prompt: 'hello' };
  });

  it('提交后进入 PENDING 并获得 task_id', async () => {
    const { engine, persistence, client } = makeEngine([]);
    const { localId } = await engine.enqueue(params, 'p1');
    // enqueue 触发异步 #pump → #submit；等待微任务完成
    await vi.waitFor(() => {
      const t = persistence.getTask(localId)!;
      expect(t.status).toBe('PENDING');
    });
    expect(client.submit).toHaveBeenCalledOnce();
    expect(persistence.getTask(localId)!.taskId).toBe('t1');
  });

  it('全链路：PENDING→RUNNING→SUCCEEDED→下载→COMPLETED', async () => {
    const { engine, persistence } = makeEngine([
      { taskId: 't1', status: 'RUNNING' },
      { taskId: 't1', status: 'SUCCEEDED', videoUrl: 'https://x/v.mp4' }
    ]);
    engine.setDownloadFn(async () => '/tmp/v.mp4');

    const { localId } = await engine.enqueue(params, 'p1');
    await vi.waitFor(() => expect(persistence.getTask(localId)!.status).toBe('PENDING'));

    await engine.pollOnce(localId); // → RUNNING
    expect(persistence.getTask(localId)!.status).toBe('RUNNING');

    await engine.pollOnce(localId); // → SUCCEEDED → DOWNLOADING → COMPLETED
    await vi.waitFor(() => expect(persistence.getTask(localId)!.status).toBe('COMPLETED'));
    expect(persistence.getTask(localId)!.localVideoPath).toBe('/tmp/v.mp4');
    expect(persistence.history.length).toBe(0); // 下载在 MediaStore，桩 downloadFn 不写 history
  });

  it('查询返回 FAILED 时任务置为 FAILED 并可重试', async () => {
    const { engine, persistence } = makeEngine([
      { taskId: 't1', status: 'FAILED', errorCode: 'InvalidParameter', errorMessage: 'bad' }
    ]);
    const { localId } = await engine.enqueue(params, 'p1');
    await vi.waitFor(() => expect(persistence.getTask(localId)!.status).toBe('PENDING'));
    await engine.pollOnce(localId);
    expect(persistence.getTask(localId)!.status).toBe('FAILED');
    expect(persistence.getTask(localId)!.errorCode).toBe('InvalidParameter');

    await engine.retry(localId);
    // retry 后回到 QUEUED 再被 pump 重新提交 → PENDING
    await vi.waitFor(() => expect(persistence.getTask(localId)!.status).toBe('PENDING'));
  });
});
