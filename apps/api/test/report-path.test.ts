import { randomUUID } from 'node:crypto';

import { createAnonymousToken } from '../src/auth/tokens.js';
import { env } from '../src/config/env.js';
import { MongoMemoryServer } from 'mongodb-memory-server';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { connectToDatabase, disconnectFromDatabase } from '../src/db/mongoose.js';
import { ComplaintModel } from '../src/models/complaint.js';

const dryRunEmails: Array<{
  complaintId: string;
  mode: string;
  messageId: string;
  replyTo: string;
}> = [];
const app = createApp(
  pino(
    { level: 'info' },
    {
      write(line: string) {
        const record = JSON.parse(line) as {
          msg?: string;
          email?: { complaintId: string; mode: string; messageId: string; replyTo: string };
        };
        if (record.msg === 'Email send (dry-run)' && record.email) {
          dryRunEmails.push(record.email);
        }
      },
    },
  ),
);
let mongoServer: MongoMemoryServer;

async function registerUser(email = `${randomUUID()}@example.com`) {
  const response = await request(app).post('/auth/register').send({
    email,
    name: 'Test Reporter',
    password: 'password123',
  });
  expect(response.status).toBe(201);
  return response.body as { accessToken: string; user: { id: string } };
}

function anonymousAuthorization(): string {
  return `Bearer ${createAnonymousToken(randomUUID(), env.JWT_ACCESS_SECRET)}`;
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await connectToDatabase(mongoServer.getUri(), pino({ level: 'silent' }), 1, 0);
});

afterAll(async () => {
  await disconnectFromDatabase();
  if (mongoServer) await mongoServer.stop();
});

describe('authentication', () => {
  it('registers and logs in a user', async () => {
    const email = `${randomUUID()}@example.com`;
    const registration = await registerUser(email);

    const login = await request(app).post('/auth/login').send({
      email,
      password: 'password123',
    });

    expect(login.status).toBe(200);
    expect(login.body.accessToken).toBeTruthy();
    expect(login.body.user.id).toBe(registration.user.id);
  });
});

describe('upload signing', () => {
  it('returns a signed Cloudinary upload payload for an authenticated user', async () => {
    const response = await request(app)
      .post('/uploads/sign')
      .set('Authorization', anonymousAuthorization());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      allowed_formats: 'jpg,jpeg,png,webp',
      api_key: 'test-api-key',
      cloud_name: 'test-cloud',
      folder: 'complaints/',
      max_file_size: '10485760',
    });
    expect(response.body.signature).toMatch(/^[a-f0-9]{40}$/);
  });

  it('rejects upload signing without authentication', async () => {
    const response = await request(app).post('/uploads/sign');

    expect(response.status).toBe(401);
  });
});

