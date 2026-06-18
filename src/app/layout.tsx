// src/app/layout.tsx
// Root layout — imports globals (which @imports tokens.css), loads Inter +
// JetBrains Mono + Libre Barcode 39 from Google Fonts via <link>, and renders
// {children} inside <body>. Per-page chrome is set by route group layouts
// (login, editor, share) — this root stays neutral.

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Bills',
  description: 'Split monthly utilities with roommates.',
  icons: {
    icon: '/icon-512.png',
    apple: '/icon-512.png',
  },
  manifest: '/manifest.json',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&family=Libre+Barcode+39&display=swap"
          rel="stylesheet"
        />
        <meta name="theme-color" content="#ffffff" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Bills" />
        <link rel="apple-touch-icon" href="/icon-512.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
