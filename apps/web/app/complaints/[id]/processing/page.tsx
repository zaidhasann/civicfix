'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { apiFetch, ApiError } from '../../../../lib/api';
import { AppShell, PageContainer } from '../../../../components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Button } from '../../../../components/ui/button';

type ComplaintStatus =
  'draft' | 'pending_approval' | 'sent' | 'acknowledged' | 'resolved' | 'rejected';

interface ComplaintResponse {
  status: ComplaintStatus;
}

const steps = ['Analyzing photo', 'Finding your ward', 'Drafting email'];
const pollIntervalMs = 3000;

function statusStep(status: ComplaintStatus, tick: number): number {
  if (
    status === 'pending_approval' ||
    status === 'sent' ||
    status === 'acknowledged' ||
    status === 'resolved'
  ) {
    return steps.length;
  }
  return Math.min(tick % steps.length, steps.length - 1);
}

export default function ComplaintProcessingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const complaintId = params.id;
  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const checkStatus = useCallback(async () => {
    setIsRetrying(true);
    try {
      const complaint = await apiFetch<ComplaintResponse>(`/complaints/${complaintId}`);
      setError(null);
      if (complaint.status === 'pending_approval') {
        router.replace(`/complaints/${complaintId}/review`);
        return true;
      }
      if (complaint.status === 'rejected') {
        setError('This report could not be processed. Please try again.');
        return true;
      }
      return false;
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'We could not check your report status. Check your connection and retry.',
      );
      return false;
    } finally {
      setIsRetrying(false);
    }
  }, [complaintId, router]);

  useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      const finished = await checkStatus();
      if (!cancelled && !finished) timeout = setTimeout(poll, pollIntervalMs);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [checkStatus]);

  useEffect(() => {
    const interval = window.setInterval(() => setActiveStep((step) => step + 1), pollIntervalMs);
    return () => window.clearInterval(interval);
  }, []);

  const currentStep = statusStep('draft', activeStep);

  return (
    <AppShell>
      <main>
        <PageContainer>
          <Card className="mx-auto max-w-2xl">
            <CardHeader>
              <CardTitle>Preparing your report</CardTitle>
              <p className="text-sm leading-6 text-neutral-600">
                Keep this page open while we prepare your report for review.
              </p>
            </CardHeader>
            <CardContent>
              <ol aria-label="Report processing progress" className="space-y-4">
                {steps.map((step, index) => {
                  const complete = index < currentStep;
                  const active = index === currentStep;
                  return (
                    <li className="flex items-center gap-3" key={step}>
                      <span
                        aria-hidden="true"
                        className={[
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold',
                          complete
                            ? 'border-success bg-success text-white'
                            : active
                              ? 'border-primary text-primary'
                              : 'border-border text-neutral-500',
                        ].join(' ')}
                      >
                        {complete ? '✓' : index + 1}
                      </span>
                      <span
                        className={active ? 'font-semibold text-text' : 'text-neutral-600'}
                        aria-current={active ? 'step' : undefined}
                      >
                        {step}
                      </span>
                      {active && (
                        <span
                          aria-hidden="true"
                          className="ml-auto h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent motion-reduce:animate-none"
                        />
                      )}
                    </li>
                  );
                })}
              </ol>
              <p aria-live="polite" className="mt-6 text-sm text-neutral-600">
                {error ?? 'We will move you to approval as soon as your draft is ready.'}
              </p>
              {error && (
                <Button
                  className="mt-4"
                  loading={isRetrying}
                  loadingLabel="Retrying"
                  onClick={() => void checkStatus()}
                  type="button"
                >
                  Retry
                </Button>
              )}
              <div className="mt-6 rounded-lg bg-primary/10 p-4 text-sm text-text">
                You can safely leave this page and return to it later.
              </div>
            </CardContent>
          </Card>
        </PageContainer>
      </main>
    </AppShell>
  );
}
