'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { useAuth } from './auth-provider';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isLoading, user } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [isLoading, router, user]);

  if (isLoading || !user) {
    return (
      <main
        aria-busy="true"
        className="flex min-h-screen items-center justify-center bg-neutral-50 p-6"
      >
        <p className="text-sm text-neutral-600">Checking your session…</p>
      </main>
    );
  }

  return children;
}
