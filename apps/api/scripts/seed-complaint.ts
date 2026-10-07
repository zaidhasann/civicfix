import pino from 'pino';

import { env } from '../src/config/env.js';
import { connectToDatabase, disconnectFromDatabase } from '../src/db/mongoose.js';
import { ComplaintModel } from '../src/models/complaint.js';

const logger = pino({ level: env.NODE_ENV === 'development' ? 'debug' : 'info' });

async function seed(): Promise<void> {
  await connectToDatabase(env.MONGODB_URI, logger);

  const complaint = await ComplaintModel.create({
    anonymousId: 'seed-anonymous-reporter',
    address: '12 Main Street, CivicFix',
    category: 'pothole',
    description: 'A large pothole is affecting traffic near the community center.',
    location: {
      coordinates: [73.8567, 18.5204],
      type: 'Point',
    },
    recipient: {
      department: 'Public Works',
      email: 'public-works@example.gov',
      municipality: 'CivicFix',
      ward: 'Ward 1',
    },
    severity: 3,
    status: 'draft',
    statusHistory: [{ note: 'Created by complaint seed script', status: 'draft' }],
  });

  logger.info({ complaintId: complaint.id }, 'Sample complaint inserted');
}

seed()
  .catch((error: unknown) => {
    logger.error({ err: error }, 'Complaint seed failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectFromDatabase();
  });
