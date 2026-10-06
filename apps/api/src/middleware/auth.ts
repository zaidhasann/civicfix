import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';
import { verifyAccessToken } from '../auth/tokens.js';
import { UserModel } from '../models/user.js';
import type { UserRole } from '../models/user.js';

class AuthenticationError extends Error {
  statusCode = 401;

  constructor(message = 'Authentication is required') {
    super(message);
  }
}

class AuthorizationError extends Error {
  statusCode = 403;

  constructor(message = 'You do not have permission to access this resource') {
    super(message);
  }
}

function getBearerToken(authorization: string | undefined): string {
  if (!authorization) throw new AuthenticationError('Bearer token is required');
  const [scheme, token, ...extra] = authorization.split(' ');
  if (scheme !== 'Bearer' || !token || extra.length > 0) {
    throw new AuthenticationError('Invalid authorization header');
  }
  return token;
}

export const requireAuth: RequestHandler = async (request) => {
  const token = getBearerToken(request.get('authorization'));
  let payload;
  try {
    payload = verifyAccessToken(token, env.JWT_ACCESS_SECRET);
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof Error) {
      throw new AuthenticationError('Invalid access token');
    }
    throw error;
  }

  if (payload.type === 'anonymous') {
    request.user = {
      id: payload.sub,
      kind: 'anonymous',
      role: 'anonymous',
      scopes: payload.scope ?? [],
    };
    return;
  }

  const user = await UserModel.findById(payload.sub).select('role');
  if (!user) throw new AuthenticationError('Invalid access token');

  request.user = { id: user.id, kind: 'user', role: user.role };
};

export function requireRole(...roles: UserRole[]): RequestHandler {
  return async (request, _response, next) => {
    await requireAuth(request, _response, next);
    if (!request.user || request.user.kind !== 'user' || !roles.includes(request.user.role)) {
      throw new AuthorizationError();
    }
  };
}
