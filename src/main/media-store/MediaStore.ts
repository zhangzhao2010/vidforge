// U4 media-store — MediaStore
// 1) 结果视频下载落盘（应对 video_url 24h 失效）。
// 2) 输入素材持久化（拷贝进 userData/assets，避免用户删除原文件后结果卡裂图）。

import { createWriteStream } from 'node:fs';
import { mkdir, copyFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { shell } from 'electron';
import type { Generation } from '@shared/types';
import { AppError } from '@shared/errors';
import type { ConfigManager } from '../core-config/ConfigManager';

export class MediaStore {
  constructor(
    private config: ConfigManager,
    private assetsDir: string,
    private fetchFn: typeof fetch = fetch
  ) {}

  /**
   * 把用户选择的本地素材拷贝进 assets 目录，返回副本绝对路径。
   * 持久化后即使用户删除/移动原文件，结果卡仍可展示参考图/视频。
   */
  async persistAsset(srcPath: string): Promise<string> {
    await mkdir(this.assetsDir, { recursive: true });
    const ext = extname(srcPath);
    const destName = `${randomUUID()}${ext}`;
    const destPath = join(this.assetsDir, destName);
    await copyFile(srcPath, destPath);
    return destPath;
  }

  /** 下载生成结果视频到配置目录，返回本地路径（历史已废弃，不再写 history 表） */
  async download(gen: Generation): Promise<string> {
    if (!gen.videoUrl) throw new AppError('download.failed', 'error.download.failed', 'no videoUrl');
    const dir = this.config.getConfig().downloadDir;
    await mkdir(dir, { recursive: true });

    const ts = gen.createdAt.replace(/[:.]/g, '-');
    const fileName = `vidforge_${gen.params.capability}_${ts}_${gen.localId.slice(0, 8)}.mp4`;
    const filePath = join(dir, fileName);

    const res = await this.fetchFn(gen.videoUrl);
    if (!res.ok || !res.body) {
      throw new AppError('download.failed', 'error.download.failed', `HTTP ${res.status}`);
    }

    await this.#streamToFile(res.body as unknown as ReadableStream<Uint8Array>, filePath);
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
