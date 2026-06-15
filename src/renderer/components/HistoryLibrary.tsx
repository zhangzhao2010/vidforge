// renderer — 历史库：已下载视频列表、播放、重生成、打开文件夹。

import { List, Button, Space, Tag, Empty, message } from 'antd';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/useStore';

export function HistoryLibrary() {
  const { t } = useTranslation();
  const history = useStore((s) => s.history);
  const refreshTasks = useStore((s) => s.refreshTasks);

  if (history.length === 0) return <Empty description={t('history.empty')} />;

  const regenerate = async (id: string) => {
    try {
      await window.vidforge.regenerateFrom(id);
      message.success(t('msg.submitted'));
      await refreshTasks();
    } catch (e: any) {
      message.error(t(e.messageKey ?? 'error.unknown'));
    }
  };

  return (
    <List
      dataSource={history}
      rowKey="id"
      renderItem={(item) => (
        <List.Item
          actions={[
            <Button size="small" key="folder" onClick={() => window.vidforge.openInFolder(item.id)}>
              {t('btn.openFolder')}
            </Button>,
            <Button size="small" key="regen" onClick={() => regenerate(item.id)}>
              {t('btn.regenerate')}
            </Button>
          ]}
        >
          <List.Item.Meta
            title={
              <Space>
                <Tag>{t(`cap.${item.capability}`)}</Tag>
                <span>{new Date(item.createdAt).toLocaleString()}</span>
              </Space>
            }
            description={
              <div>
                <div>{item.prompt ?? '(no prompt)'}</div>
                <video src={`file://${item.localVideoPath}`} controls style={{ maxWidth: 360, marginTop: 8 }} />
              </div>
            }
          />
        </List.Item>
      )}
    />
  );
}
