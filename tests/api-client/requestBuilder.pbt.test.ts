// PBT for U2 api-client — RequestBuilder
// 强制规则：PBT-02（往返）、PBT-03（不变量）、PBT-04（幂等，advisory）、PBT-07（生成器）、PBT-08（shrinking/seed）。

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { RequestBuilder } from '../../src/main/api-client/RequestBuilder';
import type { Capability, GenParams } from '../../src/shared/types';
import { MODEL_BY_CAPABILITY, DURATION_MIN, DURATION_MAX } from '../../src/shared/capabilities';

const rb = new RequestBuilder();

// 领域生成器（PBT-07）：合法 GenParams（无文件素材，便于纯逻辑往返）
const capabilityArb = fc.constantFrom<Capability>('t2v', 'i2v', 'r2v', 'video-edit');
const genParamsArb: fc.Arbitrary<GenParams> = fc.record(
  {
    capability: capabilityArb,
    prompt: fc.string({ minLength: 1, maxLength: 200 }),
    resolution: fc.constantFrom('720P' as const, '1080P' as const),
    ratio: fc.constantFrom('16:9', '9:16', '1:1'),
    duration: fc.integer({ min: DURATION_MIN, max: DURATION_MAX }),
    watermark: fc.boolean(),
    seed: fc.integer({ min: 0, max: 2_147_483_647 })
  },
  { requiredKeys: ['capability'] }
);

describe('RequestBuilder (PBT)', () => {
  it('PBT-02 往返：build → extractParams 保持关键参数一致', () => {
    fc.assert(
      fc.property(genParamsArb, (params) => {
        const applied = rb.applyDefaults(params);
        const body = rb.build(params, /* resolveMedia */ false);
        const back = rb.extractParams(body);
        expect(back.capability).toBe(applied.capability);
        expect(back.prompt).toBe(applied.prompt);
        expect(back.resolution).toBe(applied.resolution);
        expect(back.duration).toBe(applied.duration);
        expect(back.watermark).toBe(applied.watermark);
        expect(back.seed).toBe(applied.seed);
      })
    );
  });

  it('PBT-03 不变量：build 输出的 model 恒为该 capability 对应 model', () => {
    fc.assert(
      fc.property(genParamsArb, (params) => {
        const body = rb.build(params, false);
        expect(body.model).toBe(MODEL_BY_CAPABILITY[params.capability]);
      })
    );
  });

  it('PBT-04 幂等：applyDefaults(applyDefaults(x)) == applyDefaults(x)', () => {
    fc.assert(
      fc.property(genParamsArb, (params) => {
        const once = rb.applyDefaults(params);
        const twice = rb.applyDefaults(once);
        expect(twice).toEqual(once);
      })
    );
  });

  it('PBT-03 不变量：duration 越界时 validate 恒返回 ok=false', () => {
    const outOfRange = fc.oneof(
      fc.integer({ min: -100, max: DURATION_MIN - 1 }),
      fc.integer({ min: DURATION_MAX + 1, max: 1000 })
    );
    fc.assert(
      fc.property(capabilityArb, outOfRange, (capability, duration) => {
        const res = rb.validate({ capability, prompt: 'x', duration, media: capability === 't2v' ? [] : undefined });
        expect(res.ok).toBe(false);
      })
    );
  });
});
