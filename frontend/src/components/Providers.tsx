'use client';
import { App, ConfigProvider } from 'antd';
import { AuthProvider } from '@/lib/auth';
import { theme } from '@/lib/theme';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider theme={theme}>
      <App>
        <AuthProvider>{children}</AuthProvider>
      </App>
    </ConfigProvider>
  );
}