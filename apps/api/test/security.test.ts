import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { env } from '../src/config/env.js';
import { createApp } from '../src/app.js';

const originalNodeEnv = env.NODE_ENV;

afterEach(() => {
  env.NODE_ENV = originalNodeEnv;
});

describe('API security middleware', () => {
  it('returns JSON 429 responses after exceeding the auth limit', async () => {
    env.NODE_ENV = 'development';
    const app = createApp();
    const responses = [];
    for (let attempt = 0; attempt <= env.AUTH_RATE_LIMIT_MAX; attempt += 1) {
      responses.push(await request(app).post('/auth/anonymous'));
    }

    expect(responses.at(-1)?.status).toBe(429);
    expect(responses.at(-1)?.body).toEqual({
      error: 'Too many requests, please try again later.',
    });
  });

  it('rejects unsafe NoSQL keys before route validation', async () => {
    const response = await request(createApp())
      .post('/auth/login')
      .send({ email: { $gt: '' }, password: 'password123' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Request contains unsafe query keys' });
  });

  it('includes Helmet security headers', async () => {
    const response = await request(createApp()).get('/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toBeTruthy();
  });
});
