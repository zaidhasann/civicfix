import { Router, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';

import { requireAuth } from '../middleware/auth.js';
import { ComplaintModel, complaintCategories, complaintStatuses } from '../models/complaint.js';
import type { ComplaintEmailService } from '../services/email.js';
import { processComplaint } from '../services/complaint-processor.js';

const createComplaintSchema = z.object({
  photoUrl: z.string().trim().url().max(2048).optional(),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  category: z.enum(complaintCategories).default('other'),
  isPublic: z.boolean().default(false),
  description: z.string().trim().max(5000).optional(),
});

const nearbyQuerySchema = z.object({
  lat: z.coerce.number().finite().min(-90).max(90),
  lng: z.coerce.number().finite().min(-180).max(180),
  radius: z.coerce.number().finite().positive().max(10000).default(1000),
  category: z.enum(complaintCategories).optional(),
});
const feedQuerySchema = z.object({
  category: z.enum(complaintCategories).optional(),
  status: z.enum(['sent', 'acknowledged', 'resolved']).optional(),
  bbox: z
    .string()
    .regex(
      /^-?(?:\d+(?:\.\d+)?),-?(?:\d+(?:\.\d+)?),-?(?:\d+(?:\.\d+)?),-?(?:\d+(?:\.\d+)?)$/,
      'bbox must be minLng,minLat,maxLng,maxLat',
    )
    .optional(),
  areaLat: z.coerce.number().finite().min(-90).max(90).optional(),
  areaLng: z.coerce.number().finite().min(-180).max(180).optional(),
  areaRadius: z.coerce.number().finite().positive().max(10000).optional(),
});
const draftUpdateSchema = z.object({
  subject: z.string().trim().min(1).max(500),
  body: z.string().trim().min(1).max(20000),
  recipientEmail: z.string().trim().email().max(320),
  ward: z.string().trim().min(1).max(200).optional(),
});
const listQuerySchema = z.object({
  status: z.enum(complaintStatuses).optional(),
  category: z.enum(complaintCategories).optional(),
  sort: z.enum(['createdAt_desc', 'createdAt_asc']).default('createdAt_desc'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).optional(),
});
const statusUpdateSchema = z.object({
  status: z.enum(['acknowledged', 'resolved']),
});
const followUpUpdateSchema = z.object({
  subject: z.string().trim().min(1).max(500),
  body: z.string().trim().min(1).max(20000),
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

type ComplaintCursor = { createdAt: string; id: string };

function encodeCursor(value: ComplaintCursor): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeCursor(value: string): ComplaintCursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('createdAt' in parsed) ||
      !('id' in parsed) ||
      typeof parsed.createdAt !== 'string' ||
      typeof parsed.id !== 'string' ||
      !mongoose.isValidObjectId(parsed.id) ||
      Number.isNaN(Date.parse(parsed.createdAt))
    ) {
      throw new Error('Invalid cursor');
    }
    return { createdAt: new Date(parsed.createdAt).toISOString(), id: parsed.id };
  } catch {
    throw new ComplaintError('Invalid cursor', 400);
  }
}

interface PublicComplaint {
  id: string;
  category: string;
  location: { type: 'Point'; coordinates: [number, number] };
  status: string;
  supportCount: number;
  createdAt: Date;
  distanceMeters?: number;
}

function publicComplaintProjection(
  complaint: Record<string, unknown> & { _id: mongoose.Types.ObjectId },
): PublicComplaint {
  return {
    id: complaint._id.toString(),
    category: complaint.category as string,
    location: complaint.location as PublicComplaint['location'],
    status: complaint.status as string,
    supportCount: (complaint.supportCount as number | undefined) ?? 0,
    createdAt: complaint.createdAt as Date,
    ...('distanceMeters' in complaint
      ? { distanceMeters: complaint.distanceMeters as number }
      : {}),
  };
}

async function findNearbyComplaints(
  lng: number,
  lat: number,
  radiusMeters: number,
  category?: string,
  createdAfter?: Date,
): Promise<PublicComplaint[]> {
  const query: Record<string, unknown> = {
    status: { $in: ['sent', 'acknowledged', 'resolved'] },
    isPublic: true,
    ...(category ? { category } : {}),
    ...(createdAfter ? { createdAt: { $gte: createdAfter } } : {}),
  };
  const complaints = await ComplaintModel.aggregate<
    Record<string, unknown> & { _id: mongoose.Types.ObjectId }
  >([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] },
        distanceField: 'distanceMeters',
        maxDistance: radiusMeters,
        spherical: true,
        query,
      },
    },
    {
      $project: {
        _id: 1,
        category: 1,
        location: 1,
        status: 1,
        supportCount: 1,
        createdAt: 1,
        distanceMeters: 1,
      },
    },
    { $limit: 100 },
  ]);
  return complaints.map(publicComplaintProjection);
}

