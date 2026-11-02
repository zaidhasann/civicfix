'use client';

import { useState } from 'react';

import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Textarea } from '../ui/textarea';
import { ApiError, apiFetch, apiPost } from '../../lib/api';

export interface FollowUpSuggestion {
  suggestedAt: string;
  draftSubject: string;
  draftBody: string;
  notificationSentAt: string;
  dismissedAt?: string;
}

interface FollowUpBannerProps {
  complaintId: string;
  suggestion: FollowUpSuggestion;
  onChanged: () => void;
}

export function FollowUpBanner({ complaintId, suggestion, onChanged }: FollowUpBannerProps) {
  const [subject, setSubject] = useState(suggestion.draftSubject);
  const [body, setBody] = useState(suggestion.draftBody);
  const [request, setRequest] = useState<'approve' | 'dismiss' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = request !== null;

  async function approve() {
    if (!subject.trim() || !body.trim()) return;
    setRequest('approve');
    setError(null);
    try {
      await apiFetch(`/complaints/${complaintId}/follow-up`, {
        method: 'PATCH',
        body: JSON.stringify({ subject, body }),
      });
      await apiPost(`/complaints/${complaintId}/follow-up/prepare-approval`);
      const sent = await apiPost<{ status: string }>(`/complaints/${complaintId}/approve`);
      if (sent.status !== 'sent') throw new Error('The follow-up was not confirmed as sent.');
      onChanged();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Could not approve and send the follow-up.',
      );
    } finally {
      setRequest(null);
    }
  }

  async function dismiss() {
    setRequest('dismiss');
    setError(null);
    try {
      await apiPost(`/complaints/${complaintId}/follow-up/dismiss`);
      onChanged();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Could not dismiss this reminder.',
      );
    } finally {
      setRequest(null);
    }
  }

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader>
        <CardTitle>Follow-up reminder suggested</CardTitle>
        <p className="text-sm leading-6 text-neutral-600">
          This complaint has not been acknowledged. Review the reminder below before sending it.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="block text-sm font-semibold text-text" htmlFor={`${complaintId}-subject`}>
          Subject
          <input
            className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 font-normal text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            disabled={busy}
            id={`${complaintId}-subject`}
            onChange={(event) => setSubject(event.target.value)}
            value={subject}
          />
        </label>
        <Textarea
          disabled={busy}
          label="Reminder draft"
          onChange={(event) => setBody(event.target.value)}
          value={body}
        />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={busy || !subject.trim() || !body.trim()}
            loading={request === 'approve'}
            onClick={() => void approve()}
          >
            Approve and send
          </Button>
          <Button
            disabled={busy}
            loading={request === 'dismiss'}
            onClick={() => void dismiss()}
            variant="secondary"
          >
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
