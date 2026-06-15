// renderer — 设置：Profile（API Key + region + baseURL）管理、下载目录、语言。
// 安全：API Key 输入后经 IPC 存入密钥链，输入框不回显已存的明文。

import { useState } from 'react';
import { Card, Form, Input, Select, Button, List, Tag, Space, message, Divider } from 'antd';
import { useTranslation } from 'react-i18next';
import type { Profile, Region } from '@shared/types';
import { useStore } from '../store/useStore';

const REGIONS: Region[] = ['cn-beijing', 'ap-southeast-1', 'us-east-1', 'eu-central-1', 'custom'];

export function SettingsView() {
  const { t, i18n } = useTranslation();
  const { config, profiles, refreshProfiles, refreshConfig } = useStore();
  const [name, setName] = useState('');
  const [region, setRegion] = useState<Region>('cn-beijing');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');

  const addProfile = async () => {
    try {
      const id = crypto.randomUUID();
      const profile: Profile = { id, name: name || region, region, baseUrl: baseUrl || undefined };
      await window.vidforge.upsertProfile(profile);
      if (apiKey.trim()) {
        await window.vidforge.setKey(id, apiKey.trim());
      }
      message.success(t('msg.keySaved'));
      setName('');
      setBaseUrl('');
      setApiKey('');
      await refreshProfiles();
      await refreshConfig();
    } catch (e: any) {
      message.error(t(e.messageKey ?? 'error.unknown'));
    }
  };

  const setActive = async (id: string) => {
    await window.vidforge.setActiveProfile(id);
    await refreshConfig();
  };

  const remove = async (id: string) => {
    await window.vidforge.deleteProfile(id);
    await refreshProfiles();
    await refreshConfig();
  };

  const changeLang = async (lng: 'zh' | 'en') => {
    await i18n.changeLanguage(lng);
    await window.vidforge.updateConfig({ language: lng });
    await refreshConfig();
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Card title={t('settings.profiles')}>
        <List
          dataSource={profiles}
          rowKey="id"
          locale={{ emptyText: '—' }}
          renderItem={(p) => (
            <List.Item
              actions={[
                config?.activeProfileId === p.id ? (
                  <Tag color="green" key="a">{t('settings.active')}</Tag>
                ) : (
                  <Button size="small" key="a" onClick={() => setActive(p.id)}>{t('settings.active')}</Button>
                ),
                <Button size="small" danger key="d" onClick={() => remove(p.id)}>×</Button>
              ]}
            >
              <List.Item.Meta title={p.name} description={`${p.region}${p.baseUrl ? ' · ' + p.baseUrl : ''}`} />
            </List.Item>
          )}
        />
        <Divider />
        <Form layout="vertical">
          <Form.Item label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Form.Item>
          <Form.Item label={t('settings.region')}>
            <Select value={region} onChange={setRegion} options={REGIONS.map((r) => ({ value: r, label: r }))} />
          </Form.Item>
          {region === 'custom' && (
            <Form.Item label={t('settings.baseUrl')} required>
              <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com" />
            </Form.Item>
          )}
          {region !== 'custom' && (
            <Form.Item label={t('settings.baseUrl')}>
              <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
            </Form.Item>
          )}
          <Form.Item label={t('settings.apiKey')} required>
            <Input.Password value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-xxxx" />
          </Form.Item>
          <Button type="primary" onClick={addProfile}>{t('btn.addProfile')}</Button>
        </Form>
      </Card>

      <Card title={t('nav.settings')}>
        <Form layout="vertical">
          <Form.Item label={t('settings.downloadDir')}>
            <Input value={config?.downloadDir ?? ''} readOnly />
          </Form.Item>
          <Form.Item label={t('settings.language')}>
            <Select
              value={i18n.language}
              onChange={(v) => changeLang(v as 'zh' | 'en')}
              options={[{ value: 'zh', label: '中文' }, { value: 'en', label: 'English' }]}
              style={{ width: 160 }}
            />
          </Form.Item>
        </Form>
      </Card>
    </Space>
  );
}
