'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { AppShell, PageContainer } from '../../../../components/layout/app-shell';
import { Badge, type BadgeVariant } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { ErrorState } from '../../../../components/ui/error-state';
import { LoadingState } from '../../../../components/ui/loading-state';
import { apiFetch, ApiError } from '../../../../lib/api';

interface Complaint {
  photoUrl?: string;
  category: string;
  severity: number;
  recipient: {
    department: string;
    email: string;
    ward: string;
    municipality: string;
  };
  aiDraft?: {
    subject: string;
    body: string;
  };
  status: string;
}

function severityVariant(severity: number): BadgeVariant {
  if (severity >= 4) return 'danger';
  if (severity >= 3) return 'warning';
  return 'info';
}

export default function ComplaintReviewPage() {
  const params = useParams<{ id: string }>();
  const complaintId = params.id;
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadComplaint = useCallback(async () => {
    try {
      setError(null);
      setComplaint(await apiFetch<Complaint>(`/complaints/${complaintId}`));
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'We could not load this report for review.',
      );
    }
  }, [complaintId]);

  useEffect(() => {
    void loadComplaint();
  }, [loadComplaint]);

  return (
    <AppShell>
      <main>
        <PageContainer>
          <div className="mx-auto max-w-3xl space-y-5">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-primary">
                Review before sending
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-text sm:text-3xl">
                Check your complaint
              </h1>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                This email has not been sent yet. Review the details and draft before approving it.
              </p>
            </div>

            {error ? (
              <ErrorState message={error} onRetry={() => void loadComplaint()} />
            ) : !complaint ? (
              <Card>
                <LoadingState label="Loading your complaint" />
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Report details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {complaint.photoUrl ? (
                      <div className="overflow-hidden rounded-lg border border-border bg-neutral-100">
                        <img
                          alt="Photo attached to this complaint"
                          className="max-h-72 w-full object-contain"
                          src={complaint.photoUrl}
                        />
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-neutral-600">
                        No photo attached
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="info">{complaint.category}</Badge>
                      <Badge variant={severityVariant(complaint.severity)}>
                        Severity {complaint.severity}/5
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Resolved recipient</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <p className="font-semibold text-text">{complaint.recipient.department}</p>
                    <p className="break-all text-neutral-600">{complaint.recipient.email}</p>
                    <p className="text-neutral-600">
                      {complaint.recipient.municipality} · {complaint.recipient.ward}
                    </p>
                  </CardContent>
                </Card>

                <Card className="overflow-hidden">
                  <CardHeader className="border-b border-border bg-neutral-50">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <CardTitle>Email preview</CardTitle>
                        <p className="mt-1 text-sm text-neutral-600">Not sent yet</p>
                      </div>
                      <Badge variant="warning">Not sent yet</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {complaint.aiDraft ? (
                      <article className="max-h-[min(60vh,32rem)] overflow-y-auto overscroll-contain p-5 sm:p-7">
                        <div className="space-y-2 border-b border-border pb-5 text-sm">
                          <p>
                            <span className="font-semibold text-neutral-600">To:</span>{' '}
                            <span className="break-all">{complaint.recipient.email}</span>
                          </p>
                          <p>
                            <span className="font-semibold text-neutral-600">Subject:</span>{' '}
                            {complaint.aiDraft.subject}
                          </p>
                        </div>
                        <div className="whitespace-pre-wrap break-words pt-5 text-sm leading-7 text-text">
                          {complaint.aiDraft.body}
                        </div>
                      </article>
                    ) : (
                      <p className="p-5 text-sm text-neutral-600">
                        The email draft is not ready yet.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Button className="w-full sm:w-auto" disabled>
                  Approve and send
                </Button>
              </>
            )}
          </div>
        </PageContainer>
      </main>
    </AppShell>
  );
}
