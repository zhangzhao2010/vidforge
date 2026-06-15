// PBT：deriveTaskName 任务命名派生的不变量。
// 规则：有非空 prompt → 返回单行、长度受限的名字；空白/缺省 → 返回 null（调用方用占位名）。

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { deriveTaskName, TASK_NAME_MAX_LEN } from '../../src/shared/capabilities';

describe('deriveTaskName (PBT)', () => {
  it('空白或缺省 prompt 返回 null', () => {
    fc.assert(
      fc.property(fc.constantFrom(undefined, '', '   ', '\n\t '), (p) => {
        expect(deriveTaskName(p as string | undefined)).toBeNull();
      })
    );
  });

  it('非空 prompt 返回非空、单行、长度 <= MAX+1（含省略号）的名字', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0), (prompt) => {
        const name = deriveTaskName(prompt);
        expect(name).not.toBeNull();
        expect(name!.length).toBeGreaterThan(0);
        expect(name).not.toContain('\n');
        // 截断后长度不超过上限+省略号
        expect(name!.length).toBeLessThanOrEqual(TASK_NAME_MAX_LEN + 1);
      })
    );
  });

  it('超长 prompt 被截断并加省略号', () => {
    const long = 'a'.repeat(TASK_NAME_MAX_LEN + 50);
    const name = deriveTaskName(long)!;
    expect(name.endsWith('…')).toBe(true);
    expect(name.length).toBe(TASK_NAME_MAX_LEN + 1);
  });

  it('短 prompt 原样保留（去除首尾空白后）', () => {
    expect(deriveTaskName('  hello  ')).toBe('hello');
  });
});
