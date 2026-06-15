// 跨进程共享的类型定义。renderer 仅引用类型（type-only import），不引用 main 实现。

/** HappyHorse 四种生成能力 */
export type Capability = 't2v' | 'i2v' | 'r2v' | 'video-edit';

/** 调用地域。custom 表示用户自填完整 baseURL（如新加坡/法兰克福需 WorkspaceId 的域名） */
export type Region = 'cn-beijing' | 'ap-southeast-1' | 'us-east-1' | 'eu-central-1' | 'custom';

/** 支持的视频分辨率档位 */
export type Resolution = '720P' | '1080P';

/** 任务状态机的状态集合 */
export type TaskStatus =
  | 'QUEUED' // 已入队，尚未提交
  | 'SUBMITTING' // 正在调用提交接口
  | 'PENDING' // 已获 task_id，排队中
  | 'RUNNING' // 处理中
  | 'SUCCEEDED' // 生成成功（可能仍在下载）
  | 'DOWNLOADING' // 视频下载中
  | 'COMPLETED' // 成功且已下载落盘
  | 'FAILED' // 失败（可重试）
  | 'EXPIRED' // 超 24h，task_id/video_url 失效
  | 'CANCELLED'; // 用户取消

/** 媒体素材输入。文件以路径传入（renderer→main），main 内读取并转 Base64 */
export interface MediaInput {
  /** first_frame=i2v 首帧；reference_image=r2v 参考图；video=video-edit 输入视频 */
  type: 'first_frame' | 'reference_image' | 'video';
  source: { kind: 'file'; path: string } | { kind: 'url'; url: string };
}

/** 一次视频生成请求的参数（UI 收集，传给 main） */
export interface GenParams {
  capability: Capability;
  prompt?: string;
  media?: MediaInput[];
  resolution?: Resolution;
  ratio?: string; // '16:9' | '9:16' | '1:1' | ...
  duration?: number; // 3-15 秒
  watermark?: boolean;
  seed?: number;
}

/** 配置档：一组「API Key + region + 可选自定义 baseURL」。Key 本身不在此结构，存 OS 密钥链 */
export interface Profile {
  id: string;
  name: string;
  region: Region;
  baseUrl?: string; // 自定义 baseURL，优先级高于 region 内置端点
}

/** 应用级配置（非敏感，存 SQLite） */
export interface AppConfig {
  activeProfileId: string | null;
  downloadDir: string;
  language: 'zh' | 'en';
  defaults: {
    resolution: Resolution;
    duration: number;
    watermark: boolean;
  };
}

/** 任务记录（持久化到 SQLite） */
export interface TaskRecord {
  localId: string; // 客户端生成的本地 ID
  taskId?: string; // HappyHorse 返回的 task_id
  status: TaskStatus;
  params: GenParams;
  profileId: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  videoUrl?: string; // 成功后的远端 URL（24h 有效）
  localVideoPath?: string; // 下载落盘后的本地路径
  errorCode?: string;
  errorMessage?: string;
}

/** 生成历史项 */
export interface HistoryItem {
  id: string;
  localId: string;
  capability: Capability;
  prompt?: string;
  params: GenParams;
  localVideoPath: string;
  thumbnailPath?: string;
  createdAt: string;
}

/** 参数校验结果 */
export interface ValidationResult {
  ok: boolean;
  errors: string[]; // 错误信息键（i18n key）或可读文案
}

/** 任务查询的归一化结果（HappyHorseClient.query 输出） */
export interface TaskQueryResult {
  taskId: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
  videoUrl?: string;
  errorCode?: string;
  errorMessage?: string;
}

/** main 内部使用的鉴权上下文（绝不外传 renderer） */
export interface AuthContext {
  apiKey: string;
  endpoint: string; // 完整提交端点 URL
}
