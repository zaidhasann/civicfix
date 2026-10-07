import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import { AuthProvider } from '../components/auth/auth-provider';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'CivicFix',
  description: 'Report civic issues and help improve your community.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
