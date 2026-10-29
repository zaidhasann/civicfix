'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ProtectedRoute } from '../../../components/auth/protected-route';
import { AppShell, PageContainer } from '../../../components/layout/app-shell';
import { Badge, type BadgeVariant } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { ErrorState } from '../../../components/ui/error-state';
import { LoadingState } from '../../../components/ui/loading-state';
import { apiFetch, ApiError } from '../../../lib/api';

type ComplaintStatus =
  'draft' | 'pending_approval' | 'sent' | 'acknowledged' | 'resolved' | 'rejected';

interface StatusHistoryEntry {
  status: ComplaintStatus;
  changedAt: string;
  note?: string;
}

interface Complaint {
  _id?: string;
  id?: string;
  status: ComplaintStatus;
  category: string;
  severity: number;
  description: string;
  address: string;
  photoUrl?: string;
  location: {
    coordinates: [number, number];
  };
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
  finalEmail?: string;
  createdAt: string;
  sentAt?: string;
  statusHistory: StatusHistoryEntry[];
}

const statusOrder: ComplaintStatus[] = [
  'draft',
  'pending_approval',
  'sent',
  'acknowledged',
  'resolved',
];

function statusLabel(status: ComplaintStatus): string {
  return {
    draft: 'Draft',
    pending_approval: 'Needs review',
    sent: 'Sent',
    acknowledged: 'Acknowledged',
    resolved: 'Resolved',
    rejected: 'Rejected',
  }[status];
}

function statusVariant(status: ComplaintStatus): BadgeVariant {
  if (status === 'resolved' || status === 'acknowledged') return 'success';
  if (status === 'sent') return 'info';
  if (status === 'pending_approval') return 'warning';
  if (status === 'rejected') return 'danger';
  return 'neutral';
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function mapUrl(coordinates: [number, number]): string {
  const [longitude, latitude] = coordinates;
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`;
}

function statusPosition(status: ComplaintStatus): number {
  if (status === 'rejected') return -1;
  return statusOrder.indexOf(status);
}

function ComplaintTimeline({
  currentStatus,
  history,
}: {
  currentStatus: ComplaintStatus;
  history: StatusHistoryEntry[];
}) {
  const entries = useMemo(() => {
    const byStatus = new Map(history.map((entry) => [entry.status, entry]));
    return statusOrder.map((status) => byStatus.get(status) ?? { status });
  }, [history]);
  const currentPosition = statusPosition(currentStatus);

  return (
    <ol aria-label="Complaint status timeline" className="space-y-0">
      {entries.map((entry, index) => {
        const complete = index <= currentPosition;
        const current = entry.status === currentStatus;
        const hasTimestamp = 'changedAt' in entry;
        return (
          <li className="relative flex gap-4 pb-7 last:pb-0" key={entry.status}>
            {index < entries.length - 1 ? (
              <span
                aria-hidden="true"
                className={`absolute left-3 top-7 h-full w-px ${
                  index < currentPosition ? 'bg-success' : 'bg-border'
                }`}
              />
            ) : null}
            <span
              aria-hidden="true"
              className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                complete
                  ? 'border-success bg-success text-white'
                  : 'border-border bg-surface text-neutral-400'
              }`}
            >
              {complete ? '✓' : index + 1}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className={current ? 'font-semibold text-text' : 'text-neutral-700'}>
                {statusLabel(entry.status)}
              </p>
              {hasTimestamp ? (
                <p className="mt-1 text-xs text-neutral-500">
                  {formatDate((entry as StatusHistoryEntry).changedAt)}
                </p>
              ) : (
                <p className="mt-1 text-xs text-neutral-500">Not reached yet</p>
              )}
              {'note' in entry && entry.note ? (
                <p className="mt-1 text-sm leading-6 text-neutral-600">{entry.note}</p>
              ) : null}
            </div>
          </li>
        );
      })}
      {currentStatus === 'rejected' ? (
        <li className="mt-7 flex gap-4 border-t border-border pt-7">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-danger text-xs font-bold text-white">
            !
          </span>
          <div>
            <p className="font-semibold text-danger">Rejected</p>
            <p className="mt-1 text-sm text-neutral-600">
              This report was stopped before it was sent.
            </p>
          </div>
        </li>
      ) : null}
    </ol>
  );
}

function ComplaintDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const complaintId = params.id;
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadComplaint = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const loaded = await apiFetch<Complaint>(`/complaints/${complaintId}`);
      setComplaint(loaded);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'We could not load this complaint.',
      );
    } finally {
      setLoading(false);
    }
  }, [complaintId]);

  useEffect(() => {
    void loadComplaint();
  }, [loadComplaint]);

  if (loading) {
    return (
      <Card>
        <LoadingState label="Loading complaint" />
      </Card>
    );
  }

  if (error || !complaint) {
    return (
      <ErrorState message={error ?? 'Complaint not found.'} onRetry={() => void loadComplaint()} />
    );
  }

  const complaintKey = complaint._id ?? complaint.id ?? complaintId;
  const isSent = ['sent', 'acknowledged', 'resolved'].includes(complaint.status);
  const followUpSubject = encodeURIComponent(`Follow-up on CivicFix complaint ${complaintKey}`);
  const followUpBody = encodeURIComponent(
    `Hello,\n\nI am following up on CivicFix complaint ${complaintKey} regarding ${complaint.address}.\n\nThank you.`,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link className="text-sm font-semibold text-primary hover:underline" href="/complaints">
            ← My complaints
          </Link>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-text">Complaint details</h1>
          <p className="mt-2 break-all font-mono text-xs text-neutral-500">ID: {complaintKey}</p>
        </div>
        <Badge variant={statusVariant(complaint.status)}>{statusLabel(complaint.status)}</Badge>
      </div>

      <Card className="overflow-hidden">
        {complaint.photoUrl ? (
          <img
            alt="Photo attached to this complaint"
            className="max-h-[28rem] w-full bg-neutral-100 object-contain"
            src={complaint.photoUrl}
          />
        ) : (
          <div className="flex h-48 items-center justify-center bg-neutral-100 text-sm text-neutral-500">
            No photo attached
          </div>
        )}
        <CardContent className="space-y-3 p-5 sm:p-6">
          <div className="flex flex-wrap gap-2">
            <Badge variant="info">{complaint.category}</Badge>
            <Badge variant={complaint.severity >= 4 ? 'danger' : 'warning'}>
              Severity {complaint.severity}/5
            </Badge>
          </div>
          <p className="text-lg font-semibold text-text">{complaint.address}</p>
          <p className="text-sm leading-6 text-neutral-600">{complaint.description}</p>
          <p className="text-xs text-neutral-500">Reported {formatDate(complaint.createdAt)}</p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Status timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ComplaintTimeline currentStatus={complaint.status} history={complaint.statusHistory} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recipient</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-semibold text-text">{complaint.recipient.department}</p>
            <p className="break-all text-neutral-600">{complaint.recipient.email}</p>
            <p className="text-neutral-600">
              {complaint.recipient.municipality} · {complaint.recipient.ward}
            </p>
          </CardContent>
        </Card>
      </div>

      {isSent ? (
        <Card>
          <CardHeader>
            <CardTitle>Sent email</CardTitle>
            <p className="text-sm text-neutral-600">
              {complaint.sentAt
                ? `Sent ${formatDate(complaint.sentAt)}`
                : 'Email sent successfully'}
            </p>
          </CardHeader>
          <CardContent>
            <article className="rounded-md border border-border bg-neutral-50 p-4">
              <p className="border-b border-border pb-3 text-sm font-semibold text-text">
                {complaint.aiDraft?.subject ?? 'CivicFix complaint'}
              </p>
              <p className="whitespace-pre-wrap pt-4 text-sm leading-7 text-neutral-700">
                {complaint.finalEmail ?? complaint.aiDraft?.body ?? 'Email content unavailable.'}
              </p>
            </article>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Email</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-neutral-600">
            {complaint.status === 'draft' || complaint.status === 'pending_approval' ? (
              <p>This complaint has not been sent yet.</p>
            ) : (
              <p>This complaint was not sent.</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Location</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative flex h-48 items-center justify-center overflow-hidden rounded-md border border-border bg-primary/5">
            <div
              aria-hidden="true"
              className="absolute inset-0 opacity-30"
              style={{
                backgroundImage:
                  'linear-gradient(30deg, transparent 47%, hsl(var(--color-primary)) 48%, transparent 50%), linear-gradient(120deg, transparent 47%, hsl(var(--color-success)) 48%, transparent 50%)',
                backgroundSize: '56px 56px',
              }}
            />
            <div className="relative rounded-full border-4 border-white bg-primary p-3 text-white shadow-lg">
              <span aria-hidden="true" className="block h-3 w-3 rounded-full bg-white" />
            </div>
            <a
              className="absolute bottom-3 right-3 rounded-md bg-surface px-3 py-2 text-xs font-semibold text-primary shadow hover:underline"
              href={mapUrl(complaint.location.coordinates)}
              rel="noreferrer"
              target="_blank"
            >
              Open map
            </a>
          </div>
          <p className="mt-3 text-sm text-neutral-600">{complaint.address}</p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        {complaint.status === 'draft' || complaint.status === 'pending_approval' ? (
          <Button onClick={() => router.push(`/complaints/${complaintId}/review`)}>
            Review complaint
          </Button>
        ) : null}
        {isSent ? (
          <a
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-semibold text-text transition hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            href={`mailto:${complaint.recipient.email}?subject=${followUpSubject}&body=${followUpBody}`}
          >
            Follow up
          </a>
        ) : null}
        {complaint.status === 'acknowledged' ? (
          <Button disabled title="Resolution updates are not connected yet" variant="secondary">
            Mark resolved
          </Button>
        ) : null}
        {complaint.status === 'resolved' ? (
          <Badge className="self-center" variant="success">
            Resolution confirmed
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

export default function ComplaintDetailPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <main>
          <PageContainer>
            <ComplaintDetailContent />
          </PageContainer>
        </main>
      </AppShell>
    </ProtectedRoute>
  );
}