async function getFeed(request: Request, response: Response): Promise<void> {
  const parsed = feedQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    throw new ComplaintError(parsed.error.issues[0]?.message ?? 'Invalid feed query');
  }

  const { areaLat, areaLng, areaRadius, bbox, category, status } = parsed.data;
  if (
    (areaLat === undefined) !== (areaLng === undefined) ||
    (areaRadius !== undefined && (areaLat === undefined || areaLng === undefined))
  ) {
    throw new ComplaintError('areaLat, areaLng, and areaRadius must be provided together');
  }

  const query: Record<string, unknown> = {
    isPublic: true,
    status: status ? status : { $in: ['sent', 'acknowledged', 'resolved'] },
    ...(category ? { category } : {}),
  };
  if (bbox) {
    const [minLng, minLat, maxLng, maxLat] = bbox.split(',').map(Number);
    if (minLng >= maxLng || minLat >= maxLat) {
      throw new ComplaintError('bbox bounds are invalid');
    }
    query.location = {
      $geoWithin: {
        $box: [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
      },
    };
  }

  let items;
  if (areaLat !== undefined && areaLng !== undefined && areaRadius !== undefined) {
    items = await ComplaintModel.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [areaLng, areaLat] },
          distanceField: 'distanceMeters',
          maxDistance: areaRadius,
          spherical: true,
          query,
        },
      },
      {
        $project: {
          _id: 1,
          category: 1,
          location: 1,
          status: 1,
          supportCount: 1,
          createdAt: 1,
          distanceMeters: 1,
        },
      },
      { $limit: 1000 },
    ]);
  } else {
    items = await ComplaintModel.find(query)
      .select('_id category location status supportCount createdAt')
      .sort({ createdAt: -1 })
      .limit(1000)
      .lean();
  }

  response.json({ items: items.map((item) => publicComplaintProjection(item)) });
}

export const publicFeedRouter = Router();
publicFeedRouter.get('/feed', getFeed);

