// 共享的 IPC 通道名常量，main 与 preload 共用，避免字符串漂移。

export const IPC = {
  // ---- 任务（容器）命令 ----
  TASK_CREATE: 'task:create', // 新建任务容器（选定 capability）
  TASK_CONTAINER_LIST: 'task:listContainers', // 列出全部任务容器
  TASK_DELETE: 'task:delete', // 删除任务容器及其全部生成
  TASK_RENAME: 'task:rename', // 手动重命名任务

  // ---- 生成（单次运行）命令 ----
  GENERATION_SUBMIT: 'generation:submit', // 在某任务下提交一次生成
  GENERATION_LIST_BY_TASK: 'generation:listByTask', // 列出某任务的全部生成
  GENERATION_LIST_ALL: 'generation:listAll', // 列出全部生成（用于全局 active 判定/恢复）
  GENERATION_CANCEL: 'generation:cancel',
  GENERATION_RETRY: 'generation:retry',
  GENERATION_OPEN_FOLDER: 'generation:openFolder', // 在文件管理器中定位结果视频

  // ---- 配置 / Profile ----
  CONFIG_GET: 'config:get',
  CONFIG_UPDATE: 'config:update',
  PROFILE_SET_KEY: 'profile:setKey',
  PROFILE_HAS_KEY: 'profile:hasKey',
  PROFILE_LIST: 'profile:list',
  PROFILE_UPSERT: 'profile:upsert',
  PROFILE_DELETE: 'profile:delete',
  PROFILE_SET_ACTIVE: 'profile:setActive',
  PICK_FILES: 'dialog:pickFiles',
  READ_IMAGE_DATA_URL: 'media:readImageDataUrl', // 把本地图片读成 data URL，供表单 <img> 预览（含未提交的原始路径）
  STAT_FILE_SIZE: 'fs:statFileSize', // 读取本地文件字节数，供表单在选择素材后前置校验大小（找不到/出错返回 null）

  // ---- main → renderer 事件 ----
  EVT_GENERATION_UPDATED: 'generation-updated', // 单条生成状态变更
  EVT_TASK_LIST_UPDATED: 'task-list-updated' // 任务容器列表变更（新建/改名/删除）
} as const;
