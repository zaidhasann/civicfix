import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer';
import type { Logger } from 'pino';

import { env } from '../config/env.js';
import type { Complaint } from '../models/complaint.js';

export interface ComplaintEmailService {
  sendApprovedComplaint(complaint: Complaint): Promise<void>;
}

function replyToForComplaint(complaint: Complaint): string {
  return `complaint-${complaint.id}@${env.EMAIL_REPLY_TO_DOMAIN}`;
}

function buildMessage(complaint: Complaint): SendMailOptions {
  const photoLine = complaint.photoUrl
    ? `Photo: ${complaint.photoUrl}`
    : 'Photo: No photo was attached to this report.';
  const text = `${complaint.finalEmail ?? complaint.aiDraft?.body ?? ''}\n\n${photoLine}`;
  const htmlBody = (complaint.finalEmail ?? complaint.aiDraft?.body ?? '')
    .split('\n')
    .map((line) => `<p>${escapeHtml(line) || '&nbsp;'}</p>`)
    .join('');
  const html = `${htmlBody}<p>${complaint.photoUrl ? `<a href="${escapeHtml(complaint.photoUrl)}">View report photo</a>` : 'No photo was attached to this report.'}</p>`;

  return {
    from: env.EMAIL_FROM,
    to: complaint.recipient.email,
    replyTo: replyToForComplaint(complaint),
    subject: complaint.aiDraft?.subject ?? `CivicFix report ${complaint.id}`,
    text,
    html,
    ...(complaint.photoUrl && env.EMAIL_ATTACH_PHOTO
      ? { attachments: [{ filename: 'civicfix-report-photo', path: complaint.photoUrl }] }
      : {}),
  };
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      (
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        }) as Record<string, string>
      )[character] ?? character,
  );
}

function createTransporter(): Transporter {
  if (env.EMAIL_MODE === 'sendgrid') {
    return nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: { user: 'apikey', pass: env.SENDGRID_API_KEY },
    });
  }
  return nodemailer.createTransport({
    host: env.EMAIL_SMTP_HOST,
    port: env.EMAIL_SMTP_PORT,
    secure: env.EMAIL_SMTP_PORT === 465,
    auth: env.EMAIL_SMTP_USER
      ? { user: env.EMAIL_SMTP_USER, pass: env.EMAIL_SMTP_PASS }
      : undefined,
  });
}

export function createEmailService(logger: Logger): ComplaintEmailService {
  const transporter = env.EMAIL_MODE === 'dry-run' ? undefined : createTransporter();

  return {
    async sendApprovedComplaint(complaint) {
      const message = buildMessage(complaint);
      if (!transporter) {
        logger.info(
          {
            email: {
              complaintId: complaint.id,
              to: message.to,
              replyTo: message.replyTo,
              subject: message.subject,
              mode: 'dry-run',
            },
          },
          'Email send (dry-run)',
        );
        return;
      }

      let attempt = 0;
      while (true) {
        try {
          await transporter.sendMail(message);
          return;
        } catch (error) {
          if (attempt >= env.EMAIL_MAX_RETRIES) throw error;
          const delay = env.EMAIL_RETRY_BASE_DELAY_MS * 2 ** attempt;
          attempt += 1;
          logger.warn({ err: error, attempt, delay }, 'Email send failed; retrying');
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    },
  };
}
