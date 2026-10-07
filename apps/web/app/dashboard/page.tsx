'use client';

import { useRouter } from 'next/navigation';

import { ProtectedRoute } from '../../components/auth/protected-route';
import { useAuth } from '../../components/auth/auth-provider';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader } from '../../components/ui/card';

function DashboardContent() {
  const router = useRouter();
  const { logout, user } = useAuth();

  function handleLogout() {
    logout();
    router.replace('/login');
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-8 text-text sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <Card>
          <CardHeader className="p-6 sm:p-8">
            <p className="text-sm font-bold tracking-wide text-primary">CivicFix</p>
            <h1 className="mt-3 text-3xl font-semibold">Your reports</h1>
          </CardHeader>
          <CardContent className="space-y-5 p-6 pt-0 sm:p-8 sm:pt-0">
            <p className="text-neutral-600">
              Signed in as <strong>{user?.name}</strong>. Your report history will appear here.
            </p>
            <Button onClick={handleLogout} variant="secondary">
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}
