// PBT for U1 core-config — ConfigManager.resolveEndpoint
// 强制规则：PBT-03（不变量）、PBT-07（领域生成器）、PBT-08（shrinking/seed）。
// fast-check 默认开启 shrinking；失败时报告 seed，可复现。

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { ConfigManager, type ConfigStore } from '../../src/main/core-config/ConfigManager';
import type { AppConfig, Profile, Region } from '../../src/shared/types';
import { ENDPOINT_BY_REGION, SUBMIT_PATH } from '../../src/shared/capabilities';

// 内存 store 桩，避免依赖 SQLite/Electron
function memStore(): ConfigStore {
  let cfg: AppConfig | undefined;
  const profiles = new Map<string, Profile>();
  return {
    getConfig: () => cfg,
    setConfig: (c) => void (cfg = c),
    listProfiles: () => [...profiles.values()],
    upsertProfile: (p) => void profiles.set(p.id, p),
    deleteProfile: (id) => void profiles.delete(id)
  };
}

// 领域生成器（PBT-07）：合法的非 custom region
const nonCustomRegion = fc.constantFrom<Region>('cn-beijing', 'ap-southeast-1', 'us-east-1', 'eu-central-1');
// 领域生成器：合法 baseURL（http/https + host，可带尾部斜杠）
const baseUrlArb = fc
  .tuple(
    fc.constantFrom('http', 'https'),
    fc.domain(),
    fc.nat({ max: 3 }) // 尾部斜杠数量
  )
  .map(([scheme, host, slashes]) => `${scheme}://${host}${'/'.repeat(slashes)}`);

describe('ConfigManager.resolveEndpoint (PBT)', () => {
  it('PBT-03 不变量：非 custom region 始终解析出非空、无重复斜杠的端点', () => {
    fc.assert(
      fc.property(nonCustomRegion, (region) => {
        const cm = new ConfigManager(memStore());
        const profile: Profile = { id: 'p', name: 'n', region };
        const ep = cm.resolveEndpoint(profile);
        expect(ep.length).toBeGreaterThan(0);
        expect(ep).toBe(ENDPOINT_BY_REGION[region as Exclude<Region, 'custom'>]);
        // 拼接后不得出现 '://' 之外的双斜杠
        const submit = cm.submitUrl(profile);
        expect(submit.endsWith(SUBMIT_PATH)).toBe(true);
        expect(submit.replace('://', '')).not.toContain('//');
      })
    );
  });

  it('PBT-03 不变量：自定义 baseUrl 优先，且结果不含尾部斜杠、拼接无双斜杠', () => {
    fc.assert(
      fc.property(baseUrlArb, nonCustomRegion, (baseUrl, region) => {
        const cm = new ConfigManager(memStore());
        const profile: Profile = { id: 'p', name: 'n', region, baseUrl };
        const ep = cm.resolveEndpoint(profile);
        expect(ep.endsWith('/')).toBe(false); // R2 去尾斜杠
        const submit = cm.submitUrl(profile);
        expect(submit.replace('://', '')).not.toContain('//');
      })
    );
  });

  it('PBT-04 幂等：同一 profile 多次解析结果一致', () => {
    fc.assert(
      fc.property(nonCustomRegion, fc.option(baseUrlArb, { nil: undefined }), (region, baseUrl) => {
        const cm = new ConfigManager(memStore());
        const profile: Profile = { id: 'p', name: 'n', region, baseUrl };
        expect(cm.resolveEndpoint(profile)).toBe(cm.resolveEndpoint(profile));
      })
    );
  });

  it('custom region 且无 baseUrl 必抛 config.missingBaseUrl', () => {
    const cm = new ConfigManager(memStore());
    expect(() => cm.resolveEndpoint({ id: 'p', name: 'n', region: 'custom' })).toThrowError(/missingBaseUrl/);
  });
});
