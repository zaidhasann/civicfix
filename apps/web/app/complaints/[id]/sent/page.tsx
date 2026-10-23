'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { AppShell, PageContainer } from '../../../../components/layout/app-shell';
import { Button } from '../../../../components/ui/button';
import { Card, CardContent } from '../../../../components/ui/card';
import { ErrorState } from '../../../../components/ui/error-state';
import { LoadingState } from '../../../../components/ui/loading-state';
import { apiFetch, ApiError } from '../../../../lib/api';

interface Complaint {
  status: string;
  recipient: {
    department: string;
  };
}

const followUpSteps = [
  {
    title: 'Your report was sent',
    description: 'The relevant municipal department has received your complaint.',
  },
  {
    title: 'The department reviews it',
    description: 'They may inspect the issue and decide what action is needed.',
  },
  {
    title: 'You can follow up',
    description: 'Keep your complaint ID handy when checking for updates or replying.',
  },
] as const;

export default function ComplaintSentPage() {
  const params = useParams<{ id: string }>();
  const complaintId = params.id;
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareState, setShareState] = useState<'idle' | 'shared' | 'copied'>('idle');

  const loadComplaint = useCallback(async () => {
    try {
      setError(null);
      const loaded = await apiFetch<Complaint>(`/complaints/${complaintId}`);
      if (loaded.status !== 'sent') {
        setError('This confirmation is only available after the report has been sent.');
        return;
      }
      setComplaint(loaded);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'We could not load your sent confirmation.',
      );
    }
  }, [complaintId]);

  useEffect(() => {
    void loadComplaint();
  }, [loadComplaint]);

  async function shareComplaint() {
    const shareUrl = window.location.href;
    const shareData = {
      title: 'CivicFix complaint',
      text: `CivicFix complaint ${complaintId}`,
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setShareState('shared');
        return;
      }
      await copyLink(shareUrl);
      setShareState('copied');
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return;
      setError('We could not share this confirmation. Please try copying the link manually.');
    }
  }

  async function copyLink(url: string) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return;
    }

    const input = document.createElement('textarea');
    input.value = url;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    if (!copied) throw new Error('Copy failed');
  }

  return (
    <AppShell>
      <main>
        <PageContainer>
          <div className="mx-auto max-w-2xl">
            {error ? (
              <ErrorState message={error} onRetry={() => void loadComplaint()} />
            ) : !complaint ? (
              <Card>
                <LoadingState label="Loading your confirmation" />
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <CardContent className="p-6 sm:p-10">
                  <div className="text-center">
                    <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 animate-ping rounded-full bg-success/20 motion-reduce:animate-none"
                      />
                      <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-success text-white shadow-lg shadow-success/20">
                        <svg aria-hidden="true" className="h-8 w-8" fill="none" viewBox="0 0 24 24">
                          <path
                            d="m5 12 4.5 4.5L19 7"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2.5"
                          />
                        </svg>
                      </span>
                    </div>
                    <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-success">
                      Sent successfully
                    </p>
                    <h1 className="mt-2 text-3xl font-bold tracking-tight text-text">
                      Your complaint is on its way
                    </h1>
                    <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-neutral-600">
                      We sent your report to {complaint.recipient.department}. Save your complaint
                      ID so you can track it later.
                    </p>
                  </div>

                  <div className="mt-8 rounded-lg border border-border bg-neutral-50 p-4 text-center">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Complaint ID
                    </p>
                    <p className="mt-2 break-all font-mono text-sm font-semibold text-text">
                      {complaintId}
                    </p>
                  </div>

                  <section aria-labelledby="next-steps-heading" className="mt-8">
                    <h2 className="text-lg font-semibold text-text" id="next-steps-heading">
                      What happens next
                    </h2>
                    <ol className="mt-5 space-y-5">
                      {followUpSteps.map((step, index) => (
                        <li className="relative flex gap-4" key={step.title}>
                          {index < followUpSteps.length - 1 ? (
                            <span
                              aria-hidden="true"
                              className="absolute left-4 top-9 h-8 w-px bg-border"
                            />
                          ) : null}
                          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                            {index + 1}
                          </span>
                          <div>
                            <h3 className="font-semibold text-text">{step.title}</h3>
                            <p className="mt-1 text-sm leading-6 text-neutral-600">
                              {step.description}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </section>

                  <div className="mt-8 flex flex-wrap gap-3">
                    <Link
                      className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                      href="/dashboard"
                    >
                      Track complaint
                    </Link>
                    <Button onClick={() => void shareComplaint()} variant="secondary">
                      {shareState === 'shared'
                        ? 'Shared'
                        : shareState === 'copied'
                          ? 'Link copied'
                          : 'Share confirmation'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </PageContainer>
      </main>
    </AppShell>
  );
}
