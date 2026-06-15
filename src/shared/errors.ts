// 统一错误类型与错误码 → 中英双语可读文案映射。

export class AppError extends Error {
  code: string;
  /** i18n 文案键，renderer 据此本地化展示 */
  messageKey: string;
  detail?: string;

  constructor(code: string, messageKey: string, detail?: string) {
    super(detail ?? messageKey);
    this.name = 'AppError';
    this.code = code;
    this.messageKey = messageKey;
    this.detail = detail;
  }
}

/** 常见错误码 → i18n 键。未知码回退到 'error.unknown'。 */
export const ERROR_KEY_BY_CODE: Record<string, string> = {
  // 客户端侧
  'config.noActiveProfile': 'error.config.noActiveProfile',
  'config.missingKey': 'error.config.missingKey',
  'config.missingBaseUrl': 'error.config.missingBaseUrl',
  'validation.failed': 'error.validation.failed',
  'file.tooLarge': 'error.file.tooLarge',
  'file.unsupportedFormat': 'error.file.unsupportedFormat',
  'file.notFound': 'error.file.notFound',
  'task.expired': 'error.task.expired',
  'download.failed': 'error.download.failed',
  'network.error': 'error.network.error',
  // 服务端常见（DashScope）
  InvalidApiKey: 'error.api.invalidApiKey',
  Throttling: 'error.api.throttling',
  'Throttling.RateQuota': 'error.api.throttling',
  InvalidParameter: 'error.api.invalidParameter',
  DataInspectionFailed: 'error.api.contentRejected'
};

export function errorKeyForCode(code: string | undefined): string {
  if (!code) return 'error.unknown';
  return ERROR_KEY_BY_CODE[code] ?? 'error.unknown';
}

/** 双语文案表（renderer i18n 也包含同样键；此表供 main 端日志/回退用） */
export const ERROR_TEXT: Record<string, { zh: string; en: string }> = {
  'error.unknown': { zh: '未知错误', en: 'Unknown error' },
  'error.config.noActiveProfile': { zh: '未选择配置档，请先在设置中添加并激活一个 API Key 配置', en: 'No active profile. Add and activate an API Key profile in Settings.' },
  'error.config.missingKey': { zh: '当前配置档缺少 API Key', en: 'Active profile is missing an API Key.' },
  'error.config.missingBaseUrl': { zh: '自定义地域需要填写 baseURL', en: 'Custom region requires a baseURL.' },
  'error.validation.failed': { zh: '参数校验失败', en: 'Parameter validation failed.' },
  'error.file.tooLarge': { zh: '文件超过 20MB 限制', en: 'File exceeds the 20MB limit.' },
  'error.file.unsupportedFormat': { zh: '不支持的文件格式', en: 'Unsupported file format.' },
  'error.file.notFound': { zh: '找不到文件', en: 'File not found.' },
  'error.task.expired': { zh: '任务已超过 24 小时有效期', en: 'Task expired (24h limit).' },
  'error.download.failed': { zh: '视频下载失败', en: 'Video download failed.' },
  'error.network.error': { zh: '网络错误，请重试', en: 'Network error, please retry.' },
  'error.api.invalidApiKey': { zh: 'API Key 无效', en: 'Invalid API Key.' },
  'error.api.throttling': { zh: '请求过于频繁，请稍后重试', en: 'Rate limited, please retry later.' },
  'error.api.invalidParameter': { zh: '请求参数不合法', en: 'Invalid request parameter.' },
  'error.api.contentRejected': { zh: '内容未通过审核', en: 'Content rejected by moderation.' }
};
