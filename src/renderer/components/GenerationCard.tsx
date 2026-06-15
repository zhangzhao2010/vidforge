// renderer — 单次生成结果卡：状态/进度、提示词、配置摘要、参考图/视频、应用内播放。

import { Card, Tag, Space, Button, Progress, Image, Descriptions } from 'antd';
import { useTranslation } from 'react-i18next';
import type { Generation, TaskStatus } from '@shared/types';

const STATUS_COLOR: Record<TaskStatus, string> = {
  QUEUED: 'default',
  SUBMITTING: 'processing',
  PENDING: 'processing',
  RUNNING: 'processing',
  SUCCEEDED: 'success',
  DOWNLOADING: 'processing',
  COMPLETED: 'success',
  FAILED: 'error',
  EXPIRED: 'warning',
  CANCELLED: 'default'
};
const ACTIVE: TaskStatus[] = ['QUEUED', 'SUBMITTING', 'PENDING', 'RUNNING', 'DOWNLOADING'];

/** 本地绝对路径 → vidforge-media:// URL（须与 main/media-store/mediaProtocol.toMediaUrl 一致） */
function mediaUrl(absPath: string): string {
  return `vidforge-media:///${encodeURIComponent(absPath)}`;
}

export function GenerationCard({ gen, index }: { gen: Generation; index: number }) {
  const { t } = useTranslation();
  const p = gen.params;
  const refImages = (p.media ?? []).filter((m) => m.type !== 'video' && m.source.kind === 'file');
  const refVideo = (p.media ?? []).find((m) => m.type === 'video' && m.source.kind === 'file');

  return (
    <Card
      size="small"
      style={{ marginBottom: 16 }}
      title={
        <Space>
          <span>#{index + 1}</span>
          <Tag color={STATUS_COLOR[gen.status]}>{gen.status}</Tag>
          <span style={{ color: '#888', fontWeight: 400, fontSize: 12 }}>
            {new Date(gen.createdAt).toLocaleString()}
          </span>
        </Space>
      }
      extra={
        <Space>
          {(gen.status === 'FAILED' || gen.status === 'EXPIRED') && (
            <Button size="small" onClick={() => window.vidforge.retryGeneration(gen.localId)}>
              {t('btn.retry')}
            </Button>
          )}
          {ACTIVE.includes(gen.status) && (
            <Button size="small" onClick={() => window.vidforge.cancelGeneration(gen.localId)}>
              {t('btn.cancel')}
            </Button>
          )}
          {gen.localVideoPath && (
            <Button size="small" onClick={() => window.vidforge.openInFolder(gen.localId)}>
              {t('btn.openFolder')}
            </Button>
          )}
        </Space>
      }
    >
      {ACTIVE.includes(gen.status) && (
        <Progress
          percent={gen.status === 'DOWNLOADING' ? 90 : gen.status === 'RUNNING' ? 60 : 30}
          status="active"
          showInfo={false}
          style={{ marginBottom: 12 }}
        />
      )}

      {gen.errorMessage && (
        <div style={{ color: '#cf1322', marginBottom: 12 }}>
          {t(gen.errorCode ? `error.${gen.errorCode}` : 'error.unknown')}: {gen.errorMessage}
        </div>
      )}

      {/* 结果视频：应用内播放（走自定义协议） */}
      {gen.localVideoPath && (
        <video
          src={mediaUrl(gen.localVideoPath)}
          controls
          style={{ width: '100%', maxHeight: 420, background: '#000', borderRadius: 6, marginBottom: 12 }}
        />
      )}

      {/* 参考图缩略图 */}
      {refImages.length > 0 && (
        <Image.PreviewGroup>
          <Space wrap style={{ marginBottom: 12 }}>
            {refImages.map((m, i) =>
              m.source.kind === 'file' ? (
                <Image key={i} src={mediaUrl(m.source.path)} width={72} height={72} style={{ objectFit: 'cover', borderRadius: 4 }} />
              ) : null
            )}
          </Space>
        </Image.PreviewGroup>
      )}

      {/* 参考视频 */}
      {refVideo && refVideo.source.kind === 'file' && (
        <video src={mediaUrl(refVideo.source.path)} controls style={{ width: 200, marginBottom: 12, borderRadius: 4 }} />
      )}

      {/* 提示词 + 配置摘要 */}
      <Descriptions size="small" column={1} colon>
        {p.prompt && <Descriptions.Item label={t('field.prompt')}>{p.prompt}</Descriptions.Item>}
        <Descriptions.Item label={t('detail.config')}>
          <Space size={4} wrap>
            {p.resolution && <Tag>{p.resolution}</Tag>}
            {p.ratio && <Tag>{p.ratio}</Tag>}
            {p.duration != null && <Tag>{p.duration}s</Tag>}
            {p.seed != null && <Tag>seed: {p.seed}</Tag>}
            <Tag>{t('field.watermark')}: {p.watermark ? '✓' : '✗'}</Tag>
          </Space>
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
}
