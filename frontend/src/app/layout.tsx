import { AntdRegistry } from '@ant-design/nextjs-registry';
import Providers from '@/components/Providers';
import './globals.css';

export const metadata = { title: 'Walnut Smart Center', description: 'Slimming & body-shaping centre management', icons: { icon: '/logo.png' } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AntdRegistry>
          <Providers>{children}</Providers>
        </AntdRegistry>
      </body>
    </html>
  );
}
