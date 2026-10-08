'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { Button } from '../ui/button';

const MAX_INPUT_SIZE = 10 * 1024 * 1024;
const MAX_OUTPUT_SIZE = 1.5 * 1024 * 1024;
const MAX_DIMENSION = 1600;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface PhotoCaptureProps {
  onChange: (file: File | null) => void;
}

function getOutputName(name: string): string {
  const baseName = name.replace(/\.[^/.]+$/, '') || 'civicfix-photo';
  return `${baseName}.jpg`;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('This image could not be read. Try another photo.'));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('The image could not be compressed. Try another photo.'));
      },
      'image/jpeg',
      quality,
    );
  });
}

async function compressImage(file: File): Promise<File> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error('Use a JPG, PNG, or WebP image.');
  }
  if (file.size > MAX_INPUT_SIZE) {
    throw new Error('That image is too large. Choose a photo under 10MB.');
  }

  const image = await loadImage(file);
  let width = image.naturalWidth;
  let height = image.naturalHeight;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  let blob: Blob | undefined;
  let quality = 0.84;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not prepare this image.');
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    blob = await canvasToBlob(canvas, quality);

    if (blob.size <= MAX_OUTPUT_SIZE) break;
    if (quality > 0.5) {
      quality -= 0.08;
    } else {
      width = Math.max(1, Math.round(width * 0.8));
      height = Math.max(1, Math.round(height * 0.8));
      quality = 0.82;
    }
  }

  if (!blob || blob.size > MAX_OUTPUT_SIZE) {
    throw new Error('This image could not be reduced below 1.5MB. Try a smaller photo.');
  }

  return new File([blob], getOutputName(file.name), {
    lastModified: Date.now(),
    type: 'image/jpeg',
  });
}

export function PhotoCapture({ onChange }: PhotoCaptureProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  async function processFile(file: File | undefined): Promise<void> {
    if (!file) return;
    setError('');
    setIsProcessing(true);

    try {
      const compressedFile = await compressImage(file);
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(compressedFile);
      });
      setFileName(compressedFile.name);
      onChange(compressedFile);
    } catch (processingError) {
      onChange(null);
      setError(
        processingError instanceof Error
          ? processingError.message
          : 'We could not use that image. Try another photo.',
      );
    } finally {
      setIsProcessing(false);
    }
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>): void {
    void processFile(event.target.files?.[0]);
    event.target.value = '';
  }

  function handleDrop(event: React.DragEvent<HTMLLabelElement>): void {
    event.preventDefault();
    setIsDragging(false);
    void processFile(event.dataTransfer.files[0]);
  }

  function clearPhoto(): void {
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return '';
    });
    setFileName('');
    setError('');
    onChange(null);
  }

  if (previewUrl) {
    return (
      <div className="space-y-4">
        <div className="overflow-hidden rounded-lg border border-border bg-neutral-100">
          <img alt="Selected issue" className="max-h-80 w-full object-contain" src={previewUrl} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 truncate text-sm text-neutral-600" title={fileName}>
            {fileName}
          </p>
          <Button onClick={clearPhoto} size="sm" variant="secondary">
            Retake photo
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <input
        accept={ACCEPTED_TYPES.join(',')}
        capture="environment"
        className="sr-only"
        id={`${inputId}-camera`}
        onChange={handleInputChange}
        ref={inputRef}
        type="file"
      />
      <input
        accept={ACCEPTED_TYPES.join(',')}
        className="sr-only"
        id={`${inputId}-gallery`}
        onChange={handleInputChange}
        type="file"
      />
      <label
        className={`flex min-h-48 flex-col items-center justify-center rounded-lg border-2 border-dashed px-5 text-center transition ${
          isDragging
            ? 'border-primary bg-primary/10'
            : 'border-border bg-neutral-50 hover:border-primary hover:bg-primary/5'
        }`}
        htmlFor={`${inputId}-gallery`}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <svg aria-hidden="true" className="h-10 w-10 text-primary" fill="none" viewBox="0 0 24 24">
          <path
            d="M4 16.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1.5M8 10l4-4m0 0 4 4m-4-4v11"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
        <span className="mt-3 font-semibold text-text">
          {isProcessing ? 'Preparing your photo…' : 'Add a photo'}
        </span>
        <span className="mt-1 text-sm text-neutral-500">
          Drop an image here or choose one from your device
        </span>
        <span className="mt-4 flex flex-wrap justify-center gap-2">
          <Button
            onClick={(event) => {
              event.preventDefault();
              inputRef.current?.click();
            }}
            size="sm"
            type="button"
          >
            Take a photo
          </Button>
          <span className="inline-flex min-h-9 items-center rounded-md border border-border bg-surface px-3 text-sm font-semibold text-text">
            Browse gallery
          </span>
        </span>
        <span className="mt-3 text-xs text-neutral-500">JPG, PNG, or WebP · up to 10MB</span>
      </label>
      {error ? (
        <p aria-live="polite" className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
