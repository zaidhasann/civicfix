import cors from 'cors';
import express, { type Express } from 'express';
import pino from 'pino';
import { pinoHttp } from 'pino-http';

import { env } from './config/env.js';
import { createErrorHandler } from './middleware/error-handler.js';

export function createApp(): Express {
  const logger = pino({ level: env.NODE_ENV === 'development' ? 'debug' : 'info' });
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json());
  app.use(pinoHttp({ logger }));

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.use(createErrorHandler(logger));

  return app;
}
