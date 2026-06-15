// renderer — 应用外壳：导航 + 各视图。

import { useEffect, useState } from 'react';
import { Layout, Menu, Badge } from 'antd';
import { useTranslation } from 'react-i18next';
import { CapabilityForms } from '../components/CapabilityForms';
import { TaskQueuePanel } from '../components/TaskQueuePanel';
import { HistoryLibrary } from '../components/HistoryLibrary';
import { SettingsView } from '../components/SettingsView';
import { useStore } from '../store/useStore';

type View = 'create' | 'tasks' | 'history' | 'settings';

export function AppShell() {
  const { t } = useTranslation();
  const [view, setView] = useState<View>('create');
  const { refreshAll, upsertTask, tasks } = useStore();

  useEffect(() => {
    void refreshAll();
    const unsub = window.vidforge.onTaskUpdate((task) => upsertTask(task));
    return unsub;
  }, [refreshAll, upsertTask]);

  const activeCount = tasks.filter((x) => ['SUBMITTING', 'PENDING', 'RUNNING', 'DOWNLOADING'].includes(x.status)).length;

  return (
    <Layout style={{ height: '100vh' }}>
      <Layout.Sider theme="light" width={200}>
        <div style={{ padding: 16, fontWeight: 700, fontSize: 18 }}>{t('app.title')}</div>
        <Menu
          mode="inline"
          selectedKeys={[view]}
          onClick={(e) => setView(e.key as View)}
          items={[
            { key: 'create', label: t('nav.create') },
            { key: 'tasks', label: <Badge count={activeCount} size="small" offset={[10, 0]}>{t('nav.tasks')}</Badge> },
            { key: 'history', label: t('nav.history') },
            { key: 'settings', label: t('nav.settings') }
          ]}
        />
      </Layout.Sider>
      <Layout.Content style={{ padding: 24, overflow: 'auto' }}>
        {view === 'create' && <CapabilityForms />}
        {view === 'tasks' && <TaskQueuePanel />}
        {view === 'history' && <HistoryLibrary />}
        {view === 'settings' && <SettingsView />}
      </Layout.Content>
    </Layout>
  );
}
