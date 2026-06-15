// renderer — 创建任务弹窗：选生成类型（创建时固定）→ 新建任务并进入详情。

import { useState } from 'react';
import { Modal, Radio, Space, message } from 'antd';
import { useTranslation } from 'react-i18next';
import type { Capability } from '@shared/types';
import { useStore } from '../store/useStore';

const CAPS: Capability[] = ['t2v', 'i2v', 'r2v', 'video-edit'];

export function CreateTaskModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const createTask = useStore((s) => s.createTask);
  const [capability, setCapability] = useState<Capability>('t2v');
  const [loading, setLoading] = useState(false);

  const confirm = async () => {
    setLoading(true);
    try {
      await createTask(capability);
      onClose();
    } catch (e: any) {
      message.error(t(e.messageKey ?? 'error.unknown'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={t('modal.selectType.title')}
      open={open}
      onOk={confirm}
      onCancel={onClose}
      okText={t('btn.confirm')}
      cancelText={t('btn.cancel')}
      confirmLoading={loading}
    >
      <Radio.Group value={capability} onChange={(e) => setCapability(e.target.value)} style={{ width: '100%' }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          {CAPS.map((c) => (
            <Radio key={c} value={c} style={{ padding: '8px 0' }}>
              {t(`cap.${c}`)}
            </Radio>
          ))}
        </Space>
      </Radio.Group>
    </Modal>
  );
}
