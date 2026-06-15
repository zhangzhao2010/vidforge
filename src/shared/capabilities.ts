// 四种能力的 model 名、默认参数、素材与参数约束常量。
// 来源：阿里云百炼 HappyHorse API 文档（t2v / i2v / r2v / video-edit）。

import type { Capability, Region, Resolution } from './types';

/** capability → HappyHorse model 名 */
export const MODEL_BY_CAPABILITY: Record<Capability, string> = {
  t2v: 'happyhorse-1.0-t2v',
  i2v: 'happyhorse-1.0-i2v',
  r2v: 'happyhorse-1.0-r2v',
  'video-edit': 'happyhorse-1.0-video-edit'
};

/** region → 默认提交端点（host 部分）。
 *  注：ap-southeast-1 / eu-central-1 实际需 {WorkspaceId}.<region>.maas.aliyuncs.com，
 *  第一版引导用户对这些 region 用 custom baseURL 填完整域名（见 core-config）。 */
export const ENDPOINT_BY_REGION: Record<Exclude<Region, 'custom'>, string> = {
  'cn-beijing': 'https://dashscope.aliyuncs.com',
  'ap-southeast-1': 'https://dashscope-intl.aliyuncs.com', // 旧域名，建议 custom 覆盖
  'us-east-1': 'https://dashscope-us.aliyuncs.com',
  'eu-central-1': 'https://dashscope.aliyuncs.com' // 占位，建议 custom 覆盖
};

/** 提交任务的路径（四能力共用） */
export const SUBMIT_PATH = '/api/v1/services/aigc/video-generation/video-synthesis';
/** 查询任务结果的路径模板 */
export const TASK_PATH = (taskId: string) => `/api/v1/tasks/${taskId}`;

/** 各能力支持的宽高比（首项为默认值） */
export const RATIOS_BY_CAPABILITY: Record<Capability, string[]> = {
  t2v: ['16:9', '9:16', '1:1', '4:3', '3:4', '4:5', '5:4', '9:21', '21:9'],
  i2v: [], // i2v 输出宽高比近似输入首帧，不单独设 ratio
  r2v: ['16:9', '9:16', '3:4', '4:3', '4:5', '5:4', '1:1', '9:21', '21:9'],
  'video-edit': []
};

/** 各能力的默认分辨率（文档：t2v/i2v 默认 1080P；r2v 默认 1080P） */
export const DEFAULT_RESOLUTION: Record<Capability, Resolution> = {
  t2v: '1080P',
  i2v: '1080P',
  r2v: '1080P',
  'video-edit': '1080P'
};

/** 通用参数约束 */
export const DURATION_MIN = 3;
export const DURATION_MAX = 15;
export const DURATION_DEFAULT = 5;
export const WATERMARK_DEFAULT = true;

/** prompt 长度上限（非中文字符；中文约一半） */
export const PROMPT_MAX_NON_CJK = 5000;

/** 素材约束 */
export const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB
export const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
};
export const VIDEO_MIME_BY_EXT: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm'
};

/** r2v 参考图数量范围 */
export const R2V_MIN_IMAGES = 1;
export const R2V_MAX_IMAGES = 9;

/** 轮询参数 */
export const POLL_INTERVAL_MS = 15_000; // 文档建议 15s
export const TASK_TTL_MS = 24 * 60 * 60 * 1000; // task_id / video_url 24h 有效期

/** 任务名截断长度（取首次 prompt 前 N 字） */
export const TASK_NAME_MAX_LEN = 20;

/**
 * 由首次生成的 prompt 派生任务名；prompt 为空（如 i2v 可不填）时返回 null，
 * 调用方应改用占位名（i18n: task.unnamed）。纯函数，便于 PBT。
 */
export function deriveTaskName(prompt: string | undefined): string | null {
  const trimmed = prompt?.trim();
  if (!trimmed) return null;
  const oneLine = trimmed.replace(/\s+/g, ' ');
  return oneLine.length > TASK_NAME_MAX_LEN ? oneLine.slice(0, TASK_NAME_MAX_LEN) + '…' : oneLine;
}
