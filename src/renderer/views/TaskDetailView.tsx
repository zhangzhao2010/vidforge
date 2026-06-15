// renderer — 任务详情页：左 = 配置（按任务固定能力，无顶部切换）；右 = 生成结果竖向卡片。
// 串行约束：全局已有生成在跑时，提交按钮禁用并提示。

import { useEffect, useRef, useState } from 'react';
import { Row, Col, Card, Form, Input, Button, Space, Tag, Empty, message, Tooltip, Alert, Image } from 'antd';
import { useTranslation } from 'react-i18next';
import type { Task, GenParams, MediaInput } from '@shared/types';
import { ParameterPanel } from '../components/ParameterPanel';
import { GenerationCard } from '../components/GenerationCard';
import { useStore } from '../store/useStore';

const fileName = (p: string) => p.split(/[/\\]/).pop();

/** 表单素材缩略图：图片文件读成 data URL 显示缩略图，视频/URL 显示文件名 Tag。可删除。
 *  图片走 readImageDataUrl 而非 vidforge-media:// —— 未提交素材是原始磁盘路径，不在协议放行根内。 */
function MediaThumb({ item, onRemove }: { item: MediaInput; onRemove: () => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const isImageFile = item.type !== 'video' && item.source.kind === 'file';
  const filePath = item.source.kind === 'file' ? item.source.path : undefined;

  useEffect(() => {
    if (!isImageFile || !filePath) return;
    let alive = true;
    void window.vidforge.readImageDataUrl(filePath).then((url) => {
      if (alive) setDataUrl(url);
    });
    return () => {
      alive = false;
    };
  }, [isImageFile, filePath]);

  // 图片成功读出 → 缩略图（带删除角标）；否则（视频/URL/读失败）→ 文件名 Tag
  if (isImageFile && dataUrl) {
    return (
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <Image src={dataUrl} width={72} height={72} style={{ objectFit: 'cover', borderRadius: 4 }} />
        <Tag
          closable
          onClose={onRemove}
          style={{ position: 'absolute', top: 2, right: 2, margin: 0, padding: '0 2px', opacity: 0.85 }}
        />
      </div>
    );
  }

  const label = item.source.kind === 'file' ? fileName(item.source.path) : item.source.url;
  return (
    <Tag closable onClose={onRemove}>
      [{item.type}] {label}
    </Tag>
  );
}

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

  // 进入任务详情页后，用「最后一次生成配置」自动回填表单（prompt + 参数 + 素材，全量复刻）。
  // 只填一次：generations 异步到位后执行首次回填，之后不再覆盖，避免冲掉用户编辑或提交后被重置。
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || generations.length === 0) return;
    prefilled.current = true;
    const last = [...generations].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const { capability, prompt: p, media: m, ...rest } = last.params;
    setPrompt(p ?? '');
    setMedia(m ?? []);
    setParams(rest);
  }, [generations]);

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
    <Image.PreviewGroup>
      <Space wrap>
        {media.map((m, i) => (
          <MediaThumb key={i} item={m} onRemove={() => setMedia(media.filter((_, j) => j !== i))} />
        ))}
      </Space>
    </Image.PreviewGroup>
  );

  const submitBtn = (
    <Button type="primary" block loading={submitting} disabled={hasActive} onClick={submit}>
      {t('btn.submit')}
    </Button>
  );

  return (
    // wrap=false：窗口变窄时右列绝不折行到第二行（否则会落到 overflow:hidden 的可视区外，表现为右侧消失）
    <Row gutter={16} wrap={false} style={{ height: '100%' }}>
      {/* 左：配置 */}
      <Col flex="0 0 380px" style={{ height: '100%', overflow: 'auto' }}>
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

      {/* 右：生成结果。minWidth:0 让 flex 子项可收缩（默认 min-width:auto 会撑破容器导致折行） */}
      <Col flex="auto" style={{ height: '100%', overflow: 'auto', minWidth: 0 }}>
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
