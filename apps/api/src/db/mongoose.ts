import mongoose from 'mongoose';
import type { Logger } from 'pino';

export type DatabaseStatus = 'disconnected' | 'connected' | 'connecting' | 'disconnecting';

let listenersRegistered = false;

function registerConnectionEvents(logger: Logger) {
  if (listenersRegistered) return;
  listenersRegistered = true;

  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('error', (error: Error) =>
    logger.error({ err: error }, 'MongoDB connection error'),
  );
}

export function getDatabaseStatus(): DatabaseStatus {
  switch (mongoose.connection.readyState) {
    case 1:
      return 'connected';
    case 2:
      return 'connecting';
    case 3:
      return 'disconnecting';
    default:
      return 'disconnected';
  }
}

export async function connectToDatabase(
  uri: string,
  logger: Logger,
  maxRetries = 5,
  retryDelayMs = 1000,
): Promise<void> {
  registerConnectionEvents(logger);

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      return;
    } catch (error) {
      logger.error({ err: error, attempt, maxRetries }, 'MongoDB connection attempt failed');
      if (attempt === maxRetries) throw error;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
    }
  }
}

export async function disconnectFromDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
