import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { booleanEnv, env } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { refreshCookieOptions } from '../src/routes/auth.js';

describe('environment parsing and refresh cookies', () => {
  it('parses boolean environment values without treating false as true', () => {
    expect(booleanEnv.parse('true')).toBe(true);
    expect(booleanEnv.parse('1')).toBe(true);
    expect(booleanEnv.parse('false')).toBe(false);
    expect(booleanEnv.parse('0')).toBe(false);
    expect(booleanEnv.parse('')).toBe(false);
  });

  it('sets and clears refresh cookies with the configured flags', async () => {
    const app = createApp();
    const logout = await request(app).post('/auth/logout');
    expect(logout.status).toBe(204);
    expect(logout.headers['set-cookie'][0]).toContain('SameSite=Lax');
    expect(refreshCookieOptions).toMatchObject({
      httpOnly: true,
      path: '/auth',
      sameSite: 'lax',
      secure: false,
    });
    expect(env.EMAIL_ATTACH_PHOTO).toBe(false);
  });
});
