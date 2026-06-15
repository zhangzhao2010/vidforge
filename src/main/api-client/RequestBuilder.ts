// U2 api-client — RequestBuilder
// 把 UI 的 GenParams 构造成 HappyHorse 合法请求体；并做参数/素材校验。
// PBT 重点单元（PBT-02 往返 / PBT-03 不变量 / PBT-07 生成器）。

import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import type { Capability, GenParams, MediaInput, ValidationResult } from '@shared/types';
import {
  MODEL_BY_CAPABILITY,
  DEFAULT_RESOLUTION,
  DURATION_MIN,
  DURATION_MAX,
  DURATION_DEFAULT,
  WATERMARK_DEFAULT,
  MAX_FILE_BYTES,
  IMAGE_MIME_BY_EXT,
  VIDEO_MIME_BY_EXT,
  R2V_MIN_IMAGES,
  R2V_MAX_IMAGES,
  RATIOS_BY_CAPABILITY
} from '@shared/capabilities';

/** HappyHorse 请求体结构 */
export interface RequestBody {
  model: string;
  input: {
    prompt?: string;
    media?: Array<{ type: string; url: string }>;
  };
  parameters?: {
    resolution?: string;
    ratio?: string;
    duration?: number;
    watermark?: boolean;
    seed?: number;
  };
}

export class RequestBuilder {
  /** 应用各能力默认值（幂等：再次应用不改变已显式设定的值） */
  applyDefaults(params: GenParams): GenParams {
    const next: GenParams = { ...params };
    next.resolution = next.resolution ?? DEFAULT_RESOLUTION[params.capability];
    next.duration = next.duration ?? DURATION_DEFAULT;
    next.watermark = next.watermark ?? WATERMARK_DEFAULT;
    // ratio 仅对支持的能力填默认（首项）
    const ratios = RATIOS_BY_CAPABILITY[params.capability];
    if (ratios.length > 0) next.ratio = next.ratio ?? ratios[0];
    return next;
  }

  /**
   * 校验参数与素材约束（不读取文件内容，只看元数据/路径）。
   * 返回所有错误，不在首个错误即中断，便于 UI 一次性展示。
   */
  validate(params: GenParams): ValidationResult {
    const errors: string[] = [];
    const { capability } = params;

    // duration 范围
    if (params.duration != null && (params.duration < DURATION_MIN || params.duration > DURATION_MAX)) {
      errors.push(`duration 必须在 ${DURATION_MIN}-${DURATION_MAX} 之间 / duration must be ${DURATION_MIN}-${DURATION_MAX}`);
    }

    // prompt 必选性
    if ((capability === 't2v' || capability === 'r2v' || capability === 'video-edit') && !params.prompt?.trim()) {
      errors.push('prompt 不能为空 / prompt is required');
    }

    // 素材约束
    const media = params.media ?? [];
    if (capability === 't2v') {
      if (media.length > 0) errors.push('t2v 不接受媒体素材 / t2v takes no media');
    } else if (capability === 'i2v') {
      const frames = media.filter((m) => m.type === 'first_frame');
      if (frames.length !== 1) errors.push('i2v 必须且仅含 1 张首帧图 / i2v requires exactly 1 first_frame');
      this.#checkFiles(frames, 'image', errors);
    } else if (capability === 'r2v') {
      const refs = media.filter((m) => m.type === 'reference_image');
      if (refs.length < R2V_MIN_IMAGES || refs.length > R2V_MAX_IMAGES) {
        errors.push(`r2v 参考图需 ${R2V_MIN_IMAGES}-${R2V_MAX_IMAGES} 张 / r2v needs ${R2V_MIN_IMAGES}-${R2V_MAX_IMAGES} images`);
      }
      this.#checkFiles(refs, 'image', errors);
    } else if (capability === 'video-edit') {
      const videos = media.filter((m) => m.type === 'video');
      if (videos.length !== 1) errors.push('video-edit 必须含 1 个输入视频 / video-edit requires 1 video');
      this.#checkFiles(videos, 'video', errors);
      this.#checkFiles(media.filter((m) => m.type === 'reference_image'), 'image', errors);
    }

    return { ok: errors.length === 0, errors };
  }

  #checkFiles(items: MediaInput[], kind: 'image' | 'video', errors: string[]): void {
    const mimeTable = kind === 'image' ? IMAGE_MIME_BY_EXT : VIDEO_MIME_BY_EXT;
    for (const m of items) {
      if (m.source.kind !== 'file') continue; // URL 由服务端校验
      const ext = extname(m.source.path).toLowerCase();
      if (!mimeTable[ext]) {
        errors.push(`不支持的格式 ${ext} / unsupported format ${ext}`);
        continue;
      }
      try {
        const size = statSync(m.source.path).size;
        if (size > MAX_FILE_BYTES) errors.push(`文件超过 20MB: ${m.source.path}`);
      } catch {
        errors.push(`找不到文件 / file not found: ${m.source.path}`);
      }
    }
  }

  /** 本地文件 → data URI（main 内读取，避免明文素材经 renderer 转发） */
  toDataUri(filePath: string): string {
    const ext = extname(filePath).toLowerCase();
    const mime = IMAGE_MIME_BY_EXT[ext] ?? VIDEO_MIME_BY_EXT[ext];
    if (!mime) throw new Error(`unsupported media ext: ${ext}`);
    const b64 = readFileSync(filePath).toString('base64');
    return `data:${mime};base64,${b64}`;
  }

  /**
   * 构造请求体。media 的 file 源在此转 data URI（除非传入 resolveMedia 跳过，用于纯逻辑测试）。
   * resolveMedia=false 时，file 源以占位 url 输出（PBT 往返测试不触碰磁盘）。
   */
  build(rawParams: GenParams, resolveMedia = true): RequestBody {
    const params = this.applyDefaults(rawParams);
    const model = MODEL_BY_CAPABILITY[params.capability];

    const input: RequestBody['input'] = {};
    if (params.prompt) input.prompt = params.prompt;
    if (params.media && params.media.length > 0) {
      input.media = params.media.map((m) => ({
        type: m.type,
        url:
          m.source.kind === 'url'
            ? m.source.url
            : resolveMedia
              ? this.toDataUri(m.source.path)
              : `file://${m.source.path}` // 占位，仅测试路径
      }));
    }

    const parameters: RequestBody['parameters'] = {};
    if (params.resolution) parameters.resolution = params.resolution;
    if (params.ratio) parameters.ratio = params.ratio;
    if (params.duration != null) parameters.duration = params.duration;
    if (params.watermark != null) parameters.watermark = params.watermark;
    if (params.seed != null) parameters.seed = params.seed;

    const body: RequestBody = { model, input };
    if (Object.keys(parameters).length > 0) body.parameters = parameters;
    return body;
  }

  /** 从请求体反推关键参数（PBT-02 往返测试用） */
  extractParams(body: RequestBody): Pick<GenParams, 'capability' | 'prompt' | 'resolution' | 'ratio' | 'duration' | 'watermark' | 'seed'> {
    const capability = (Object.keys(MODEL_BY_CAPABILITY) as Capability[]).find(
      (c) => MODEL_BY_CAPABILITY[c] === body.model
    )!;
    return {
      capability,
      prompt: body.input.prompt,
      resolution: body.parameters?.resolution as GenParams['resolution'],
      ratio: body.parameters?.ratio,
      duration: body.parameters?.duration,
      watermark: body.parameters?.watermark,
      seed: body.parameters?.seed
    };
  }
}
