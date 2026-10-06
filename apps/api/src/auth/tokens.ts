import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';

export type AccessTokenPayload = JwtPayload & {
  sub: string;
  type: 'access' | 'anonymous';
  scope?: string[];
};
type RefreshTokenPayload = JwtPayload & { sub: string; type: 'refresh' };

const accessTokenOptions: SignOptions = { expiresIn: '15m' };
const refreshTokenOptions: SignOptions = { expiresIn: '7d' };
const anonymousTokenOptions: SignOptions = { expiresIn: '1h' };

export function createAccessToken(userId: string, secret: string): string {
  return jwt.sign({ sub: userId, type: 'access' }, secret, accessTokenOptions);
}

export function createRefreshToken(userId: string, secret: string): string {
  return jwt.sign({ sub: userId, type: 'refresh' }, secret, refreshTokenOptions);
}

export function createAnonymousToken(anonymousId: string, secret: string): string {
  return jwt.sign(
    { sub: anonymousId, type: 'anonymous', scope: ['report:create'] },
    secret,
    anonymousTokenOptions,
  );
}

export function verifyAccessToken(token: string, secret: string): AccessTokenPayload {
  const payload = jwt.verify(token, secret);
  if (
    typeof payload !== 'object' ||
    typeof payload.sub !== 'string' ||
    (payload.type !== 'access' && payload.type !== 'anonymous')
  ) {
    throw new Error('Invalid access token');
  }
  if (
    payload.type === 'anonymous' &&
    (!Array.isArray(payload.scope) || !payload.scope.every((scope) => typeof scope === 'string'))
  ) {
    throw new Error('Invalid anonymous token');
  }
  return payload as AccessTokenPayload;
}

export function verifyRefreshToken(token: string, secret: string): RefreshTokenPayload {
  const payload = jwt.verify(token, secret);
  if (
    typeof payload !== 'object' ||
    typeof payload.sub !== 'string' ||
    payload.type !== 'refresh'
  ) {
    throw new Error('Invalid refresh token');
  }
  return payload as RefreshTokenPayload;
}
