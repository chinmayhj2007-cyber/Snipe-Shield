import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { SnipeShieldIntro } from '@/components/intro/SnipeShieldIntro';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Snipe Shield — Live Auction & Bidding Platform',
  description:
    'Snipe Shield authentication portal for Avishkar 26 Real-Time Online Auction & Bidding Platform (Team DedSec).',
  icons: {
    icon: [
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-48x48.png', sizes: '48x48', type: 'image/png' },
    ],
    shortcut: '/favicon-32x32.png',
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#090b0f',
};

const INTRO_PREPAINT_SCRIPT = `(function(){try{document.documentElement.dataset.intro=sessionStorage.getItem('snipe_shield_intro_seen')==='1'?'done':'pending';}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="min-h-dvh bg-[#090b0f] text-white antialiased selection:bg-white/25 selection:text-white">
        <script dangerouslySetInnerHTML={{ __html: INTRO_PREPAINT_SCRIPT }} />
        <SnipeShieldIntro />
        {children}
      </body>
    </html>
  );
}
