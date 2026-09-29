import type { ErrorRequestHandler } from 'express';
import type { Logger } from 'pino';

interface HttpError extends Error {
  statusCode?: number;
}

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, _request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    const httpError = error instanceof Error ? (error as HttpError) : undefined;
    const statusCode =
      httpError?.statusCode && httpError.statusCode >= 400 ? httpError.statusCode : 500;
    const message =
      statusCode === 500 ? 'Internal server error' : (httpError?.message ?? 'Request failed');

    logger.error({ err: error, statusCode }, 'Request failed');
    response.status(statusCode).json({ error: message });
  };
}
