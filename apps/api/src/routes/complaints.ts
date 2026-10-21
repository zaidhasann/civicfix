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

class ComplaintError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
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
