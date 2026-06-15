// U2 api-client — HappyHorseClient
// 封装 HappyHorse 统一端点的提交与查询。使用全局 fetch（Node 18+/Electron 内置）。
// 不持有状态、不轮询、不下载——那些由 task-engine/media-store 负责。

import type { AuthContext, TaskQueryResult } from '@shared/types';
import { AppError, errorKeyForCode } from '@shared/errors';
import type { RequestBody } from './RequestBuilder';

export class HappyHorseClient {
  /** 可注入 fetch 便于测试 */
  constructor(private fetchFn: typeof fetch = fetch) {}

  /** 提交异步任务，返回 task_id */
  async submit(body: RequestBody, auth: AuthContext): Promise<{ taskId: string }> {
    const res = await this.#call(auth.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable', // 文档要求：HTTP 仅支持异步
        Authorization: `Bearer ${auth.apiKey}`
      },
      body: JSON.stringify(body)
    });

    const json = (await res.json()) as any;
    if (!res.ok || json?.code) {
      throw this.#toError(res.status, json);
    }
    const taskId = json?.output?.task_id ?? json?.task_id;
    if (!taskId) throw new AppError('network.error', 'error.network.error', 'no task_id in response');
    return { taskId };
  }

  /** 查询任务状态（auth.endpoint 此处应为查询 URL，由 ConfigManager.queryUrl 提供） */
  async query(queryUrl: string, apiKey: string): Promise<TaskQueryResult> {
    const res = await this.#call(queryUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    const json = (await res.json()) as any;
    const output = json?.output ?? json;
    const status = (output?.task_status ?? 'UNKNOWN') as TaskQueryResult['status'];

    if (status === 'FAILED') {
      return {
        taskId: output?.task_id,
        status,
        errorCode: output?.code ?? json?.code,
        errorMessage: output?.message ?? json?.message
      };
    }
    return {
      taskId: output?.task_id,
      status,
      videoUrl: output?.video_url
    };
  }

  async #call(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchFn(url, init);
    } catch (e) {
      throw new AppError('network.error', 'error.network.error', (e as Error)?.message);
    }
  }

  #toError(httpStatus: number, json: any): AppError {
    const code = json?.code ?? `HTTP_${httpStatus}`;
    return new AppError(code, errorKeyForCode(code), json?.message);
  }
}
