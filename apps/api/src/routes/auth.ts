import bcrypt from 'bcryptjs';
import { Router, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { env } from '../config/env.js';
import { UserModel, type UserDocument } from '../models/user.js';
import {
  createAccessToken,
  createAnonymousToken,
  createRefreshToken,
  verifyRefreshToken,
} from '../auth/tokens.js';
import { randomUUID } from 'node:crypto';

const refreshCookieName = 'civicfix_refresh_token';
const refreshCookieMaxAgeMs = 7 * 24 * 60 * 60 * 1000;

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

class AuthError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function userResponse(user: UserDocument) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

function setRefreshCookie(response: Response, token: string): void {
  response.cookie(refreshCookieName, token, {
    httpOnly: true,
    maxAge: refreshCookieMaxAgeMs,
    path: '/auth',
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
  });
}

function issueTokens(userId: string): { accessToken: string; refreshToken: string } {
  return {
    accessToken: createAccessToken(userId, env.JWT_ACCESS_SECRET),
    refreshToken: createRefreshToken(userId, env.JWT_REFRESH_SECRET),
  };
}

export const authRouter = Router();

authRouter.post('/register', async (request: Request, response: Response) => {
  const parsed = registerSchema.safeParse(request.body);
  if (!parsed.success)
    throw new AuthError(parsed.error.issues[0]?.message ?? 'Invalid request body');

  const email = parsed.data.email.toLowerCase();
  const existingUser = await UserModel.exists({ email });
  if (existingUser) throw new AuthError('Email is already registered', 409);

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user = await UserModel.create({
    name: parsed.data.name,
    email,
    passwordHash,
    role: 'citizen',
  });
  const tokens = issueTokens(user.id);
  setRefreshCookie(response, tokens.refreshToken);

  response.status(201).json({ accessToken: tokens.accessToken, user: userResponse(user) });
});

authRouter.post('/login', async (request: Request, response: Response) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) throw new AuthError('Invalid email or password', 401);

  const user = await UserModel.findOne({ email: parsed.data.email.toLowerCase() }).select(
    '+passwordHash',
  );
  const passwordMatches = user
    ? await bcrypt.compare(parsed.data.password, user.passwordHash)
    : false;
  if (!user || !passwordMatches) throw new AuthError('Invalid email or password', 401);

  const tokens = issueTokens(user.id);
  setRefreshCookie(response, tokens.refreshToken);
  response.json({ accessToken: tokens.accessToken, user: userResponse(user) });
});

authRouter.post('/anonymous', (_request: Request, response: Response) => {
  const anonymousId = randomUUID();
  const accessToken = createAnonymousToken(anonymousId, env.JWT_ACCESS_SECRET);
  response.status(201).json({ accessToken, anonymousId });
});

authRouter.post('/refresh', async (request: Request, response: Response) => {
  const refreshToken = request.cookies?.[refreshCookieName] as string | undefined;
  if (!refreshToken) throw new AuthError('Refresh token is required', 401);

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken, env.JWT_REFRESH_SECRET);
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof Error) {
      throw new AuthError('Invalid refresh token', 401);
    }
    throw error;
  }

  const user = await UserModel.findById(payload.sub);
  if (!user) throw new AuthError('Invalid refresh token', 401);

  const tokens = issueTokens(user.id);
  setRefreshCookie(response, tokens.refreshToken);
  response.json({ accessToken: tokens.accessToken, user: userResponse(user) });
});
