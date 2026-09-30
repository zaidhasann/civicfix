import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';

type TokenType = 'access' | 'refresh';
type AuthTokenPayload = JwtPayload & { sub: string; type: TokenType };

const accessTokenOptions: SignOptions = { expiresIn: '15m' };
const refreshTokenOptions: SignOptions = { expiresIn: '7d' };

export function createAccessToken(userId: string, secret: string): string {
  return jwt.sign({ sub: userId, type: 'access' }, secret, accessTokenOptions);
}

export function createRefreshToken(userId: string, secret: string): string {
  return jwt.sign({ sub: userId, type: 'refresh' }, secret, refreshTokenOptions);
}

export function verifyRefreshToken(token: string, secret: string): AuthTokenPayload {
  const payload = jwt.verify(token, secret);
  if (
    typeof payload !== 'object' ||
    typeof payload.sub !== 'string' ||
    payload.type !== 'refresh'
  ) {
    throw new Error('Invalid refresh token');
  }
  return payload as AuthTokenPayload;
}
