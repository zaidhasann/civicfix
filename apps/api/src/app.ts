import cors from 'cors';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
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
import { noSqlInjectionGuard } from './middleware/security.js';

function createLimiter(max: number, windowMs: number) {
  return rateLimit({
    max,
    windowMs,
    skip: () => env.NODE_ENV === 'test',
    handler: (_request, response) => {
      response.status(429).json({ error: 'Too many requests, please try again later.' });
    },
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
}

export function createApp(
  logger: Logger = pino({ level: env.NODE_ENV === 'development' ? 'debug' : 'info' }),
): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
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
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger }));
  app.use(noSqlInjectionGuard);

  const generalLimiter = createLimiter(
    env.GENERAL_RATE_LIMIT_MAX,
    env.GENERAL_RATE_LIMIT_WINDOW_MS,
  );
  const authLimiter = createLimiter(env.AUTH_RATE_LIMIT_MAX, env.AUTH_RATE_LIMIT_WINDOW_MS);
  const uploadLimiter = createLimiter(env.UPLOAD_RATE_LIMIT_MAX, env.UPLOAD_RATE_LIMIT_WINDOW_MS);
  app.use(generalLimiter);

  app.get('/health', (_request, response) => {
    const db = getDatabaseStatus();
    response.status(db === 'connected' ? 200 : 503).json({
      db,
      status: db === 'connected' ? 'ok' : 'unavailable',
    });
  });

  app.use('/auth', authLimiter);
  app.use('/auth', authRouter);
  app.use('/complaints', createComplaintsRouter(createEmailService(logger)));
  app.use('/', publicFeedRouter);
  app.use('/uploads/sign', uploadLimiter);
  app.use('/uploads', uploadsRouter);
  app.use('/internal', internalRouter);

  app.use(createErrorHandler(logger));

  return app;
}
