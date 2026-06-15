// renderer — 任务详情页：左 = 配置（按任务固定能力，无顶部切换）；右 = 生成结果竖向卡片。
// 串行约束：全局已有生成在跑时，提交按钮禁用并提示。

import { useState } from 'react';
import { Row, Col, Card, Form, Input, Button, Space, Tag, Empty, message, Tooltip, Alert } from 'antd';
import { useTranslation } from 'react-i18next';
import type { Task, GenParams, MediaInput } from '@shared/types';
import { ParameterPanel } from '../components/ParameterPanel';
import { GenerationCard } from '../components/GenerationCard';
import { useStore } from '../store/useStore';

const IMAGE_FILTER = [{ name: 'Image', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }];
const VIDEO_FILTER = [{ name: 'Video', extensions: ['mp4', 'mov', 'webm'] }];

// 稳定的空数组引用：避免 selector 每次返回新 [] 触发 useSyncExternalStore 无限循环
const EMPTY: never[] = [];

export function TaskDetailView({ task }: { task: Task }) {
  const { t } = useTranslation();
  const cap = task.capability;
  const generations = useStore((s) => s.generationsByTask[task.id] ?? EMPTY);
  const refreshGenerations = useStore((s) => s.refreshGenerations);
  const hasActive = useStore((s) => s.hasActiveGeneration());

  const [prompt, setPrompt] = useState('');
  const [media, setMedia] = useState<MediaInput[]>([]);
  const [params, setParams] = useState<Partial<GenParams>>({});
  const [submitting, setSubmitting] = useState(false);

  const promptRequired = cap === 't2v' || cap === 'r2v' || cap === 'video-edit';

  const pickImages = async (multi: boolean) => {
    const paths = await window.vidforge.pickFiles({ filters: IMAGE_FILTER, multi });
    const type = cap === 'r2v' ? 'reference_image' : 'first_frame';
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
      const payload: GenParams = {
        capability: cap,
        prompt: prompt || undefined,
        media: media.length ? media : undefined,
        ...params
      };
      await window.vidforge.submitGeneration(task.id, payload);
      message.success(t('msg.submitted'));
      await refreshGenerations(task.id);
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

  const submitBtn = (
    <Button type="primary" block loading={submitting} disabled={hasActive} onClick={submit}>
      {t('btn.submit')}
    </Button>
  );

  return (
    <Row gutter={16} style={{ height: '100%' }}>
      {/* 左：配置 */}
      <Col flex="380px" style={{ height: '100%', overflow: 'auto' }}>
        <Card title={<Space><Tag color="purple">{t(`cap.${cap}`)}</Tag>{t('detail.config')}</Space>}>
          <Form layout="vertical">
            {promptRequired ? (
              <Form.Item label={t('field.prompt')} required>
                <Input.TextArea
                  rows={4}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={cap === 'r2v' ? '使用 [Image 1] [Image 2] 指代参考图 / use [Image N]' : ''}
                />
              </Form.Item>
            ) : (
              <Form.Item label={t('field.prompt')}>
                <Input.TextArea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
              </Form.Item>
            )}

            {cap === 'i2v' && (
              <Form.Item label={t('btn.pickImage')}>
                <Button onClick={() => pickImages(false)}>{t('btn.pickImage')}</Button>
                <div style={{ marginTop: 8 }}>{mediaList}</div>
              </Form.Item>
            )}
            {cap === 'r2v' && (
              <Form.Item label={t('btn.pickImages')}>
                <Button onClick={() => pickImages(true)}>{t('btn.pickImages')}</Button>
                <div style={{ marginTop: 8 }}>{mediaList}</div>
              </Form.Item>
            )}
            {cap === 'video-edit' && (
              <Form.Item label={t('btn.pickVideo')}>
                <Space>
                  <Button onClick={pickVideo}>{t('btn.pickVideo')}</Button>
                  <Button onClick={() => pickImages(true)}>{t('btn.pickImages')}</Button>
                </Space>
                <div style={{ marginTop: 8 }}>{mediaList}</div>
              </Form.Item>
            )}

            <ParameterPanel capability={cap} value={params} onChange={(p) => setParams({ ...params, ...p })} />

            {hasActive ? (
              <Tooltip title={t('msg.hasActiveGeneration')}>{submitBtn}</Tooltip>
            ) : (
              submitBtn
            )}
          </Form>
        </Card>
      </Col>

      {/* 右：生成结果 */}
      <Col flex="auto" style={{ height: '100%', overflow: 'auto' }}>
        <Card title={t('detail.results')} bodyStyle={{ paddingBottom: 0 }}>
          {hasActive && generations.some((g) => ['QUEUED', 'SUBMITTING', 'PENDING', 'RUNNING', 'DOWNLOADING'].includes(g.status)) && (
            <Alert type="info" showIcon message={t('msg.generating')} style={{ marginBottom: 16 }} />
          )}
          {generations.length === 0 ? (
            <Empty description={t('detail.noResults')} />
          ) : (
            [...generations]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((g, i) => <GenerationCard key={g.localId} gen={g} index={generations.length - 1 - i} />)
          )}
        </Card>
      </Col>
    </Row>
  );
}
