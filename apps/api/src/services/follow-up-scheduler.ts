import cron, { type ScheduledTask } from 'node-cron';
import type { Logger } from 'pino';

import { env } from '../config/env.js';
import { ComplaintModel } from '../models/complaint.js';

export interface FollowUpSchedulerOptions {
  now?: () => Date;
  afterDays?: number;
}

export async function runFollowUpScheduler(
  logger: Logger,
  options: FollowUpSchedulerOptions = {},
): Promise<number> {
  const now = options.now?.() ?? new Date();
  const afterDays = options.afterDays ?? env.FOLLOW_UP_AFTER_DAYS;
  const cutoff = new Date(now.getTime() - afterDays * 24 * 60 * 60 * 1000);
  const candidates = await ComplaintModel.find({
    status: 'sent',
    sentAt: { $lte: cutoff },
    followUpSuggested: { $exists: false },
  })
    .select('_id sentAt recipient finalEmail')
    .lean();

  let created = 0;
  for (const candidate of candidates) {
    const suggestedAt = now;
    const draftSubject = `Follow-up: ${candidate.recipient.department} complaint`;
    const draftBody =
      `Hello ${candidate.recipient.department},\n\n` +
      `I am following up on my complaint submitted ${candidate.sentAt?.toISOString() ?? 'recently'}. ` +
      'Please share an update on its status and expected resolution timeline.\n\nThank you.';
    const notificationSentAt = now;

    const result = await ComplaintModel.updateOne(
      {
        _id: candidate._id,
        status: 'sent',
        sentAt: { $lte: cutoff },
        followUpSuggested: { $exists: false },
      },
      {
        $set: {
          followUpSuggested: {
            suggestedAt,
            draftSubject,
            draftBody,
            notificationSentAt,
          },
        },
      },
    );

    if (result.modifiedCount !== 1) continue;
    created += 1;
    logger.info(
      {
        complaintId: candidate._id.toString(),
        notification: 'follow_up_reminder',
        suggestedAt,
      },
      'Follow-up reminder suggested',
    );
  }

  return created;
}

export function startFollowUpScheduler(logger: Logger): ScheduledTask {
  const task = cron.schedule(env.FOLLOW_UP_SCHEDULER_CRON, () => {
    void runFollowUpScheduler(logger).catch((error: unknown) => {
      logger.error({ err: error }, 'Follow-up reminder scheduler failed');
    });
  });
  logger.info({ schedule: env.FOLLOW_UP_SCHEDULER_CRON }, 'Follow-up reminder scheduler started');
  return task;
}