describe('complaints', () => {
  it('lists only the owner complaints with stable cursor pagination and filters', async () => {
    const authorization = anonymousAuthorization();
    const otherAuthorization = anonymousAuthorization();
    const complaintIds: string[] = [];

    for (let index = 0; index < 3; index += 1) {
      const response = await request(app)
        .post('/complaints')
        .set('Authorization', authorization)
        .send({ lat: 18.52 + index, lng: 73.85 + index, description: `Complaint ${index}` });
      expect(response.status).toBe(201);
      complaintIds.push(response.body._id);
    }
    const otherComplaint = await request(app)
      .post('/complaints')
      .set('Authorization', otherAuthorization)
      .send({ lat: 20, lng: 75 });
    expect(otherComplaint.status).toBe(201);

    await ComplaintModel.updateOne(
      { _id: complaintIds[0] },
      { $set: { category: 'pothole', status: 'sent', finalEmail: 'private body' } },
    );
    await ComplaintModel.updateOne(
      { _id: complaintIds[1] },
      { $set: { category: 'water', status: 'pending_approval' } },
    );

    const firstPage = await request(app)
      .get('/complaints/mine?limit=2&sort=createdAt_asc')
      .set('Authorization', authorization);
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.items).toHaveLength(2);
    expect(firstPage.body.nextCursor).toEqual(expect.any(String));
    expect(firstPage.body.items[0].id).toBe(complaintIds[0]);
    expect(firstPage.body.items[1].id).toBe(complaintIds[1]);
    expect(firstPage.body.items[0]).not.toHaveProperty('finalEmail');
    expect(firstPage.body.items[0]).not.toHaveProperty('aiDraft');

    const secondPage = await request(app)
      .get(
        `/complaints/mine?limit=2&sort=createdAt_asc&cursor=${encodeURIComponent(firstPage.body.nextCursor)}`,
      )
      .set('Authorization', authorization);
    expect(secondPage.status).toBe(200);
    expect(secondPage.body.items).toHaveLength(1);
    expect(secondPage.body.items[0].id).toBe(complaintIds[2]);
    expect(secondPage.body.nextCursor).toBeNull();

    const filtered = await request(app)
      .get('/complaints/mine?status=pending_approval&category=water')
      .set('Authorization', authorization);
    expect(filtered.status).toBe(200);
    expect(filtered.body.items).toHaveLength(1);
    expect(filtered.body.items[0].id).toBe(complaintIds[1]);
  });

  it('rejects invalid listing cursors and filters', async () => {
    const response = await request(app)
      .get('/complaints/mine?status=invalid&limit=101')
      .set('Authorization', anonymousAuthorization());
    expect(response.status).toBe(400);

    const invalidCursor = await request(app)
      .get('/complaints/mine?cursor=not-a-cursor')
      .set('Authorization', anonymousAuthorization());
    expect(invalidCursor.status).toBe(400);
  });

  it('creates a draft with GeoJSON coordinates and returns it to its owner', async () => {
    const authorization = anonymousAuthorization();
    const createResponse = await request(app)
      .post('/complaints')
      .set('Authorization', authorization)
      .send({
        description: 'A pothole needs attention.',
        lat: 18.5204,
        lng: 73.8567,
        photoUrl: 'https://res.cloudinary.com/test/image/upload/photo.jpg',
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.status).toBe('draft');
    expect(createResponse.body.location).toMatchObject({
      type: 'Point',
      coordinates: [73.8567, 18.5204],
    });

    const fetchResponse = await request(app)
      .get(`/complaints/${createResponse.body._id}`)
      .set('Authorization', authorization);

    expect(fetchResponse.status).toBe(200);
    expect(fetchResponse.body._id).toBe(createResponse.body._id);
  });

  it.each([
    ['latitude too low', { lat: -90.1, lng: 0 }],
    ['latitude too high', { lat: 90.1, lng: 0 }],
    ['longitude too low', { lat: 0, lng: -180.1 }],
    ['longitude too high', { lat: 0, lng: 180.1 }],
    ['non-finite latitude', { lat: Number.POSITIVE_INFINITY, lng: 0 }],
  ])('rejects %s', async (_caseName, coordinates) => {
    const response = await request(app)
      .post('/complaints')
      .set('Authorization', anonymousAuthorization())
      .send(coordinates);

    expect(response.status).toBe(400);
  });

  it('does not allow another owner to fetch a complaint', async () => {
    const ownerAuthorization = anonymousAuthorization();
    const createResponse = await request(app)
      .post('/complaints')
      .set('Authorization', ownerAuthorization)
      .send({ lat: 0, lng: 0 });

    const fetchResponse = await request(app)
      .get(`/complaints/${createResponse.body._id}`)
      .set('Authorization', anonymousAuthorization());

    expect(fetchResponse.status).toBe(404);
  });

  it('allows the owner to acknowledge then resolve a sent complaint', async () => {
    const authorization = anonymousAuthorization();
    const createResponse = await request(app)
      .post('/complaints')
      .set('Authorization', authorization)
      .send({ lat: 18.52, lng: 73.85 });
    const id = createResponse.body._id;
    await ComplaintModel.updateOne({ _id: id }, { $set: { status: 'sent' } });

    const acknowledged = await request(app)
      .patch(`/complaints/${id}/status`)
      .set('Authorization', authorization)
      .send({ status: 'acknowledged' });
    expect(acknowledged.status).toBe(200);
    expect(acknowledged.body.status).toBe('acknowledged');
    expect(acknowledged.body.statusHistory.at(-1)).toMatchObject({
      status: 'acknowledged',
      note: 'Marked acknowledged by reporter',
    });

    const resolved = await request(app)
      .patch(`/complaints/${id}/status`)
      .set('Authorization', authorization)
      .send({ status: 'resolved' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.status).toBe('resolved');
    expect(resolved.body.statusHistory.at(-1)).toMatchObject({
      status: 'resolved',
      note: 'Marked resolved by reporter',
    });
  });

  it('enforces owner permissions and valid manual status transitions', async () => {
    const ownerAuthorization = anonymousAuthorization();
    const otherAuthorization = anonymousAuthorization();
    const createResponse = await request(app)
      .post('/complaints')
      .set('Authorization', ownerAuthorization)
      .send({ lat: 18.52, lng: 73.85 });
    const id = createResponse.body._id;
    await ComplaintModel.updateOne({ _id: id }, { $set: { status: 'sent' } });

    const forbidden = await request(app)
      .patch(`/complaints/${id}/status`)
      .set('Authorization', otherAuthorization)
      .send({ status: 'acknowledged' });
    expect(forbidden.status).toBe(404);

    const invalid = await request(app)
      .patch(`/complaints/${id}/status`)
      .set('Authorization', ownerAuthorization)
      .send({ status: 'resolved' });
    expect(invalid.status).toBe(409);
  });

  it('stores inbound replies for owner review without auto-resolving', async () => {
    const authorization = anonymousAuthorization();
    const createResponse = await request(app)
      .post('/complaints')
      .set('Authorization', authorization)
      .send({ lat: 18.52, lng: 73.85 });
    const id = createResponse.body._id;
    await ComplaintModel.updateOne({ _id: id }, { $set: { status: 'sent' } });

    const inbound = await request(app)
      .post('/internal/inbound-email')
      .set('X-Inbound-Email-Secret', 'test-inbound-email-secret')
      .send({
        to: `complaint+${id}@reply.civicfix.local`,
        from: 'official@municipality.example',
        subject: 'We received your report',
        text: 'Our team will inspect this location.',
        messageId: '<reply-123@example>',
      });

    expect(inbound.status).toBe(200);
    expect(inbound.body).toMatchObject({
      complaintId: id,
      needsOwnerReview: true,
      status: 'sent',
      inboundReplyCount: 1,
    });
    const stored = await ComplaintModel.findById(id).lean();
    expect(stored?.status).toBe('sent');
    expect(stored?.needsOwnerReview).toBe(true);
    expect(stored?.inboundReplies[0]).toMatchObject({
      from: 'official@municipality.example',
      subject: 'We received your report',
    });
    expect(stored?.statusHistory.at(-1)?.note).toContain('flagged for owner review');
  });

  it('rejects unauthorized and malformed inbound email webhooks', async () => {
    const unauthorized = await request(app).post('/internal/inbound-email').send({});
    expect(unauthorized.status).toBe(401);

    const malformed = await request(app)
      .post('/internal/inbound-email')
      .set('X-Inbound-Email-Secret', 'test-inbound-email-secret')
      .send({
        to: 'not-a-civicfix-address@example.com',
        from: 'official@municipality.example',
        subject: 'Reply',
        text: 'Body',
      });
    expect(malformed.status).toBe(404);
  });

  it('rejects AI result persistence without the agent secret', async () => {
    const createResponse = await request(app)
      .post('/complaints')
      .set('Authorization', anonymousAuthorization())
      .send({ lat: 18.5204, lng: 73.8567 });

    const response = await request(app)
      .post(`/internal/complaints/${createResponse.body._id}/ai-results`)
      .send({});

    expect(response.status).toBe(401);
  });

  it('persists validated AI results and moves the complaint to pending approval', async () => {
    const createResponse = await request(app)
      .post('/complaints')
      .set('Authorization', anonymousAuthorization())
      .send({ lat: 18.5204, lng: 73.8567, description: 'A pothole is visible.' });

    const response = await request(app)
      .post(`/internal/complaints/${createResponse.body._id}/ai-results`)
      .set('X-Agent-Secret', 'test-agent-secret')
      .send({
        classification: {
          issueType: 'pothole',
          severity: 4,
          confidence: 0.92,
          visibleDetails: 'A pothole is visible in the road.',
          safetyRisk: true,
        },
        recipient: {
          department: 'Pune Municipal Corporation',
          email: 'roads@pmc.example',
          ward: 'Citywide',
          municipality: 'Pune',
        },
        draft: {
          subject: 'Road hazard report',
          body: 'Please inspect the reported pothole.',
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('pending_approval');
    expect(response.body.aiClassification).toMatchObject({
      issueType: 'pothole',
      confidence: 0.92,
    });
    expect(response.body.recipient.department).toBe('Pune Municipal Corporation');
    expect(response.body.aiDraft.subject).toBe('Road hazard report');
    expect(response.body.statusHistory.at(-1).status).toBe('pending_approval');
  });

  it('rejects malformed AI results', async () => {
    const createResponse = await request(app)
      .post('/complaints')
      .set('Authorization', anonymousAuthorization())
      .send({ lat: 18.5204, lng: 73.8567 });

    const response = await request(app)
      .post(`/internal/complaints/${createResponse.body._id}/ai-results`)
      .set('X-Agent-Secret', 'test-agent-secret')
      .send({ classification: { issueType: 'unknown' } });

    expect(response.status).toBe(400);
  });

  it('allows editing, regenerating, and rejecting a pending complaint', async () => {
    const authorization = anonymousAuthorization();
    const createResponse = await request(app)
      .post('/complaints')
      .set('Authorization', authorization)
      .send({ lat: 18.5204, lng: 73.8567 });
    const id = createResponse.body._id;
    await request(app)
      .post(`/internal/complaints/${id}/ai-results`)
      .set('X-Agent-Secret', 'test-agent-secret')
      .send({
        classification: {
          issueType: 'pothole',
          severity: 3,
          confidence: 0.8,
          visibleDetails: 'Pothole visible',
          safetyRisk: false,
        },
        recipient: {
          department: 'PMC',
          email: 'roads@example.com',
          ward: 'Citywide',
          municipality: 'Pune',
        },
        draft: { subject: 'Original', body: 'Original body' },
      });

    const edit = await request(app)
      .patch(`/complaints/${id}/draft`)
      .set('Authorization', authorization)
      .send({ subject: 'Edited', body: 'Edited body', recipientEmail: 'new@example.com' });
    expect(edit.status).toBe(200);
    expect(edit.body.aiDraft.subject).toBe('Edited');
    expect(edit.body.recipient.email).toBe('new@example.com');

    const regenerated = await request(app)
      .post(`/complaints/${id}/regenerate`)
      .set('Authorization', authorization);
    expect(regenerated.status).toBe(200);
    expect(regenerated.body.aiDraft.subject).toContain('pothole');

    const rejected = await request(app)
      .post(`/complaints/${id}/reject`)
      .set('Authorization', authorization);
    expect(rejected.status).toBe(200);
    expect(rejected.body.status).toBe('rejected');
  });

  it('approves the edited draft and records approval metadata', async () => {
    dryRunEmails.length = 0;
    const authorization = anonymousAuthorization();
    const createResponse = await request(app)
      .post('/complaints')
      .set('Authorization', authorization)
      .send({ lat: 18.5204, lng: 73.8567 });
    const id = createResponse.body._id;

    await request(app)
      .post(`/internal/complaints/${id}/ai-results`)
      .set('X-Agent-Secret', 'test-agent-secret')
      .send({
        classification: {
          issueType: 'pothole',
          severity: 3,
          confidence: 0.8,
          visibleDetails: 'Pothole visible',
          safetyRisk: false,
        },
        recipient: {
          department: 'PMC',
          email: 'roads@example.com',
          ward: 'Citywide',
          municipality: 'Pune',
        },
        draft: { subject: 'Original', body: 'Original body' },
      });

    await request(app)
      .patch(`/complaints/${id}/draft`)
      .set('Authorization', authorization)
      .send({ subject: 'Edited', body: 'Edited body', recipientEmail: 'new@example.com' });

    const approved = await request(app)
      .post(`/complaints/${id}/approve`)
      .set('Authorization', authorization);

    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('sent');
    expect(approved.body.finalEmail).toBe('Edited body');
    expect(approved.body.approvedAt).toBeTruthy();
    expect(approved.body.approvedIp).toBeTruthy();
    expect(approved.body.messageId).toBe(`<${id}@reply.civicfix.local>`);
    expect(approved.body.sentAt).toBeTruthy();
    expect(approved.body.deliveryEvents).toHaveLength(1);
    expect(approved.body.deliveryEvents[0]).toMatchObject({
      provider: 'dry-run',
      status: 'accepted',
      messageId: `<${id}@reply.civicfix.local>`,
    });
    expect(approved.body.statusHistory.at(-1)).toMatchObject({
      status: 'sent',
      note: 'Email accepted by dry-run transport',
    });
    expect(dryRunEmails).toHaveLength(1);
    expect(dryRunEmails[0]).toMatchObject({
      complaintId: id,
      mode: 'dry-run',
      messageId: `<${id}@reply.civicfix.local>`,
      replyTo: `complaint+${id}@reply.civicfix.local`,
    });
  });

  it('returns 409 for invalid approval transitions and blocks other send paths', async () => {
    const authorization = anonymousAuthorization();
    const createResponse = await request(app)
      .post('/complaints')
      .set('Authorization', authorization)
      .send({ lat: 18.5204, lng: 73.8567 });
    const id = createResponse.body._id;

    const approveDraft = await request(app)
      .post(`/complaints/${id}/approve`)
      .set('Authorization', authorization);
    expect(approveDraft.status).toBe(409);

    const rejectDraft = await request(app)
      .post(`/complaints/${id}/reject`)
      .set('Authorization', authorization);
    expect(rejectDraft.status).toBe(409);

    await request(app)
      .post(`/internal/complaints/${id}/ai-results`)
      .set('X-Agent-Secret', 'test-agent-secret')
      .send({
        classification: {
          issueType: 'pothole',
          severity: 3,
          confidence: 0.8,
          visibleDetails: 'Pothole visible',
          safetyRisk: false,
        },
        recipient: {
          department: 'PMC',
          email: 'roads@example.com',
          ward: 'Citywide',
          municipality: 'Pune',
        },
        draft: { subject: 'Original', body: 'Original body' },
      });

    const approved = await request(app)
      .post(`/complaints/${id}/approve`)
      .set('Authorization', authorization);
    expect(approved.status).toBe(200);

    const approveAgain = await request(app)
      .post(`/complaints/${id}/approve`)
      .set('Authorization', authorization);
    expect(approveAgain.status).toBe(409);

    const rejectSent = await request(app)
      .post(`/complaints/${id}/reject`)
      .set('Authorization', authorization);
    expect(rejectSent.status).toBe(409);

    const agentOverwrite = await request(app)
      .post(`/internal/complaints/${id}/ai-results`)
      .set('X-Agent-Secret', 'test-agent-secret')
      .send({
        classification: {
          issueType: 'pothole',
          severity: 3,
          confidence: 0.8,
          visibleDetails: 'Pothole visible',
          safetyRisk: false,
        },
        recipient: {
          department: 'PMC',
          email: 'roads@example.com',
          ward: 'Citywide',
          municipality: 'Pune',
        },
        draft: { subject: 'Replacement', body: 'Replacement body' },
      });
    expect(agentOverwrite.status).toBe(409);
  });
});
