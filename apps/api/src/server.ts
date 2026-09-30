import { createServer, type Server } from 'node:http';

import pino from 'pino';

import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectToDatabase, disconnectFromDatabase } from './db/mongoose.js';

const logger = pino({ level: env.NODE_ENV === 'development' ? 'debug' : 'info' });
const app = createApp(logger);

let httpServer: Server | undefined;

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutdown requested');
  if (httpServer) {
    await new Promise<void>((resolve, reject) => {
      httpServer?.close((error) => (error ? reject(error) : resolve()));
    });
  }
  await disconnectFromDatabase();
  logger.info('API shutdown complete');
}

async function start(): Promise<void> {
  await connectToDatabase(env.MONGODB_URI, logger);
  httpServer = createServer(app).listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'CivicFix API listening');
  });
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

start().catch((error: unknown) => {
  logger.fatal({ err: error }, 'API startup failed');
  process.exitCode = 1;
});
