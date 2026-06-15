// 真实浏览器测试夹具：用系统 google-chrome-stable（headless）+ CDP 加载已 build 的 renderer，
// 注入 window.vidforge 桩（实机由 preload 提供），驱动交互并测量真实布局。
//
// 为什么不用 jsdom：jsdom 不做布局计算（flex 折行 / overflow 裁切都不会发生），
// 因此抓不住「窗口变窄时右列折行到可视区外」这类布局 bug。只有真实排版引擎能复现。
// 详见 memory env-gotchas #4/#6：此机系统 chrome 可跑，Playwright 自带 chromium 缺 libatk 跑不起来。

import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const RENDERER_DIR = join(__dirname, '../../out/renderer');
const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml'
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** window.vidforge 桩：预置一个 t2v 任务，所有 IPC 返回安全空值。注入到文档创建前。 */
export const VIDFORGE_STUB = `(function(){
  const now=new Date().toISOString();
  const cfg={activeProfileId:null,downloadDir:'/tmp',language:'zh',defaults:{resolution:'1080P',duration:5,watermark:true}};
  const task={id:'task-1',name:'unnamed::task-1',capability:'t2v',createdAt:now,updatedAt:now};
  const noop=async()=>{}; const arr=async()=>[];
  window.vidforge={
    createTask:async(c,n)=>({id:'task-1',name:n||'unnamed::task-1',capability:c,createdAt:now,updatedAt:now}),
    listTaskContainers:async()=>[task], deleteTask:noop, renameTask:noop,
    submitGeneration:async()=>({localId:'g1'}),
    listGenerationsByTask:arr, listAllGenerations:arr,
    cancelGeneration:noop, retryGeneration:noop, openInFolder:noop,
    getConfig:async()=>cfg, updateConfig:async()=>cfg,
    listProfiles:arr, upsertProfile:async()=>({}), deleteProfile:noop,
    setActiveProfile:noop, setKey:noop, hasKey:async()=>false, pickFiles:arr,
    onGenerationUpdate:()=>()=>{}, onTaskListUpdate:()=>()=>{}
  };
})();`;

interface CdpClient {
  send: (method: string, params?: Record<string, unknown>) => Promise<any>;
  /** 在页面上下文求值并按值返回 */
  evaluate: <T = unknown>(expression: string) => Promise<T>;
  close: () => void;
}

/** 启动一个静态 HTTP 服务托管 out/renderer（file:// 会被 CORS 拦截 ES module，故走 http）。 */
function startStaticServer(port: number): Promise<http.Server> {
  const srv = http.createServer(async (req, res) => {
    try {
      let p = (req.url ?? '/').split('?')[0];
      if (p === '/') p = '/index.html';
      const buf = await readFile(join(RENDERER_DIR, p));
      res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' });
      res.end(buf);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  return new Promise((resolve) => srv.listen(port, () => resolve(srv)));
}

function getJSON(port: number, path: string): Promise<any> {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path }, (r) => {
        let d = '';
        r.on('data', (c) => (d += c));
        r.on('end', () => resolve(JSON.parse(d)));
      })
      .on('error', reject);
  });
}

async function connectCdp(debugPort: number): Promise<CdpClient> {
  let tabs: any[] = [];
  for (let i = 0; i < 60; i++) {
    try {
      tabs = await getJSON(debugPort, '/json');
      if (tabs.length) break;
    } catch {
      /* devtools 端点尚未就绪 */
    }
    await sleep(150);
  }
  const page = tabs.find((t) => t.type === 'page');
  if (!page) throw new Error('CDP: 找不到 page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise<void>((r) => ws.addEventListener('open', () => r(), { once: true }));

  let id = 0;
  const pending = new Map<number, (m: any) => void>();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data as string);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)!(m);
      pending.delete(m.id);
    }
  });
  const send = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<any>((resolve) => {
      const i = ++id;
      pending.set(i, resolve);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const evaluate = async <T,>(expression: string): Promise<T> => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) {
      throw new Error('页面求值异常: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    }
    return r.result.result.value as T;
  };
  return { send, evaluate, close: () => ws.close() };
}

export interface RenderedPage {
  cdp: CdpClient;
  /** 在页面上下文求值 */
  evaluate: <T = unknown>(expression: string) => Promise<T>;
  dispose: () => Promise<void>;
}

/**
 * 在指定窗口宽度下加载已 build 的 renderer，注入 vidforge 桩，等待 React 挂载完成。
 * 调用方负责后续交互与测量，结束后调用 dispose()。
 */
export async function renderApp(opts: { width: number; height?: number }): Promise<RenderedPage> {
  const height = opts.height ?? 800;
  const httpPort = 8090 + (opts.width % 100); // 按宽度错开端口，便于并发
  const debugPort = 9300 + (opts.width % 100);

  const server = await startStaticServer(httpPort);
  const chrome: ChildProcess = spawn(
    'google-chrome-stable',
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      `--remote-debugging-port=${debugPort}`,
      `--window-size=${opts.width},${height}`,
      'about:blank'
    ],
    { stdio: 'ignore' }
  );

  const cdp = await connectCdp(debugPort);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: VIDFORGE_STUB });
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${httpPort}/index.html` });

  // 轮询等待 React 挂载（AppShell 渲染出 Sider）
  for (let i = 0; i < 40; i++) {
    const ready = await cdp.evaluate<boolean>(
      `!!document.querySelector('.ant-layout-sider')`
    );
    if (ready) break;
    await sleep(150);
  }

  const dispose = async () => {
    cdp.close();
    chrome.kill('SIGKILL');
    await new Promise<void>((r) => server.close(() => r()));
    await sleep(100);
  };

  return { cdp, evaluate: cdp.evaluate, dispose };
}

/** 点击左侧导航里第一个真实任务项（跳过分组标题与空占位）。返回点中的文本。 */
export const CLICK_FIRST_TASK = `(function(){
  const items=[...document.querySelectorAll('.ant-menu-item')];
  const target=items.find(e=>/未命名|unnamed|文生|图生|参考|视频/.test(e.textContent))||items.find(e=>!/设置|暂无|没有/.test(e.textContent));
  if(!target) return 'NO_TASK_ITEM:'+items.map(e=>e.textContent.slice(0,10)).join('|');
  target.click();
  return 'clicked:'+target.textContent.trim().slice(0,30);
})();`;

/** 测量详情页左右两列的矩形与「右列是否折行 / 是否在可视区内」。 */
export const MEASURE_COLUMNS = `(function(){
  const vw=innerWidth, vh=innerHeight;
  const findCol=(title)=>{
    for(const h of document.querySelectorAll('.ant-card-head-title')){
      if(h.textContent.includes(title)) return h.closest('.ant-col');
    }
    return null;
  };
  const rect=(el)=>{
    if(!el) return null;
    const b=el.getBoundingClientRect();
    return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height),
      onscreen: b.width>0 && b.height>0 && b.x<vw && b.y<vh && b.right>0 && b.bottom>0};
  };
  const L=rect(findCol('生成配置')), R=rect(findCol('生成结果'));
  return JSON.stringify({
    vw, vh,
    L, R,
    wrapped: !!(L&&R) && R.y > L.y + 5,          // 右列被挤到下一行
    rightOnScreen: !!R && R.onscreen,
    both: !!L && !!R
  });
})();`;

export interface ColumnLayout {
  vw: number;
  vh: number;
  L: { x: number; y: number; w: number; h: number; onscreen: boolean } | null;
  R: { x: number; y: number; w: number; h: number; onscreen: boolean } | null;
  wrapped: boolean;
  rightOnScreen: boolean;
  both: boolean;
}
