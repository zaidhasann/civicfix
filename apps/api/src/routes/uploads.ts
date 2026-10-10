import { createHash } from 'node:crypto';
import { Router, type Request, type Response } from 'express';

import { env } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';

const uploadFolder = 'complaints/';
const allowedFormats = ['jpg', 'jpeg', 'png', 'webp'] as const;
const maxFileSize = 10 * 1024 * 1024;

function createCloudinarySignature(parameters: Record<string, string>): string {
  const parameterString = Object.entries(parameters)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  return createHash('sha1').update(`${parameterString}${env.CLOUDINARY_API_SECRET}`).digest('hex');
}

export const uploadsRouter = Router();

uploadsRouter.post('/sign', requireAuth, (_request: Request, response: Response) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const signatureParameters = {
    allowed_formats: allowedFormats.join(','),
    folder: uploadFolder,
    max_file_size: String(maxFileSize),
    timestamp: String(timestamp),
  };

  response.json({
    ...signatureParameters,
    api_key: env.CLOUDINARY_API_KEY,
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    signature: createCloudinarySignature(signatureParameters),
  });
});
