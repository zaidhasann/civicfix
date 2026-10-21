import { randomUUID } from 'node:crypto';

import { createAnonymousToken } from '../src/auth/tokens.js';
import { env } from '../src/config/env.js';
import { MongoMemoryServer } from 'mongodb-memory-server';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { connectToDatabase, disconnectFromDatabase } from '../src/db/mongoose.js';

const app = createApp(pino({ level: 'silent' }));
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
});
