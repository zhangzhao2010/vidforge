// renderer — 应用外壳：左侧「创建任务」按钮 + 可折叠任务列表 + 设置；右侧任务详情/设置。

import { useEffect, useState } from 'react';
import { Layout, Menu, Button, Badge, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { TaskDetailView } from './TaskDetailView';
import { SettingsView } from '../components/SettingsView';
import { CreateTaskModal } from '../components/CreateTaskModal';
import { useStore } from '../store/useStore';

const ACTIVE = ['QUEUED', 'SUBMITTING', 'PENDING', 'RUNNING', 'DOWNLOADING'];

export function AppShell() {
  const { t } = useTranslation();
  const { tasks, activeTaskId, generationsByTask, refreshAll, refreshGenerations, upsertGeneration, setTasks, selectTask, deleteTask } =
    useStore();
  const [showSettings, setShowSettings] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    void refreshAll();
    const unsubGen = window.vidforge.onGenerationUpdate((g) => {
      upsertGeneration(g);
    });
    const unsubList = window.vidforge.onTaskListUpdate((list) => setTasks(list));
    return () => {
      unsubGen();
      unsubList();
    };
  }, [refreshAll, upsertGeneration, setTasks]);

  // 切换任务时拉取其生成
  useEffect(() => {
    if (activeTaskId) void refreshGenerations(activeTaskId);
  }, [activeTaskId, refreshGenerations]);

  const activeTask = tasks.find((x) => x.id === activeTaskId) ?? null;

  const taskName = (name: string, capability: string) =>
    name.startsWith('unnamed::') ? `${t('task.unnamed')} · ${t(`cap.${capability}`)}` : name;

  const taskItems = tasks.map((task) => {
    const gens = generationsByTask[task.id] ?? [];
    const running = gens.some((g) => ACTIVE.includes(g.status));
    return {
      key: task.id,
      label: (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {running && <Badge status="processing" />} {taskName(task.name, task.capability)}
          </span>
          <Popconfirm
            title={t('msg.confirmDeleteTask')}
            okText={t('btn.confirm')}
            cancelText={t('btn.cancel')}
            onConfirm={(e) => {
              e?.stopPropagation();
              void deleteTask(task.id);
            }}
            onCancel={(e) => e?.stopPropagation()}
          >
            <DeleteOutlined onClick={(e) => e.stopPropagation()} style={{ color: '#bbb' }} />
          </Popconfirm>
        </span>
      )
    };
  });

  return (
    <Layout style={{ height: '100vh' }}>
      <Layout.Sider theme="light" width={240} style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 16, fontWeight: 700, fontSize: 18 }}>{t('app.title')}</div>
        <div style={{ padding: '0 12px 12px' }}>
          <Button type="primary" block icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            {t('btn.createTask')}
          </Button>
        </div>
        <Menu
          mode="inline"
          selectable={false}
          items={[{ key: 'tasks-group', label: t('nav.tasks'), children: taskItems.length ? taskItems : [{ key: '__empty', label: t('tasks.empty'), disabled: true }] }]}
          defaultOpenKeys={['tasks-group']}
          selectedKeys={activeTaskId && !showSettings ? [activeTaskId] : []}
          onClick={(e) => {
            if (e.key !== '__empty' && e.key !== 'tasks-group') {
              setShowSettings(false);
              selectTask(e.key);
            }
          }}
          style={{ flex: 1, borderRight: 0, overflow: 'auto' }}
        />
        <Menu
          mode="inline"
          selectedKeys={showSettings ? ['settings'] : []}
          items={[{ key: 'settings', label: t('nav.settings') }]}
          onClick={() => setShowSettings(true)}
        />
      </Layout.Sider>

      <Layout.Content style={{ padding: 16, overflow: 'hidden' }}>
        {showSettings ? (
          <div style={{ height: '100%', overflow: 'auto' }}>
            <SettingsView />
          </div>
        ) : activeTask ? (
          <TaskDetailView key={activeTask.id} task={activeTask} />
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
            {t('detail.pickOrCreate')}
          </div>
        )}
      </Layout.Content>

      <CreateTaskModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </Layout>
  );
}
