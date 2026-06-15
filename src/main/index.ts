// main 进程入口：创建窗口、装配各单元、注册 IPC、启动恢复。

import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';

import { Persistence } from './task-engine/Persistence';
import { ConfigManager } from './core-config/ConfigManager';
import { KeyVault } from './core-config/KeyVault';
import { HappyHorseClient } from './api-client/HappyHorseClient';
import { RequestBuilder } from './api-client/RequestBuilder';
import { Poller } from './task-engine/Poller';
import { TaskEngine } from './task-engine/TaskEngine';
import { MediaStore } from './media-store/MediaStore';
import { Services } from './task-engine/services';
import { IpcGateway } from './task-engine/IpcGateway';

let mainWindow: BrowserWindow | null = null;
let persistence: Persistence | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 640,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // 安全边界（Q-A1=A）：禁用 nodeIntegration，开启 contextIsolation/sandbox
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.on('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // electron-vite: 开发期加载 dev server，生产期加载打包 html
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function bootstrap(): void {
  // 数据库放 userData 目录
  const dbPath = join(app.getPath('userData'), 'vidforge.db');
  persistence = new Persistence(dbPath);

  // 装配各单元（自底向上）
  const config = new ConfigManager(persistence);
  const keyVault = new KeyVault();
  const client = new HappyHorseClient();
  const builder = new RequestBuilder();
  // Poller 与 TaskEngine 互相依赖：先用占位回调建 Poller，建好 engine 后再绑定。
  const poller = new Poller((localId) => engine.pollOnce(localId));
  const engine: TaskEngine = new TaskEngine(persistence, poller, config, keyVault, client, builder);
  const media = new MediaStore(persistence, config);
  engine.setDownloadFn((task) => media.download(task));

  const services = new Services(config, keyVault, engine, persistence, media);
  const gateway = new IpcGateway(services, engine, () => mainWindow);
  gateway.register();

  // 启动恢复未完成任务
  void engine.recoverOnStartup();
}

app.whenReady().then(() => {
  bootstrap();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    persistence?.close();
    app.quit();
  }
});
