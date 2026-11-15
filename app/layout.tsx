import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import { ServiceWorker } from '@/components/ServiceWorker';
import './globals.css';

const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', axes: ['opsz'], style: ['normal', 'italic'], display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'WeddingReady', template: '%s · WeddingReady' },
  description: 'A free training and nutrition plan that works back from your wedding date and tells you what to do each day.',
  applicationName: 'WeddingReady',
  appleWebApp: { capable: true, title: 'WeddingReady', statusBarStyle: 'default' },
  icons: { apple: '/icons/apple-180.png' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#3B1F2E',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
