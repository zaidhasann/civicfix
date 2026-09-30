import cors from 'cors';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';

import { env } from './config/env.js';
import { getDatabaseStatus } from './db/mongoose.js';
import { authRouter } from './routes/auth.js';
import { createErrorHandler } from './middleware/error-handler.js';

export function createApp(
  logger: Logger = pino({ level: env.NODE_ENV === 'development' ? 'debug' : 'info' }),
): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({ credentials: true, origin: env.CORS_ORIGIN }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(pinoHttp({ logger }));

  app.get('/health', (_request, response) => {
    response.json({ db: getDatabaseStatus(), status: 'ok' });
  });

  app.use('/auth', authRouter);

  app.use(createErrorHandler(logger));

  return app;
}
