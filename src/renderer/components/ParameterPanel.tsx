// renderer — 参数面板：分辨率/宽高比/时长/水印/seed，按能力动态展示。

import { Form, Select, InputNumber, Switch } from 'antd';
import { useTranslation } from 'react-i18next';
import type { Capability, GenParams } from '@shared/types';
import { RATIOS_BY_CAPABILITY, DURATION_MIN, DURATION_MAX } from '@shared/capabilities';

interface Props {
  capability: Capability;
  value: Partial<GenParams>;
  onChange: (patch: Partial<GenParams>) => void;
}

export function ParameterPanel({ capability, value, onChange }: Props) {
  const { t } = useTranslation();
  const ratios = RATIOS_BY_CAPABILITY[capability];

  return (
    <>
      <Form.Item label={t('field.resolution')}>
        <Select
          value={value.resolution ?? '1080P'}
          onChange={(v) => onChange({ resolution: v })}
          options={[
            { value: '720P', label: '720P' },
            { value: '1080P', label: '1080P' }
          ]}
        />
      </Form.Item>

      {ratios.length > 0 && (
        <Form.Item label={t('field.ratio')}>
          <Select
            value={value.ratio ?? ratios[0]}
            onChange={(v) => onChange({ ratio: v })}
            options={ratios.map((r) => ({ value: r, label: r }))}
          />
        </Form.Item>
      )}

      <Form.Item label={t('field.duration')}>
        <InputNumber
          min={DURATION_MIN}
          max={DURATION_MAX}
          value={value.duration ?? 5}
          onChange={(v) => onChange({ duration: v ?? 5 })}
        />
      </Form.Item>

      <Form.Item label={t('field.watermark')}>
        <Switch checked={value.watermark ?? true} onChange={(v) => onChange({ watermark: v })} />
      </Form.Item>

      <Form.Item label={t('field.seed')}>
        <InputNumber
          style={{ width: 200 }}
          value={value.seed}
          onChange={(v) => onChange({ seed: v ?? undefined })}
          placeholder="(optional)"
        />
      </Form.Item>
    </>
  );
}
