import { ProtectedRoute } from '../../components/auth/protected-route';
import { AppShell, PageContainer } from '../../components/layout/app-shell';
import { EmptyState } from '../../components/ui/empty-state';

export default function ReportPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <main>
          <PageContainer>
            <h1 className="text-3xl font-semibold">Report an issue</h1>
            <p className="mt-2 text-neutral-600">
              Tell us what needs attention in your neighborhood.
            </p>
            <EmptyState
              className="mt-8"
              description="The report form is coming soon. You can still explore the map and your complaint history."
              title="Report form coming soon"
            />
          </PageContainer>
        </main>
      </AppShell>
    </ProtectedRoute>
  );
}
