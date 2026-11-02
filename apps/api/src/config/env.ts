import 'dotenv/config';

import { z } from 'zod';

export const booleanEnv = z.preprocess(
  (value) => (typeof value === 'string' ? value.toLowerCase() : value),
  z.enum(['true', '1', 'false', '0', '']).default('false').transform((value) => {
    return value === 'true' || value === '1';
  }),
);

const envSchema = z
  .object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:3000'),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  TRUST_PROXY: booleanEnv,
  AGENT_BASE_URL: z.string().url().default('http://localhost:8000'),
  AGENT_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  CLOUDINARY_CLOUD_NAME: z.string().min(1, 'CLOUDINARY_CLOUD_NAME is required'),
  CLOUDINARY_API_KEY: z.string().min(1, 'CLOUDINARY_API_KEY is required'),
  CLOUDINARY_API_SECRET: z.string().min(1, 'CLOUDINARY_API_SECRET is required'),
  AGENT_SHARED_SECRET: z.string().min(1, 'AGENT_SHARED_SECRET is required'),
  EMAIL_MODE: z.enum(['dry-run', 'smtp', 'sendgrid']).default('dry-run'),
  EMAIL_FROM: z.string().email().default('noreply@civicfix.local'),
  EMAIL_REPLY_TO_DOMAIN: z.string().min(1).default('reply.civicfix.local'),
  INBOUND_EMAIL_WEBHOOK_SECRET: z.string().min(1).default('test-inbound-email-secret'),
  EMAIL_SMTP_HOST: z.string().default(''),
  EMAIL_SMTP_PORT: z.coerce.number().int().positive().default(587),
  EMAIL_SMTP_USER: z.string().default(''),
  EMAIL_SMTP_PASS: z.string().default(''),
  SENDGRID_API_KEY: z.string().default(''),
  EMAIL_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(3),
  EMAIL_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(250),
  EMAIL_ATTACH_PHOTO: booleanEnv,
  FOLLOW_UP_SCHEDULER_CRON: z.string().min(1).default('0 * * * *'),
  FOLLOW_UP_AFTER_DAYS: z.coerce.number().int().positive().default(14),
  })
  .superRefine((values, context) => {
    for (const origin of values.CORS_ORIGIN.split(',').map((item) => item.trim())) {
      try {
        new URL(origin);
      } catch {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CORS_ORIGIN'],
          message: `Invalid CORS origin: ${origin}`,
        });
      }
    }
    if (values.COOKIE_SAME_SITE === 'none' && values.NODE_ENV !== 'production') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['COOKIE_SAME_SITE'],
        message: 'COOKIE_SAME_SITE=none requires NODE_ENV=production',
      });
    }
  });

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const details = parsedEnv.error.issues
    .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
    .join('; ');
  throw new Error(`Environment validation failed: ${details}`);
}

export const env = parsedEnv.data;
export type Env = typeof env;
