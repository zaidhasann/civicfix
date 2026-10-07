import { ProtectedRoute } from '../../components/auth/protected-route';
import { AppShell, PageContainer } from '../../components/layout/app-shell';
import { EmptyState } from '../../components/ui/empty-state';

export default function ProfilePage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <main>
          <PageContainer>
            <h1 className="text-3xl font-semibold">Profile</h1>
            <p className="mt-2 text-neutral-600">Manage your CivicFix account.</p>
            <EmptyState
              className="mt-8"
              description="Profile settings will be available here soon."
              title="Profile settings coming soon"
            />
          </PageContainer>
        </main>
      </AppShell>
    </ProtectedRoute>
  );
}
