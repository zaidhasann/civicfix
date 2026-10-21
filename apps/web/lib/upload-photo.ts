import { gps } from 'exifr';

import { apiPost } from './api';

const cloudinaryUploadUrl = (cloudName: string): string =>
  `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/auto/upload`;

export interface ExifCoordinates {
  latitude: number;
  longitude: number;
}

export interface PhotoUploadResult {
  url: string;
  exifCoords: ExifCoordinates | null;
}

interface UploadSignature {
  allowed_formats: string;
  api_key: string;
  cloud_name: string;
  folder: string;
  max_file_size: string;
  signature: string;
  timestamp: string;
}

export interface PhotoUploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

async function readExifCoordinates(file: File): Promise<ExifCoordinates | null> {
  try {
    const metadata = await gps(file);
    if (metadata && Number.isFinite(metadata.latitude) && Number.isFinite(metadata.longitude)) {
      return { latitude: metadata.latitude, longitude: metadata.longitude };
    }
  } catch {
    // EXIF is optional and some image formats do not contain readable GPS metadata.
  }
  return null;
}

function uploadToCloudinary(
  file: File,
  signature: UploadSignature,
  onProgress?: (progress: PhotoUploadProgress) => void,
): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('api_key', signature.api_key);
  formData.append('timestamp', signature.timestamp);
  formData.append('signature', signature.signature);
  formData.append('folder', signature.folder);
  formData.append('allowed_formats', signature.allowed_formats);
  formData.append('max_file_size', signature.max_file_size);

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', cloudinaryUploadUrl(signature.cloud_name));
    request.responseType = 'json';
    request.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable) return;
      onProgress?.({
        loaded: event.loaded,
        total: event.total,
        percent: Math.round((event.loaded / event.total) * 100),
      });
    });
    request.addEventListener('error', () => reject(new Error('Photo upload failed.')));
    request.addEventListener('abort', () => reject(new Error('Photo upload was cancelled.')));
    request.addEventListener('load', () => {
      const response = request.response as {
        secure_url?: string;
        url?: string;
        error?: { message?: string };
      } | null;
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(response?.error?.message ?? 'Photo upload failed.'));
        return;
      }
      const url = response?.secure_url ?? response?.url;
      if (!url) {
        reject(new Error('Photo upload returned no URL.'));
        return;
      }
      resolve(url);
    });
    request.send(formData);
  });
}

export async function uploadPhoto(
  file: File,
  onProgress?: (progress: PhotoUploadProgress) => void,
): Promise<PhotoUploadResult> {
  const [signature, exifCoords] = await Promise.all([
    apiPost<UploadSignature>('/uploads/sign'),
    readExifCoordinates(file),
  ]);
  const url = await uploadToCloudinary(file, signature, onProgress);
  return { exifCoords, url };
}
