// renderer — 创建视图：四能力切换 + 素材输入 + prompt + 参数面板 + 提交。

import { useState } from 'react';
import { Tabs, Input, Button, Form, Space, Tag, message, Card } from 'antd';
import { useTranslation } from 'react-i18next';
import type { Capability, GenParams, MediaInput } from '@shared/types';
import { ParameterPanel } from './ParameterPanel';
import { useStore } from '../store/useStore';

const CAPS: Capability[] = ['t2v', 'i2v', 'r2v', 'video-edit'];
const IMAGE_FILTER = [{ name: 'Image', extensions: ['jpg', 'jpeg', 'png', 'webp'] }];
const VIDEO_FILTER = [{ name: 'Video', extensions: ['mp4', 'mov', 'webm'] }];

export function CapabilityForms() {
  const { t } = useTranslation();
  const [capability, setCapability] = useState<Capability>('t2v');
  const [prompt, setPrompt] = useState('');
  const [media, setMedia] = useState<MediaInput[]>([]);
  const [params, setParams] = useState<Partial<GenParams>>({});
  const [submitting, setSubmitting] = useState(false);
  const refreshTasks = useStore((s) => s.refreshTasks);

  const switchCap = (c: Capability) => {
    setCapability(c);
    setMedia([]);
  };

  const pickImages = async (multi: boolean) => {
    const paths = await window.vidforge.pickFiles({ filters: IMAGE_FILTER, multi });
    const type = capability === 'r2v' ? 'reference_image' : 'first_frame';
    const items: MediaInput[] = paths.map((p) => ({ type, source: { kind: 'file', path: p } }));
    setMedia(multi ? [...media.filter((m) => m.type === 'video'), ...items].slice(0, 9) : items);
  };

  const pickVideo = async () => {
    const paths = await window.vidforge.pickFiles({ filters: VIDEO_FILTER, multi: false });
    if (paths[0]) {
      const others = media.filter((m) => m.type !== 'video');
      setMedia([...others, { type: 'video', source: { kind: 'file', path: paths[0] } }]);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const payload: GenParams = { capability, prompt: prompt || undefined, media: media.length ? media : undefined, ...params };
      await window.vidforge.submitTask(payload);
      message.success(t('msg.submitted'));
      await refreshTasks();
    } catch (e: any) {
      message.error(t(e.messageKey ?? 'error.unknown') + (e.message ? `: ${e.message}` : ''));
    } finally {
      setSubmitting(false);
    }
  };

  const mediaList = (
    <Space wrap>
      {media.map((m, i) => (
        <Tag key={i} closable onClose={() => setMedia(media.filter((_, j) => j !== i))}>
          [{m.type}] {m.source.kind === 'file' ? m.source.path.split(/[/\\]/).pop() : m.source.url}
        </Tag>
      ))}
    </Space>
  );

  return (
    <Card>
      <Tabs
        activeKey={capability}
        onChange={(k) => switchCap(k as Capability)}
        items={CAPS.map((c) => ({ key: c, label: t(`cap.${c}`) }))}
      />
      <Form layout="vertical" style={{ marginTop: 16 }}>
        {(capability === 't2v' || capability === 'r2v' || capability === 'video-edit') && (
          <Form.Item label={t('field.prompt')} required>
            <Input.TextArea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={capability === 'r2v' ? '使用 [Image 1] [Image 2] 指代参考图 / use [Image N] to refer to images' : ''}
            />
          </Form.Item>
        )}
        {capability === 'i2v' && (
          <Form.Item label={t('field.prompt')}>
            <Input.TextArea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          </Form.Item>
        )}

        {capability === 'i2v' && (
          <Form.Item>
            <Button onClick={() => pickImages(false)}>{t('btn.pickImage')}</Button>
            <div style={{ marginTop: 8 }}>{mediaList}</div>
          </Form.Item>
        )}
        {capability === 'r2v' && (
          <Form.Item>
            <Button onClick={() => pickImages(true)}>{t('btn.pickImages')}</Button>
            <div style={{ marginTop: 8 }}>{mediaList}</div>
          </Form.Item>
        )}
        {capability === 'video-edit' && (
          <Form.Item>
            <Space>
              <Button onClick={pickVideo}>{t('btn.pickVideo')}</Button>
              <Button onClick={() => pickImages(true)}>{t('btn.pickImages')}</Button>
            </Space>
            <div style={{ marginTop: 8 }}>{mediaList}</div>
          </Form.Item>
        )}

        <ParameterPanel capability={capability} value={params} onChange={(p) => setParams({ ...params, ...p })} />

        <Button type="primary" loading={submitting} onClick={submit}>
          {t('btn.submit')}
        </Button>
      </Form>
    </Card>
  );
}
