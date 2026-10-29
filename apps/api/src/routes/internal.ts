import { Router, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';

import { requireAgentSecret } from '../middleware/agent-auth.js';
import { ComplaintModel, aiIssueTypes } from '../models/complaint.js';
import { env } from '../config/env.js';

const classificationSchema = z.object({
  issueType: z.enum(aiIssueTypes),
  severity: z.number().int().min(1).max(5),
  confidence: z.number().min(0).max(1),
  visibleDetails: z.string().trim().min(1).max(2000),
  safetyRisk: z.boolean(),
});

const aiResultsSchema = z.object({
  classification: classificationSchema,
  recipient: z.object({
    department: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(320),
    ward: z.string().trim().min(1).max(200),
    municipality: z.string().trim().min(1).max(200),
  }),
  draft: z.object({
    subject: z.string().trim().min(1).max(500),
    body: z.string().trim().min(1).max(20000),
  }),
});
const inboundEmailSchema = z.object({
  to: z.string().trim().email(),
  from: z.string().trim().email(),
  subject: z.string().trim().min(1).max(500),
  text: z.string().trim().min(1).max(50000),
  html: z.string().max(100000).optional(),
  messageId: z.string().trim().max(500).optional(),
  receivedAt: z.coerce.date().optional(),
});

class InternalResultsError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const internalRouter = Router();

function requireInboundEmailSecret(request: Request, response: Response, next: () => void): void {
  const secret = request.header('X-Inbound-Email-Secret');
  if (!secret || secret !== env.INBOUND_EMAIL_WEBHOOK_SECRET) {
    response.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

internalRouter.post(
  '/complaints/:id/ai-results',
  requireAgentSecret,
  async (request: Request, response: Response) => {
    if (!mongoose.isValidObjectId(request.params.id)) {
      throw new InternalResultsError('Complaint not found', 404);
    }

    const parsed = aiResultsSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new InternalResultsError(parsed.error.issues[0]?.message ?? 'Invalid AI results');
    }

    const result = await ComplaintModel.findOneAndUpdate(
      { _id: request.params.id, status: 'draft' },
      {
        $set: {
          aiClassification: parsed.data.classification,
          recipient: parsed.data.recipient,
          aiDraft: parsed.data.draft,
          status: 'pending_approval',
        },
        $push: {
          statusHistory: {
            status: 'pending_approval',
            note: 'AI classification, recipient, and draft persisted',
          },
        },
      },
      { new: true, runValidators: true },
    );

    if (!result)
      throw new InternalResultsError('Complaint is not in a processable draft state', 409);

    response.json(result);
  },
);

internalRouter.post(
  '/inbound-email',
  requireInboundEmailSecret,
  async (request: Request, response: Response) => {
    const parsed = inboundEmailSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new InternalResultsError(parsed.error.issues[0]?.message ?? 'Invalid inbound email');
    }

    const replyPattern = new RegExp(
      `^complaint\\+([a-f0-9]{24})@${escapeRegExp(env.EMAIL_REPLY_TO_DOMAIN)}$`,
      'i',
    );
    const match = replyPattern.exec(parsed.data.to);
    if (!match) {
      throw new InternalResultsError(
        'Inbound email recipient is not a CivicFix reply address',
        404,
      );
    }

    const receivedAt = parsed.data.receivedAt ?? new Date();
    const complaint = await ComplaintModel.findByIdAndUpdate(
      match[1],
      {
        $set: { needsOwnerReview: true },
        $push: {
          inboundReplies: {
            ...parsed.data,
            to: parsed.data.to.toLowerCase(),
            receivedAt,
          },
          statusHistory: {
            status: 'sent',
            changedAt: receivedAt,
            note: `Inbound reply from ${parsed.data.from} flagged for owner review`,
          },
        },
      },
      { new: true, runValidators: true },
    );
    if (!complaint) throw new InternalResultsError('Complaint not found', 404);

    response.json({
      complaintId: complaint.id,
      needsOwnerReview: complaint.needsOwnerReview,
      status: complaint.status,
      inboundReplyCount: complaint.inboundReplies.length,
    });
  },
);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
