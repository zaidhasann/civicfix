import { Router, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';

import { requireAgentSecret } from '../middleware/agent-auth.js';
import { ComplaintModel, aiIssueTypes } from '../models/complaint.js';

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

class InternalResultsError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const internalRouter = Router();

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
    if (!result) throw new InternalResultsError('Complaint is not in a processable draft state', 409);

    response.json(result);
  },
);
