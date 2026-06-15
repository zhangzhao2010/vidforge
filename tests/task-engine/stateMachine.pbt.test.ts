// PBT for U3 task-engine — 状态机
// 强制规则：PBT-03（不变量）、PBT-07（生成器）、PBT-08（shrinking/seed）。

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { TRANSITIONS, canTransition, assertTransition, isTerminal, IllegalTransitionError } from '../../src/main/task-engine/stateMachine';
import type { TaskStatus } from '../../src/shared/types';

const ALL_STATES = Object.keys(TRANSITIONS) as TaskStatus[];
const statusArb = fc.constantFrom<TaskStatus>(...ALL_STATES);

describe('task state machine (PBT)', () => {
  it('PBT-03 不变量：终态没有任何出边', () => {
    fc.assert(
      fc.property(statusArb, (s) => {
        if (isTerminal(s)) expect(TRANSITIONS[s].length).toBe(0);
      })
    );
  });

  it('PBT-03 不变量：canTransition 与 assertTransition 行为一致', () => {
    fc.assert(
      fc.property(statusArb, statusArb, (from, to) => {
        if (canTransition(from, to)) {
          expect(() => assertTransition(from, to)).not.toThrow();
        } else {
          expect(() => assertTransition(from, to)).toThrowError(IllegalTransitionError);
        }
      })
    );
  });

  it('PBT-03 不变量：任何合法转移的目标都是已知状态', () => {
    fc.assert(
      fc.property(statusArb, (from) => {
        for (const to of TRANSITIONS[from]) {
          expect(ALL_STATES).toContain(to);
        }
      })
    );
  });

  it('不存在自环（无状态可转移到自身）', () => {
    for (const s of ALL_STATES) {
      expect(canTransition(s, s)).toBe(false);
    }
  });
});
