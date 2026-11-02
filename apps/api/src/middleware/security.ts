import type { RequestHandler } from 'express';

function hasUnsafeKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasUnsafeKey);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(
    ([key, nestedValue]) => key.startsWith('$') || key.includes('.') || hasUnsafeKey(nestedValue),
  );
}

export const noSqlInjectionGuard: RequestHandler = (request, response, next) => {
  if (hasUnsafeKey(request.body) || hasUnsafeKey(request.query)) {
    response.status(400).json({ error: 'Request contains unsafe query keys' });
    return;
  }
  next();
};