export function createComplaintsRouter(emailService: ComplaintEmailService): Router {
  const complaintsRouter = Router();

  complaintsRouter.post(
    '/:id/support',
    requireAuth,
    async (request: Request, response: Response) => {
      if (!mongoose.isValidObjectId(request.params.id)) {
        throw new ComplaintError('Complaint not found', 404);
      }
      const supporter = request.user?.id;
      if (!supporter) throw new ComplaintError('Authentication is required', 401);
      const complaint = await ComplaintModel.findOneAndUpdate(
        {
          _id: request.params.id,
          status: { $in: ['sent', 'acknowledged', 'resolved'] },
          supportedBy: { $ne: supporter },
        },
        { $addToSet: { supportedBy: supporter }, $inc: { supportCount: 1 } },
        { new: true },
      ).select('_id supportCount');
      if (!complaint) {
        const existing = await ComplaintModel.exists({
          _id: request.params.id,
          status: { $in: ['sent', 'acknowledged', 'resolved'] },
        });
        if (!existing) throw new ComplaintError('Complaint not found', 404);
        throw new ComplaintError('You have already supported this issue', 409);
      }
      response.json({ complaintId: complaint.id, supportCount: complaint.supportCount });
    },
  );

  complaintsRouter.post('/', requireAuth, async (request: Request, response: Response) => {
    const parsed = createComplaintSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ComplaintError(parsed.error.issues[0]?.message ?? 'Invalid complaint');
    }

    const { category, lat, lng, photoUrl, description } = parsed.data;
    const duplicates = await findNearbyComplaints(
      lng,
      lat,
      50,
      category,
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    );
    const owner = ownerFilter(request);
    const complaint = await ComplaintModel.create({
      ...owner,
      address: `${lat}, ${lng}`,
      category,
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
      isPublic: parsed.data.isPublic,
      severity: 3,
      status: 'draft',
      statusHistory: [{ status: 'draft', note: 'Complaint created as a draft' }],
    });

    response.status(201).json({ ...complaint.toObject(), duplicates });
    void processComplaint(complaint.id).catch(() => undefined);
  });

  complaintsRouter.post(
    '/:id/process',
    requireAuth,
    async (request: Request, response: Response) => {
      if (!mongoose.isValidObjectId(request.params.id)) {
        throw new ComplaintError('Complaint not found', 404);
      }
      const complaint = await ComplaintModel.findOne({
        _id: request.params.id,
        ...ownerFilter(request),
      });
      if (!complaint) throw new ComplaintError('Complaint not found', 404);
      if (['processing', 'completed'].includes(complaint.processingState)) {
        throw new ComplaintError('Complaint is already being processed or completed', 409);
      }
      void processComplaint(complaint.id).catch(() => undefined);
      response.status(202).json(complaint);
    },
  );

  complaintsRouter.get('/nearby', async (request: Request, response: Response) => {
    const parsed = nearbyQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new ComplaintError(parsed.error.issues[0]?.message ?? 'Invalid nearby query');
    }

    const complaints = await findNearbyComplaints(
      parsed.data.lng,
      parsed.data.lat,
      parsed.data.radius,
      parsed.data.category,
    );
    response.json({ items: complaints });
  });

  complaintsRouter.get('/mine', requireAuth, async (request: Request, response: Response) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new ComplaintError(parsed.error.issues[0]?.message ?? 'Invalid list query');
    }

    const { category, cursor, limit, sort, status } = parsed.data;
    const owner = ownerFilter(request);
    const filter: Record<string, unknown> = {
      ...owner,
      ...(category ? { category } : {}),
      ...(status ? { status } : {}),
    };

    if (cursor) {
      const decoded = decodeCursor(cursor);
      const cursorDate = new Date(decoded.createdAt);
      const comparison = sort === 'createdAt_desc' ? '$lt' : '$gt';
      filter.$or = [
        { createdAt: { [comparison]: cursorDate } },
        { createdAt: cursorDate, _id: { [comparison]: new mongoose.Types.ObjectId(decoded.id) } },
      ];
    }

    const complaints = await ComplaintModel.find(filter)
      .select(
        '_id status category severity address photoUrl recipient.department recipient.municipality recipient.ward createdAt updatedAt sentAt followUpSuggested processingState processingError',
      )
      .sort(sort === 'createdAt_desc' ? { createdAt: -1, _id: -1 } : { createdAt: 1, _id: 1 })
      .limit(limit + 1)
      .lean();

    const hasMore = complaints.length > limit;
    const page = hasMore ? complaints.slice(0, limit) : complaints;
    const nextCursor =
      hasMore && page.length > 0
        ? encodeCursor({
            createdAt: page[page.length - 1].createdAt.toISOString(),
            id: page[page.length - 1]._id.toString(),
          })
        : null;

    response.json({
      items: page.map((complaint) => ({
        id: complaint._id.toString(),
        status: complaint.status,
        category: complaint.category,
        severity: complaint.severity,
        address: complaint.address,
        photoUrl: complaint.photoUrl,
        recipient: complaint.recipient,
        createdAt: complaint.createdAt,
        updatedAt: complaint.updatedAt,
        sentAt: complaint.sentAt,
        followUpSuggested:
          complaint.followUpSuggested && !complaint.followUpSuggested.dismissedAt
            ? complaint.followUpSuggested
            : undefined,
        processingState: complaint.processingState,
        processingError: complaint.processingError,
      })),
      nextCursor,
    });
  });

  complaintsRouter.patch(
    '/:id/follow-up',
    requireAuth,
    async (request: Request, response: Response) => {
      if (!mongoose.isValidObjectId(request.params.id)) {
        throw new ComplaintError('Complaint not found', 404);
      }
      const parsed = followUpUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ComplaintError(parsed.error.issues[0]?.message ?? 'Invalid follow-up draft');
      }
      const complaint = await ComplaintModel.findOneAndUpdate(
        {
          _id: request.params.id,
          ...ownerFilter(request),
          status: 'sent',
          followUpSuggested: { $exists: true },
          'followUpSuggested.dismissedAt': { $exists: false },
        },
        {
          $set: {
            'followUpSuggested.draftSubject': parsed.data.subject,
            'followUpSuggested.draftBody': parsed.data.body,
          },
        },
        { new: true, runValidators: true },
      );
      if (!complaint) throw new ComplaintError('Follow-up suggestion not found', 404);
      response.json(complaint);
    },
  );

  complaintsRouter.post(
    '/:id/follow-up/dismiss',
    requireAuth,
    async (request: Request, response: Response) => {
      if (!mongoose.isValidObjectId(request.params.id)) {
        throw new ComplaintError('Complaint not found', 404);
      }
      const complaint = await ComplaintModel.findOneAndUpdate(
        {
          _id: request.params.id,
          ...ownerFilter(request),
          status: 'sent',
          followUpSuggested: { $exists: true },
          'followUpSuggested.dismissedAt': { $exists: false },
        },
        { $set: { 'followUpSuggested.dismissedAt': new Date() } },
        { new: true, runValidators: true },
      );
      if (!complaint) throw new ComplaintError('Follow-up suggestion not found', 404);
      response.json(complaint);
    },
  );

  complaintsRouter.post(
    '/:id/follow-up/prepare-approval',
    requireAuth,
    async (request: Request, response: Response) => {
      if (!mongoose.isValidObjectId(request.params.id)) {
        throw new ComplaintError('Complaint not found', 404);
      }
      const complaint = await ComplaintModel.findOneAndUpdate(
        {
          _id: request.params.id,
          ...ownerFilter(request),
          status: 'sent',
          followUpSuggested: { $exists: true },
          'followUpSuggested.dismissedAt': { $exists: false },
        },
        [
          {
            $set: {
              aiDraft: {
                subject: '$followUpSuggested.draftSubject',
                body: '$followUpSuggested.draftBody',
              },
              status: 'pending_approval',
              'followUpSuggested.dismissedAt': new Date(),
            },
          },
          {
            $set: {
              statusHistory: {
                $concatArrays: [
                  '$statusHistory',
                  [
                    {
                      status: 'pending_approval',
                      changedAt: new Date(),
                      note: 'Follow-up reminder prepared for approval',
                    },
                  ],
                ],
              },
            },
          },
        ],
        { new: true, runValidators: true },
      );
      if (!complaint) throw new ComplaintError('Follow-up suggestion not found', 404);
      response.json(complaint);
    },
  );

  complaintsRouter.patch(
    '/:id/status',
    requireAuth,
    async (request: Request, response: Response) => {
      if (!mongoose.isValidObjectId(request.params.id)) {
        throw new ComplaintError('Complaint not found', 404);
      }
      const parsed = statusUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ComplaintError(parsed.error.issues[0]?.message ?? 'Invalid status update');
      }
      const owner = ownerFilter(request);
      const complaint = await ComplaintModel.findOne({ _id: request.params.id, ...owner });
      if (!complaint) throw new ComplaintError('Complaint not found', 404);

      const expectedPreviousStatus =
        parsed.data.status === 'acknowledged' ? 'sent' : 'acknowledged';
      if (complaint.status !== expectedPreviousStatus) {
        throw invalidTransition(
          `Complaint must be ${expectedPreviousStatus} before it can be marked ${parsed.data.status}`,
        );
      }

      complaint.status = parsed.data.status;
      complaint.statusHistory.push({
        status: parsed.data.status,
        changedAt: new Date(),
        note: `Marked ${parsed.data.status} by reporter`,
      });
      await complaint.save();
      response.json(complaint);
    },
  );

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

  complaintsRouter.patch(
    '/:id/draft',
    requireAuth,
    async (request: Request, response: Response) => {
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
            ...(parsed.data.ward ? { 'recipient.ward': parsed.data.ward } : {}),
          },
        },
        { new: true, runValidators: true },
      );
      if (!complaint) throw new ComplaintError('Complaint not found or not awaiting approval', 404);
      response.json(complaint);
    },
  );

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

  complaintsRouter.post(
    '/:id/reject',
    requireAuth,
    async (request: Request, response: Response) => {
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
    },
  );

  complaintsRouter.post(
    '/:id/approve',
    requireAuth,
    async (request: Request, response: Response) => {
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
      if (existingComplaint.recipient.email.endsWith('.invalid')) {
        throw invalidTransition('A valid recipient email is required before approval');
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
      const emailResult = await emailService.sendApprovedComplaint(complaint);
      const trackedComplaint = await ComplaintModel.findOneAndUpdate(
        { _id: complaint._id, status: 'sent', messageId: { $exists: false } },
        {
          $set: {
            messageId: emailResult.messageId,
            sentAt: emailResult.sentAt,
          },
          $push: {
            deliveryEvents: {
              provider: emailResult.provider,
              status: emailResult.status,
              messageId: emailResult.messageId,
              occurredAt: emailResult.sentAt,
              detail: 'Message accepted by email transport',
            },
            statusHistory: {
              status: 'sent',
              changedAt: emailResult.sentAt,
              note: `Email accepted by ${emailResult.provider} transport`,
            },
          },
        },
        { new: true, runValidators: true },
      );
      if (!trackedComplaint) {
        throw new ComplaintError('Complaint delivery tracking could not be saved', 500);
      }
      response.json(trackedComplaint);
    },
  );

  return complaintsRouter;
}
