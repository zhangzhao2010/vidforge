// renderer — 任务队列面板：实时状态、取消、重试。

import { List, Tag, Button, Space, Progress, Empty } from 'antd';
import { useTranslation } from 'react-i18next';
import type { TaskStatus } from '@shared/types';
import { useStore } from '../store/useStore';

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

const ACTIVE: TaskStatus[] = ['SUBMITTING', 'PENDING', 'RUNNING', 'DOWNLOADING'];

export function TaskQueuePanel() {
  const { t } = useTranslation();
  const tasks = useStore((s) => s.tasks);

  if (tasks.length === 0) return <Empty description={t('tasks.empty')} />;

  return (
    <List
      dataSource={tasks}
      rowKey="localId"
      renderItem={(task) => (
        <List.Item
          actions={[
            ACTIVE.includes(task.status) ? (
              <Button size="small" onClick={() => window.vidforge.cancelTask(task.localId)}>
                {t('btn.cancel')}
              </Button>
            ) : null,
            task.status === 'FAILED' || task.status === 'EXPIRED' ? (
              <Button size="small" onClick={() => window.vidforge.retryTask(task.localId)}>
                {t('btn.retry')}
              </Button>
            ) : null
          ].filter(Boolean) as React.ReactNode[]}
        >
          <List.Item.Meta
            title={
              <Space>
                <Tag>{t(`cap.${task.params.capability}`)}</Tag>
                <Tag color={STATUS_COLOR[task.status]}>{task.status}</Tag>
              </Space>
            }
            description={
              <div>
                <div style={{ maxWidth: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {task.params.prompt ?? '(no prompt)'}
                </div>
                {ACTIVE.includes(task.status) && <Progress percent={task.status === 'DOWNLOADING' ? 90 : 50} status="active" showInfo={false} />}
                {task.errorMessage && <span style={{ color: '#cf1322' }}>{task.errorMessage}</span>}
                {task.localVideoPath && <span style={{ color: '#389e0d' }}>{task.localVideoPath}</span>}
              </div>
            }
          />
        </List.Item>
      )}
    />
  );
}
