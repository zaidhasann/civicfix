'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import { AppShell, PageContainer } from '../../../../components/layout/app-shell';
import { Button } from '../../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';

export default function ComplaintApprovalPage() {
  const params = useParams<{ id: string }>();

  return (
    <AppShell>
      <main>
        <PageContainer>
          <Card className="mx-auto max-w-2xl">
            <CardHeader>
              <CardTitle>Your report is ready for approval</CardTitle>
              <p className="text-sm leading-6 text-neutral-600">
                Review the prepared complaint before it is sent.
              </p>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg bg-primary/10 p-4 text-sm text-text">
                Complaint {params.id} is waiting for your review.
              </div>
              <Link href="/dashboard">
                <Button className="mt-6">Review from dashboard</Button>
              </Link>
            </CardContent>
          </Card>
        </PageContainer>
      </main>
    </AppShell>
  );
}
