import { Router, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';

import { requireAuth } from '../middleware/auth.js';
import { ComplaintModel } from '../models/complaint.js';

const createComplaintSchema = z.object({
  photoUrl: z.string().trim().url().max(2048).optional(),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  description: z.string().trim().max(5000).optional(),
});
const draftUpdateSchema = z.object({
  subject: z.string().trim().min(1).max(500),
  body: z.string().trim().min(1).max(20000),
  recipientEmail: z.string().trim().email().max(320),
});

class ComplaintError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function invalidTransition(message: string): ComplaintError {
  return new ComplaintError(message, 409);
}

function ownerFilter(request: Request): { reporter: string } | { anonymousId: string } {
  if (!request.user) throw new ComplaintError('Authentication is required', 401);
  return request.user.kind === 'anonymous'
    ? { anonymousId: request.user.id }
    : { reporter: request.user.id };
}

export const complaintsRouter = Router();

complaintsRouter.post('/', requireAuth, async (request: Request, response: Response) => {
  const parsed = createComplaintSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new ComplaintError(parsed.error.issues[0]?.message ?? 'Invalid complaint');
  }

  const { lat, lng, photoUrl, description } = parsed.data;
  const owner = ownerFilter(request);
  const complaint = await ComplaintModel.create({
    ...owner,
    address: `${lat}, ${lng}`,
    category: 'other',
    description: description ?? 'No description provided',
    location: {
      coordinates: [lng, lat],
      type: 'Point',
    },
    recipient: {
      department: 'Unassigned',
      email: 'unassigned@example.invalid',
      municipality: 'Unassigned',
      ward: 'Unassigned',
    },
    ...(photoUrl ? { photoUrl } : {}),
    severity: 3,
    status: 'draft',
    statusHistory: [{ status: 'draft', note: 'Complaint created as a draft' }],
  });

  response.status(201).json(complaint);
});

complaintsRouter.get('/:id', requireAuth, async (request: Request, response: Response) => {
  if (!mongoose.isValidObjectId(request.params.id)) {
    throw new ComplaintError('Complaint not found', 404);
  }

  const complaint = await ComplaintModel.findOne({
    _id: request.params.id,
    ...ownerFilter(request),
  });
  if (!complaint) throw new ComplaintError('Complaint not found', 404);

  response.json(complaint);
});

complaintsRouter.patch('/:id/draft', requireAuth, async (request: Request, response: Response) => {
  if (!mongoose.isValidObjectId(request.params.id)) {
    throw new ComplaintError('Complaint not found', 404);
  }
  const parsed = draftUpdateSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new ComplaintError(parsed.error.issues[0]?.message ?? 'Invalid draft');
  }
  const complaint = await ComplaintModel.findOneAndUpdate(
    { _id: request.params.id, ...ownerFilter(request), status: 'pending_approval' },
    {
      $set: {
        aiDraft: { subject: parsed.data.subject, body: parsed.data.body },
        'recipient.email': parsed.data.recipientEmail,
      },
    },
    { new: true, runValidators: true },
  );
  if (!complaint) throw new ComplaintError('Complaint not found or not awaiting approval', 404);
  response.json(complaint);
});

complaintsRouter.post(
  '/:id/regenerate',
  requireAuth,
  async (request: Request, response: Response) => {
    if (!mongoose.isValidObjectId(request.params.id)) {
      throw new ComplaintError('Complaint not found', 404);
    }
    const complaint = await ComplaintModel.findOne({
      _id: request.params.id,
      ...ownerFilter(request),
      status: 'pending_approval',
    });
    if (!complaint) throw new ComplaintError('Complaint not found or not awaiting approval', 404);
    const subject = `Civic issue report: ${complaint.aiClassification?.issueType ?? complaint.category} (severity ${complaint.severity}/5)`;
    const body = [
      'Dear Sir or Madam,',
      '',
      `I am writing to report the following civic issue: ${complaint.description}`,
      '',
      'Please review this report and advise on the next steps.',
      '',
      'Yours faithfully,',
      'CivicFix reporter',
    ].join('\n');
    complaint.aiDraft = { subject, body };
    await complaint.save();
    response.json(complaint);
  },
);

complaintsRouter.post('/:id/reject', requireAuth, async (request: Request, response: Response) => {
  if (!mongoose.isValidObjectId(request.params.id)) {
    throw new ComplaintError('Complaint not found', 404);
  }
  const owner = ownerFilter(request);
  const existingComplaint = await ComplaintModel.findOne({
    _id: request.params.id,
    ...owner,
  });
  if (!existingComplaint) throw new ComplaintError('Complaint not found', 404);
  if (existingComplaint.status !== 'pending_approval') {
    throw invalidTransition('Complaint is not awaiting approval');
  }

  const complaint = await ComplaintModel.findOneAndUpdate(
    { _id: request.params.id, ...owner, status: 'pending_approval' },
    {
      $set: { status: 'rejected' },
      $push: { statusHistory: { status: 'rejected', note: 'Rejected by reporter' } },
    },
    { new: true, runValidators: true },
  );
  if (!complaint) throw invalidTransition('Complaint is no longer awaiting approval');
  response.json(complaint);
});

complaintsRouter.post('/:id/approve', requireAuth, async (request: Request, response: Response) => {
  if (!mongoose.isValidObjectId(request.params.id)) {
    throw new ComplaintError('Complaint not found', 404);
  }
  const owner = ownerFilter(request);
  const existingComplaint = await ComplaintModel.findOne({
    _id: request.params.id,
    ...owner,
  });
  if (!existingComplaint) throw new ComplaintError('Complaint not found', 404);
  if (existingComplaint.status !== 'pending_approval') {
    throw invalidTransition('Complaint is not awaiting approval');
  }
  if (!existingComplaint.aiDraft) {
    throw invalidTransition('Complaint has no draft to approve');
  }

  const approvedAt = new Date();
  const complaint = await ComplaintModel.findOneAndUpdate(
    { _id: request.params.id, ...owner, status: 'pending_approval' },
    {
      $set: {
        status: 'sent',
        finalEmail: existingComplaint.aiDraft.body,
        approvedAt,
        approvedIp: request.ip,
      },
      $push: {
        statusHistory: {
          status: 'sent',
          changedAt: approvedAt,
          note: 'Approved by reporter',
        },
      },
    },
    { new: true, runValidators: true },
  );
  if (!complaint) throw invalidTransition('Complaint is no longer awaiting approval');
  response.json(complaint);
});
