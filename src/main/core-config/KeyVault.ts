// U1 core-config — KeyVault
// 基于 OS 密钥链（keytar）的 API Key 安全存取。
// 安全约束（NFR-2.1）：明文 Key 仅在 main 进程内取用，绝不经 IPC 外传 renderer，绝不写日志。

import keytar from 'keytar';
import { AppError } from '@shared/errors';

const SERVICE = 'vidforge';

export class KeyVault {
  /** 存入/更新某 Profile 的 API Key。轻校验（R3）：trim 后非空。 */
  async setKey(profileId: string, apiKey: string): Promise<void> {
    const trimmed = (apiKey ?? '').trim();
    if (!trimmed) throw new AppError('config.missingKey', 'error.config.missingKey');
    await keytar.setPassword(SERVICE, profileId, trimmed);
  }

  /** 取明文 Key（仅 main 内部使用）。不存在则抛错。 */
  async getKey(profileId: string): Promise<string> {
    const key = await keytar.getPassword(SERVICE, profileId);
    if (!key) throw new AppError('config.missingKey', 'error.config.missingKey', `no key for profile ${profileId}`);
    return key;
  }

  /** 是否已配置 Key（可安全暴露给 renderer 的布尔查询） */
  async hasKey(profileId: string): Promise<boolean> {
    const key = await keytar.getPassword(SERVICE, profileId);
    return !!key;
  }

  async deleteKey(profileId: string): Promise<void> {
    await keytar.deletePassword(SERVICE, profileId);
  }
}
