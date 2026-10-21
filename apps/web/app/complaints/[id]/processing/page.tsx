'use client';

import Link from 'next/link';

import { AppShell, PageContainer } from '../../../../components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';

export default function ComplaintProcessingPage() {
  return (
    <AppShell>
      <main>
        <PageContainer>
          <Card className="mx-auto max-w-2xl">
            <CardHeader>
              <CardTitle>Report submitted</CardTitle>
              <p className="text-sm leading-6 text-neutral-600">
                Your report is saved. We are preparing it for review.
              </p>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg bg-primary/10 p-4 text-sm text-text">
                Thanks for helping improve your neighborhood.
              </div>
              <Link
                className="mt-6 inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-white transition hover:opacity-90"
                href="/dashboard"
              >
                Back to dashboard
              </Link>
            </CardContent>
          </Card>
        </PageContainer>
      </main>
    </AppShell>
  );
}
