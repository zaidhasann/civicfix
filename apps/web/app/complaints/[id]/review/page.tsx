'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { AppShell, PageContainer } from '../../../../components/layout/app-shell';
import { Badge, type BadgeVariant } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { ErrorState } from '../../../../components/ui/error-state';
import { LoadingState } from '../../../../components/ui/loading-state';
import { apiFetch, apiPost, ApiError } from '../../../../lib/api';
import { Modal } from '../../../../components/ui/modal';

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
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [initialDraft, setInitialDraft] = useState({ subject: '', body: '', recipientEmail: '' });
  const [request, setRequest] = useState<'save' | 'regenerate' | 'reject' | 'approve' | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);

  const loadComplaint = useCallback(async () => {
    try {
      setError(null);
      const loaded = await apiFetch<Complaint>(`/complaints/${complaintId}`);
      setComplaint(loaded);
      const draft = {
        subject: loaded.aiDraft?.subject ?? '',
        body: loaded.aiDraft?.body ?? '',
        recipientEmail: loaded.recipient.email,
      };
      setSubject(draft.subject);
      setBody(draft.body);
      setRecipientEmail(draft.recipientEmail);
      setInitialDraft(draft);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'We could not load this report for review.',
      );
    }
  }, [complaintId]);

  const dirty =
    subject !== initialDraft.subject ||
    body !== initialDraft.body ||
    recipientEmail !== initialDraft.recipientEmail;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail);
  const busy = request !== null;

  async function saveDraft(): Promise<boolean> {
    if (!emailValid || !subject.trim() || !body.trim()) return false;
    setRequest('save');
    try {
      const updated = await apiFetch<Complaint>(`/complaints/${complaintId}/draft`, {
        method: 'PATCH',
        body: JSON.stringify({ subject, body, recipientEmail }),
      });
      setComplaint(updated);
      setInitialDraft({ subject, body, recipientEmail });
      setError(null);
      return true;
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not save changes.');
    } finally {
      setRequest(null);
    }
    return false;
  }

  async function regenerate() {
    setRequest('regenerate');
    try {
      const updated = await apiPost<Complaint>(`/complaints/${complaintId}/regenerate`);
      setComplaint(updated);
      setSubject(updated.aiDraft?.subject ?? '');
      setBody(updated.aiDraft?.body ?? '');
      setInitialDraft({
        subject: updated.aiDraft?.subject ?? '',
        body: updated.aiDraft?.body ?? '',
        recipientEmail: updated.recipient.email,
      });
      setError(null);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError ? requestError.message : 'Could not regenerate the draft.',
      );
    } finally {
      setRequest(null);
    }
  }

  async function reject() {
    setRequest('reject');
    try {
      await apiPost(`/complaints/${complaintId}/reject`);
      setRejectOpen(false);
      await loadComplaint();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError ? requestError.message : 'Could not reject this report.',
      );
    } finally {
      setRequest(null);
    }
  }

  async function approve() {
    if (dirty) {
      if (!(await saveDraft())) return;
    }
    setRequest('approve');
    try {
      await apiPost(`/complaints/${complaintId}/approve`);
      await loadComplaint();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError ? requestError.message : 'Could not approve this report.',
      );
    } finally {
      setRequest(null);
    }
  }

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
                    <label
                      className="block text-sm font-semibold text-text"
                      htmlFor="recipient-email"
                    >
                      Recipient email
                    </label>
                    <input
                      className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                      id="recipient-email"
                      onChange={(event) => setRecipientEmail(event.target.value)}
                      type="email"
                      value={recipientEmail}
                    />
                    {!emailValid && (
                      <p className="mt-1 text-xs text-danger">Enter a valid email.</p>
                    )}
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
                          <label className="block">
                            <span className="font-semibold text-neutral-600">Subject</span>
                            <input
                              className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm"
                              disabled={busy}
                              onChange={(event) => setSubject(event.target.value)}
                              value={subject}
                            />
                          </label>
                        </div>
                        <div className="whitespace-pre-wrap break-words pt-5 text-sm leading-7 text-text">
                          <textarea
                            className="min-h-64 w-full resize-y rounded border border-border bg-surface p-2 text-sm leading-7 text-text"
                            disabled={busy}
                            onChange={(event) => setBody(event.target.value)}
                            value={body}
                          />
                        </div>
                      </article>
                    ) : (
                      <p className="p-5 text-sm text-neutral-600">
                        The email draft is not ready yet.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <div className="flex flex-wrap gap-3">
                  <Button
                    disabled={busy || !dirty || !emailValid}
                    loading={request === 'save'}
                    onClick={() => void saveDraft()}
                  >
                    Save changes
                  </Button>
                  <Button
                    disabled={busy}
                    loading={request === 'regenerate'}
                    onClick={() => void regenerate()}
                    variant="secondary"
                  >
                    Regenerate
                  </Button>
                  <Button disabled={busy} onClick={() => setRejectOpen(true)} variant="danger">
                    Reject
                  </Button>
                  <Button
                    disabled={busy || !emailValid || !subject.trim() || !body.trim()}
                    loading={request === 'approve'}
                    onClick={() => void approve()}
                  >
                    Approve and Send
                  </Button>
                </div>
                <Modal
                  description="Rejecting this report will stop it from being sent."
                  onClose={() => setRejectOpen(false)}
                  open={rejectOpen}
                  title="Reject this report?"
                >
                  <div className="flex justify-end gap-3">
                    <Button
                      disabled={busy}
                      onClick={() => setRejectOpen(false)}
                      variant="secondary"
                    >
                      Keep report
                    </Button>
                    <Button
                      disabled={busy}
                      loading={request === 'reject'}
                      onClick={() => void reject()}
                      variant="danger"
                    >
                      Reject report
                    </Button>
                  </div>
                </Modal>
              </>
            )}
          </div>
        </PageContainer>
      </main>
    </AppShell>
  );
}
