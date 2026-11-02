import cors from 'cors';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';

import { env } from './config/env.js';
import { getDatabaseStatus } from './db/mongoose.js';
import { authRouter } from './routes/auth.js';
import { createComplaintsRouter, publicFeedRouter } from './routes/complaints.js';
import { uploadsRouter } from './routes/uploads.js';
import { internalRouter } from './routes/internal.js';
import { createErrorHandler } from './middleware/error-handler.js';
import { createEmailService } from './services/email.js';

export function createApp(
  logger: Logger = pino({ level: env.NODE_ENV === 'development' ? 'debug' : 'info' }),
): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY ? 1 : false);
  const allowedOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim());
  app.use(
    cors({
      credentials: true,
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error('Origin is not allowed by CORS'));
      },
    }),
  );
  app.use(express.json());
  app.use(cookieParser());
  app.use(pinoHttp({ logger }));

  app.get('/health', (_request, response) => {
    response.json({ db: getDatabaseStatus(), status: 'ok' });
  });

  app.use('/auth', authRouter);
  app.use('/complaints', createComplaintsRouter(createEmailService(logger)));
  app.use('/', publicFeedRouter);
  app.use('/uploads', uploadsRouter);
  app.use('/internal', internalRouter);

  app.use(createErrorHandler(logger));

  return app;
}
