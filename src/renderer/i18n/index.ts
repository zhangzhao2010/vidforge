// renderer — i18n（中英双语，Q10=C）

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const zh = {
  translation: {
    'app.title': 'VidForge',
    'nav.create': '创建',
    'nav.tasks': '任务',
    'nav.history': '历史',
    'nav.settings': '设置',
    'cap.t2v': '文生视频',
    'cap.i2v': '图生视频',
    'cap.r2v': '参考生视频',
    'cap.video-edit': '视频编辑',
    'field.prompt': '提示词',
    'field.resolution': '分辨率',
    'field.ratio': '宽高比',
    'field.duration': '时长（秒）',
    'field.watermark': '水印',
    'field.seed': '随机种子',
    'btn.submit': '提交生成',
    'btn.pickImage': '选择图片',
    'btn.pickImages': '选择参考图（1-9）',
    'btn.pickVideo': '选择视频',
    'btn.cancel': '取消',
    'btn.retry': '重试',
    'btn.regenerate': '重新生成',
    'btn.openFolder': '打开所在文件夹',
    'btn.save': '保存',
    'btn.addProfile': '新增配置',
    'settings.apiKey': 'API Key',
    'settings.region': '地域',
    'settings.baseUrl': '自定义 baseURL（可选）',
    'settings.downloadDir': '下载目录',
    'settings.language': '语言',
    'settings.profiles': 'API 配置档',
    'settings.active': '当前激活',
    'status.title': '状态',
    'history.empty': '暂无历史记录',
    'tasks.empty': '暂无任务',
    'msg.submitted': '任务已提交',
    'msg.keySaved': '已保存到系统密钥链',
    'error.unknown': '未知错误',
    'error.config.noActiveProfile': '请先在设置中添加并激活一个 API Key 配置',
    'error.config.missingKey': '当前配置缺少 API Key',
    'error.config.missingBaseUrl': '自定义地域需要填写 baseURL',
    'error.validation.failed': '参数校验失败',
    'error.task.expired': '任务已超过 24 小时有效期',
    'error.download.failed': '视频下载失败',
    'error.network.error': '网络错误，请重试'
  }
};

const en = {
  translation: {
    'app.title': 'VidForge',
    'nav.create': 'Create',
    'nav.tasks': 'Tasks',
    'nav.history': 'History',
    'nav.settings': 'Settings',
    'cap.t2v': 'Text to Video',
    'cap.i2v': 'Image to Video',
    'cap.r2v': 'Reference to Video',
    'cap.video-edit': 'Video Edit',
    'field.prompt': 'Prompt',
    'field.resolution': 'Resolution',
    'field.ratio': 'Aspect Ratio',
    'field.duration': 'Duration (s)',
    'field.watermark': 'Watermark',
    'field.seed': 'Seed',
    'btn.submit': 'Generate',
    'btn.pickImage': 'Pick Image',
    'btn.pickImages': 'Pick References (1-9)',
    'btn.pickVideo': 'Pick Video',
    'btn.cancel': 'Cancel',
    'btn.retry': 'Retry',
    'btn.regenerate': 'Regenerate',
    'btn.openFolder': 'Open Folder',
    'btn.save': 'Save',
    'btn.addProfile': 'Add Profile',
    'settings.apiKey': 'API Key',
    'settings.region': 'Region',
    'settings.baseUrl': 'Custom baseURL (optional)',
    'settings.downloadDir': 'Download Folder',
    'settings.language': 'Language',
    'settings.profiles': 'API Profiles',
    'settings.active': 'Active',
    'status.title': 'Status',
    'history.empty': 'No history yet',
    'tasks.empty': 'No tasks',
    'msg.submitted': 'Task submitted',
    'msg.keySaved': 'Saved to OS keychain',
    'error.unknown': 'Unknown error',
    'error.config.noActiveProfile': 'Add and activate an API Key profile in Settings first',
    'error.config.missingKey': 'Active profile is missing an API Key',
    'error.config.missingBaseUrl': 'Custom region requires a baseURL',
    'error.validation.failed': 'Parameter validation failed',
    'error.task.expired': 'Task expired (24h limit)',
    'error.download.failed': 'Video download failed',
    'error.network.error': 'Network error, please retry'
  }
};

export function initI18n(lang: 'zh' | 'en') {
  void i18n.use(initReactI18next).init({
    resources: { zh, en },
    lng: lang,
    fallbackLng: 'zh',
    interpolation: { escapeValue: false }
  });
  return i18n;
}

export default i18n;
