'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ProtectedRoute } from '../../components/auth/protected-route';
import { AppShell, PageContainer } from '../../components/layout/app-shell';
import { Badge, type BadgeVariant } from '../../components/ui/badge';
import { Card } from '../../components/ui/card';
import { EmptyState } from '../../components/ui/empty-state';
import { ErrorState } from '../../components/ui/error-state';
import { LoadingState } from '../../components/ui/loading-state';
import { apiFetch, ApiError } from '../../lib/api';

type ComplaintStatus =
  'draft' | 'pending_approval' | 'sent' | 'acknowledged' | 'resolved' | 'rejected';
type ComplaintCategory =
  'pothole' | 'streetlight' | 'waste' | 'water' | 'traffic' | 'public-safety' | 'other';

interface ComplaintListItem {
  id: string;
  status: ComplaintStatus;
  category: ComplaintCategory;
  severity: number;
  address: string;
  photoUrl?: string;
  recipient: {
    department: string;
  };
  createdAt: string;
  sentAt?: string;
}

interface ComplaintListResponse {
  items: ComplaintListItem[];
  nextCursor: string | null;
}

const statusFilters: Array<{ label: string; value: ComplaintStatus | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Needs review', value: 'pending_approval' },
  { label: 'Sent', value: 'sent' },
  { label: 'Acknowledged', value: 'acknowledged' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'Drafts', value: 'draft' },
  { label: 'Rejected', value: 'rejected' },
];

const categoryFilters: Array<{ label: string; value: ComplaintCategory | 'all' }> = [
  { label: 'Every category', value: 'all' },
  { label: 'Potholes', value: 'pothole' },
  { label: 'Streetlights', value: 'streetlight' },
  { label: 'Waste', value: 'waste' },
  { label: 'Water', value: 'water' },
  { label: 'Traffic', value: 'traffic' },
  { label: 'Public safety', value: 'public-safety' },
  { label: 'Other', value: 'other' },
];

const progressSteps: Array<{ label: string; status: ComplaintStatus }> = [
  { label: 'Sent', status: 'sent' },
  { label: 'Acknowledged', status: 'acknowledged' },
  { label: 'Resolved', status: 'resolved' },
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

function progressIndex(status: ComplaintStatus): number {
  if (status === 'resolved') return 2;
  if (status === 'acknowledged') return 1;
  if (status === 'sent') return 0;
  return -1;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  }).format(new Date(value));
}

