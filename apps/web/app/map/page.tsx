import { ProtectedRoute } from '../../components/auth/protected-route';
import { AppShell, PageContainer } from '../../components/layout/app-shell';
import { EmptyState } from '../../components/ui/empty-state';

export default function MapPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <main>
          <PageContainer>
            <h1 className="text-3xl font-semibold">Community map</h1>
            <p className="mt-2 text-neutral-600">See reported issues near you.</p>
            <EmptyState
              className="mt-8"
              description="The interactive map will appear here once reports are available."
              title="No map data yet"
            />
          </PageContainer>
        </main>
      </AppShell>
    </ProtectedRoute>
  );
}
