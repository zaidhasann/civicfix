import cors from 'cors';
import express, { type Express } from 'express';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';

import { env } from './config/env.js';
import { getDatabaseStatus } from './db/mongoose.js';
import { createErrorHandler } from './middleware/error-handler.js';

export function createApp(
  logger: Logger = pino({ level: env.NODE_ENV === 'development' ? 'debug' : 'info' }),
): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json());
  app.use(pinoHttp({ logger }));

  app.get('/health', (_request, response) => {
    response.json({ db: getDatabaseStatus(), status: 'ok' });
  });

  app.use(createErrorHandler(logger));

  return app;
}
