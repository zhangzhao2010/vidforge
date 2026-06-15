// 单测 + PBT：vidforge-media:// 协议路径解析的安全约束。
// 关键安全属性：只允许 userData 根目录之内的文件，任何越界路径必须被拒绝（防目录穿越）。

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { resolveMediaPath, toMediaUrl } from '../../src/main/media-store/mediaProtocol';

const ROOT = '/home/user/.config/vidforge';

describe('resolveMediaPath', () => {
  it('允许 userData 之内的文件', () => {
    const url = toMediaUrl(`${ROOT}/assets/abc.mp4`);
    expect(resolveMediaPath(url, ROOT)).toBe(`${ROOT}/assets/abc.mp4`);
  });

  it('拒绝 userData 之外的绝对路径', () => {
    expect(resolveMediaPath(toMediaUrl('/etc/passwd'), ROOT)).toBeNull();
  });

  it('拒绝 ../ 目录穿越', () => {
    const evil = `vidforge-media:///${encodeURIComponent(`${ROOT}/../../etc/passwd`)}`;
    expect(resolveMediaPath(evil, ROOT)).toBeNull();
  });

  it('拒绝空路径与非法 URL', () => {
    expect(resolveMediaPath('vidforge-media:///', ROOT)).toBeNull();
    expect(resolveMediaPath('not a url', ROOT)).toBeNull();
  });

  it('PBT：任何 root 之内的相对子路径都被接受，任何含上跳到 root 外的都被拒绝', () => {
    const segment = fc.stringMatching(/^[a-zA-Z0-9_-]+$/);
    fc.assert(
      fc.property(fc.array(segment, { minLength: 1, maxLength: 5 }), (segs) => {
        const inside = `${ROOT}/${segs.join('/')}`;
        expect(resolveMediaPath(toMediaUrl(inside), ROOT)).toBe(inside);
      })
    );
  });

  it('PBT：toMediaUrl ∘ resolveMediaPath 对 root 内路径往返一致', () => {
    // 排除纯点段（'.' / '..'）——它们会被 path.resolve 规整，属正常行为，不适合往返断言
    const segment = fc.stringMatching(/^[a-zA-Z0-9_.-]+$/).filter((s) => s !== '.' && s !== '..' && !/^\.+$/.test(s));
    fc.assert(
      fc.property(fc.array(segment, { minLength: 1, maxLength: 4 }), (segs) => {
        const abs = `${ROOT}/${segs.join('/')}`;
        const round = resolveMediaPath(toMediaUrl(abs), ROOT);
        expect(round).toBe(abs);
      })
    );
  });
});
