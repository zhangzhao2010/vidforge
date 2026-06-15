// 共享的 IPC 通道名常量，main 与 preload 共用，避免字符串漂移。

export const IPC = {
  // invoke/handle 命令
  TASK_SUBMIT: 'task:submit',
  TASK_CANCEL: 'task:cancel',
  TASK_RETRY: 'task:retry',
  TASK_LIST: 'task:list',
  HISTORY_LIST: 'history:list',
  HISTORY_REGENERATE: 'history:regenerate',
  HISTORY_OPEN_FOLDER: 'history:openFolder',
  HISTORY_RETRY_DOWNLOAD: 'history:retryDownload',
  CONFIG_GET: 'config:get',
  CONFIG_UPDATE: 'config:update',
  PROFILE_SET_KEY: 'profile:setKey',
  PROFILE_HAS_KEY: 'profile:hasKey',
  PROFILE_LIST: 'profile:list',
  PROFILE_UPSERT: 'profile:upsert',
  PROFILE_DELETE: 'profile:delete',
  PROFILE_SET_ACTIVE: 'profile:setActive',
  PICK_FILES: 'dialog:pickFiles',
  // main → renderer 事件
  EVT_TASK_UPDATED: 'task-updated'
} as const;