function ComplaintProgress({ status }: { status: ComplaintStatus }) {
  const currentIndex = progressIndex(status);

  return (
    <ol aria-label="Complaint progress" className="flex items-start">
      {progressSteps.map((step, index) => {
        const complete = currentIndex >= index;
        const active = currentIndex === index;
        return (
          <li className="relative flex min-w-0 flex-1 flex-col items-center" key={step.status}>
            {index > 0 ? (
              <span
                aria-hidden="true"
                className={`absolute right-1/2 top-3 h-0.5 w-full ${
                  currentIndex >= index ? 'bg-success' : 'bg-border'
                }`}
              />
            ) : null}
            <span
              aria-current={active ? 'step' : undefined}
              className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold ${
                complete
                  ? 'border-success bg-success text-white'
                  : 'border-border bg-surface text-neutral-400'
              }`}
            >
              {complete ? '✓' : index + 1}
            </span>
            <span
              className={`mt-2 text-center text-xs ${
                active || complete ? 'font-semibold text-text' : 'text-neutral-500'
              }`}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ComplaintCard({ complaint }: { complaint: ComplaintListItem }) {
  return (
    <Link
      className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      href={`/complaints/${complaint.id}`}
    >
      <Card className="h-full transition hover:-translate-y-0.5 hover:shadow-lg">
        <div className="flex gap-4 p-4 sm:p-5">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md border border-border bg-neutral-100 sm:h-24 sm:w-24">
            {complaint.photoUrl ? (
              <img
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
                src={complaint.photoUrl}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-neutral-500">
                No photo
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  {complaint.category}
                </p>
                <h2 className="mt-1 truncate font-semibold text-text">{complaint.address}</h2>
              </div>
              <Badge variant={statusVariant(complaint.status)}>
                {statusLabel(complaint.status)}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-neutral-600">{complaint.recipient.department}</p>
            <p className="mt-1 text-xs text-neutral-500">
              Reported {formatDate(complaint.createdAt)}
            </p>
          </div>
        </div>
        <div className="border-t border-border px-4 py-4 sm:px-5">
          {complaint.status === 'rejected' || complaint.status === 'draft' ? (
            <p className="text-xs text-neutral-500">
              {complaint.status === 'draft'
                ? 'Complete this draft to submit it.'
                : 'This report was not sent.'}
            </p>
          ) : (
            <ComplaintProgress status={complaint.status} />
          )}
        </div>
      </Card>
    </Link>
  );
}

function ComplaintsContent() {
  const [status, setStatus] = useState<ComplaintStatus | 'all'>('all');
  const [category, setCategory] = useState<ComplaintCategory | 'all'>('all');
  const [items, setItems] = useState<ComplaintListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const requestIdRef = useRef(0);

  const loadComplaints = useCallback(
    async (cursor: string | null, replace: boolean) => {
      const requestId = replace ? requestIdRef.current + 1 : requestIdRef.current;
      if (replace) requestIdRef.current = requestId;
      if (replace) setLoading(true);
      else setLoadingMore(true);
      try {
        const params = new URLSearchParams({ limit: '20', sort: 'createdAt_desc' });
        if (status !== 'all') params.set('status', status);
        if (category !== 'all') params.set('category', category);
        if (cursor) params.set('cursor', cursor);
        const result = await apiFetch<ComplaintListResponse>(`/complaints/mine?${params}`);
        if (replace && requestId !== requestIdRef.current) return;
        setItems((current) => (replace ? result.items : [...current, ...result.items]));
        setNextCursor(result.nextCursor);
        setError(null);
      } catch (requestError) {
        if (replace) {
          setError(
            requestError instanceof ApiError
              ? requestError.message
              : 'We could not load your complaints.',
          );
        }
      } finally {
        if (replace) setLoading(false);
        else setLoadingMore(false);
      }
    },
    [category, status],
  );

  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    void loadComplaints(null, true);
  }, [category, loadComplaints, status]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !nextCursor || loading || loadingMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && nextCursor) void loadComplaints(nextCursor, false);
      },
      { rootMargin: '320px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadComplaints, loading, loadingMore, nextCursor]);

  const hasFilters = status !== 'all' || category !== 'all';

  return (
    <AppShell>
      <main>
        <PageContainer>
          <div className="space-y-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-primary">
                Your activity
              </p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight text-text">My complaints</h1>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                Track every report from submission through resolution.
              </p>
            </div>

            <div className="space-y-3" aria-label="Complaint filters">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {statusFilters.map((filter) => (
                  <button
                    className={`shrink-0 rounded-full border px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      status === filter.value
                        ? 'border-primary bg-primary text-white'
                        : 'border-border bg-surface text-neutral-600 hover:border-primary hover:text-primary'
                    }`}
                    key={filter.value}
                    onClick={() => setStatus(filter.value)}
                    type="button"
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              <label className="block max-w-xs text-sm font-semibold text-text" htmlFor="category">
                Category
                <select
                  className="mt-2 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm font-normal text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  id="category"
                  onChange={(event) => setCategory(event.target.value as ComplaintCategory | 'all')}
                  value={category}
                >
                  {categoryFilters.map((filter) => (
                    <option key={filter.value} value={filter.value}>
                      {filter.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {error ? (
              <ErrorState message={error} onRetry={() => void loadComplaints(null, true)} />
            ) : loading ? (
              <Card>
                <LoadingState label="Loading your complaints" />
              </Card>
            ) : items.length === 0 ? (
              <EmptyState
                actionLabel={hasFilters ? undefined : 'Report an issue'}
                description={
                  hasFilters
                    ? 'No complaints match these filters.'
                    : 'Reports you submit will appear here so you can follow their progress.'
                }
                onAction={hasFilters ? undefined : () => (window.location.href = '/report')}
                title={hasFilters ? 'No matching complaints' : 'No complaints yet'}
              />
            ) : (
              <>
                <div className="grid gap-4 lg:grid-cols-2">
                  {items.map((complaint) => (
                    <ComplaintCard complaint={complaint} key={complaint.id} />
                  ))}
                </div>
                <div className="min-h-12" ref={loadMoreRef}>
                  {loadingMore ? <LoadingState className="min-h-12" label="Loading more" /> : null}
                </div>
              </>
            )}
          </div>
        </PageContainer>
      </main>
    </AppShell>
  );
}

export default function ComplaintsPage() {
  return (
    <ProtectedRoute>
      <ComplaintsContent />
    </ProtectedRoute>
  );
}
