// U4 media-store — vidforge-media:// 协议
// renderer 在 sandbox+contextIsolation 下无法直接 file:// 加载本地视频/图片。
// 通过自定义协议把 userData 下的文件喂给 <video>/<img>，避免放开 webSecurity。
//
// URL 形如： vidforge-media:///<encoded-absolute-path>
// 仅允许位于 userData 根目录下的文件，防止目录穿越读任意磁盘文件。

import { resolve, relative, isAbsolute, sep } from 'node:path';

/**
 * 把请求 URL 解析为安全的本地文件绝对路径；非法/越界返回 null。
 * 纯函数，便于单测（不触碰 electron/fs）。
 * @param requestUrl   形如 'vidforge-media:///%2Fhome%2Fuser%2F...'
 * @param allowedRoots 允许访问的根目录；可传单个（userData）或多个（userData + 用户下载目录）。
 *                     只要 candidate 落在任一根之内即放行。
 */
export function resolveMediaPath(requestUrl: string, allowedRoots: string | string[]): string | null {
  let pathname: string;
  try {
    pathname = new URL(requestUrl).pathname;
  } catch {
    return null;
  }
  // 去掉前导斜杠并解码，得到原始绝对路径
  const decoded = decodeURIComponent(pathname.replace(/^\/+/, ''));
  if (!decoded) return null;

  const candidate = resolve(decoded);
  const roots = (Array.isArray(allowedRoots) ? allowedRoots : [allowedRoots]).map((r) => resolve(r));

  // 必须位于某个 root 之内（含 root 本身的子路径）。
  // 注意按路径段判断 '..'，不能用 startsWith('..') —— 否则会误杀 '..a' 这类合法文件名。
  const inside = roots.some((root) => {
    const rel = relative(root, candidate);
    const escapes = rel === '..' || rel.startsWith('..' + sep);
    return rel === '' || (!escapes && !isAbsolute(rel));
  });
  return inside ? candidate : null;
}

/** 把本地绝对路径编码成 vidforge-media:// URL，供 renderer <video>/<img> src 使用 */
export function toMediaUrl(absPath: string): string {
  return `vidforge-media:///${encodeURIComponent(absPath)}`;
}
