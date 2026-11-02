import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CivicFix',
    short_name: 'CivicFix',
    description: 'Report civic issues and help improve your community.',
    start_url: '/report',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#0e7490',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
      { src: '/apple-icon.svg', sizes: '180x180', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}
