// 回归测试（真实浏览器布局）：任务详情页左右两列在窄窗口下不得折行。
//
// 历史 bug（2026-06-15）：<Row> 用 antd 默认 flex-flow:row wrap，左列 flex:0 0 380px 不缩，
// 窗口 <~1130px 时右列折到第二行；父 Content overflow:hidden + 100vh 固定 → 右列被裁到屏幕外，
// 表现为「只有左表单，右侧生成结果整块消失」。修复：<Row wrap={false}> + 右列 minWidth:0。
//
// 必须用真实 Chrome：jsdom 不算布局，折行不会发生，抓不住此类 bug。

import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  renderApp,
  CLICK_FIRST_TASK,
  MEASURE_COLUMNS,
  type ColumnLayout
} from './chromeHarness';

const ROOT = join(__dirname, '../..');

// 检测系统 chrome 是否可用；缺失则跳过（CI 无 chrome 时不误报失败）
function chromeAvailable(): boolean {
  try {
    execFileSync('google-chrome-stable', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const HAS_CHROME = chromeAvailable();
const describeIfChrome = HAS_CHROME ? describe : describe.skip;

describeIfChrome('任务详情页布局（真实浏览器）', () => {
  beforeAll(() => {
    // 测试依赖 build 产物；缺失则现 build（约 3s）
    if (!existsSync(join(ROOT, 'out/renderer/index.html'))) {
      execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' });
    }
  }, 120_000);

  // 1200=实机默认宽度；900=BrowserWindow.minWidth（最窄合法宽度）
  for (const width of [1200, 900]) {
    it(`@${width}px：右列与左列同行、不折行、在可视区内`, async () => {
      const page = await renderApp({ width });
      try {
        const clickResult = await page.evaluate<string>(CLICK_FIRST_TASK);
        expect(clickResult, `导航点击结果: ${clickResult}`).toContain('clicked:');

        // 等一帧让详情页渲染
        await page.evaluate('new Promise(r=>requestAnimationFrame(()=>r(1)))');

        const layout = JSON.parse(await page.evaluate<string>(MEASURE_COLUMNS)) as ColumnLayout;

        expect(layout.both, `左右两列都应渲染: ${JSON.stringify(layout)}`).toBe(true);
        expect(layout.wrapped, `右列不应折行到第二行: ${JSON.stringify(layout)}`).toBe(false);
        expect(layout.rightOnScreen, `右列应在可视区内: ${JSON.stringify(layout)}`).toBe(true);
        // 同行：右列 y 与左列 y 基本一致
        expect(Math.abs((layout.R!.y) - (layout.L!.y))).toBeLessThan(5);
      } finally {
        await page.dispose();
      }
    }, 30_000);
  }
});
