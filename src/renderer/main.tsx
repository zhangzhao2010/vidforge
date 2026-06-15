// renderer 入口：初始化 i18n（按配置语言）后挂载 App。

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd';
import { I18nextProvider } from 'react-i18next';
import { initI18n } from './i18n';
import { AppShell } from './views/AppShell';

async function bootstrap() {
  // 先取配置以确定语言；失败则默认中文
  let lang: 'zh' | 'en' = 'zh';
  try {
    const cfg = await window.vidforge.getConfig();
    lang = cfg.language;
  } catch {
    /* 配置不可用时用默认 */
  }
  const i18n = initI18n(lang);

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <ConfigProvider>
          <AppShell />
        </ConfigProvider>
      </I18nextProvider>
    </StrictMode>
  );
}

void bootstrap();
