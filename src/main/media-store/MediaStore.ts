// U4 media-store — MediaStore
// 结果视频下载落盘（应对 video_url 24h 失效）+ 生成历史记录。

import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { shell } from 'electron';
import type { HistoryItem, TaskRecord } from '@shared/types';
import { AppError } from '@shared/errors';
import type { Persistence } from '../task-engine/Persistence';
import type { ConfigManager } from '../core-config/ConfigManager';

export class MediaStore {
  constructor(
    private persistence: Persistence,
    private config: ConfigManager,
    private fetchFn: typeof fetch = fetch
  ) {}

  /** 下载任务结果视频到配置目录，落盘后写入历史，返回本地路径 */
  async download(task: TaskRecord): Promise<string> {
    if (!task.videoUrl) throw new AppError('download.failed', 'error.download.failed', 'no videoUrl');
    const dir = this.config.getConfig().downloadDir;
    await mkdir(dir, { recursive: true });

    const ts = task.createdAt.replace(/[:.]/g, '-');
    const fileName = `vidforge_${task.params.capability}_${ts}_${task.localId.slice(0, 8)}.mp4`;
    const filePath = join(dir, fileName);

    const res = await this.fetchFn(task.videoUrl);
    if (!res.ok || !res.body) {
      throw new AppError('download.failed', 'error.download.failed', `HTTP ${res.status}`);
    }

    await this.#streamToFile(res.body as unknown as ReadableStream<Uint8Array>, filePath);

    // 写历史
    const item: HistoryItem = {
      id: randomUUID(),
      localId: task.localId,
      capability: task.params.capability,
      prompt: task.params.prompt,
      params: task.params,
      localVideoPath: filePath,
      createdAt: new Date().toISOString()
    };
    this.persistence.insertHistory(item);
    return filePath;
  }

  async #streamToFile(webStream: ReadableStream<Uint8Array>, filePath: string): Promise<void> {
    const nodeStream = Readable.fromWeb(webStream as any);
    await new Promise<void>((resolve, reject) => {
      const out = createWriteStream(filePath);
      nodeStream.pipe(out);
      out.on('finish', () => resolve());
      out.on('error', reject);
      nodeStream.on('error', reject);
    });
  }

  /** 在系统文件管理器中定位文件 */
  async openInFolder(localVideoPath: string): Promise<void> {
    shell.showItemInFolder(localVideoPath);
  }
}
