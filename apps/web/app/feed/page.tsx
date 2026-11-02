'use client';

import 'mapbox-gl/dist/mapbox-gl.css';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { GeoJSONSource, Map } from 'mapbox-gl';

import { ProtectedRoute } from '../../components/auth/protected-route';
import { AppShell, PageContainer } from '../../components/layout/app-shell';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { ErrorState } from '../../components/ui/error-state';
import { LoadingState } from '../../components/ui/loading-state';
import { apiFetch, ApiError } from '../../lib/api';
import { useGeolocation } from '../../hooks/use-geolocation';

type Category =
  'pothole' | 'streetlight' | 'waste' | 'water' | 'traffic' | 'public-safety' | 'other';
type Status = 'sent' | 'acknowledged' | 'resolved';
type FeedItem = {
  id: string;
  category: Category;
  status: Status;
  createdAt: string;
  supportCount: number;
  distanceMeters?: number;
  location: { type: 'Point'; coordinates: [number, number] };
};

const categories: Array<Category | 'all'> = [
  'all',
  'pothole',
  'streetlight',
  'waste',
  'water',
  'traffic',
  'public-safety',
  'other',
];
const statuses: Array<Status | 'all'> = ['all', 'sent', 'acknowledged', 'resolved'];
const colors: Record<Category, string> = {
  pothole: '#dc2626',
  streetlight: '#f59e0b',
  waste: '#16a34a',
  water: '#2563eb',
  traffic: '#9333ea',
  'public-safety': '#be123c',
  other: '#0891b2',
};
const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

function FeedContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const geolocation = useGeolocation();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'list' | 'map'>(
    searchParams.get('view') === 'map' ? 'map' : 'list',
  );
  const category = (searchParams.get('category') as Category | 'all' | null) ?? 'all';
  const status = (searchParams.get('status') as Status | 'all' | null) ?? 'all';
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const center = geolocation.coords ?? { latitude: 20, longitude: 0 };

  function updateUrl(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    router.replace(`${pathname}?${next.toString()}`);
  }

  useEffect(() => {
    const params = new URLSearchParams({
      areaLat: String(center.latitude),
      areaLng: String(center.longitude),
      areaRadius: '10000',
    });
    if (category !== 'all') params.set('category', category);
    if (status !== 'all') params.set('status', status);
    setLoading(true);
    void apiFetch<{ items: FeedItem[] }>(`/feed?${params}`)
      .then((result) => {
        setItems(result.items);
        setError('');
      })
      .catch((requestError) => {
        setError(
          requestError instanceof ApiError ? requestError.message : 'Could not load the feed.',
        );
      })
      .finally(() => setLoading(false));
  }, [category, status, center.latitude, center.longitude]);

  useEffect(() => {
    let cancelled = false;
    async function createMap() {
      if (view !== 'map' || !token || !mapContainer.current || mapRef.current) return;
      const mapbox = await import('mapbox-gl');
      if (cancelled || !mapContainer.current) return;
      mapbox.default.accessToken = token;
      const map = new mapbox.default.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [center.longitude, center.latitude],
        zoom: 11,
      });
      map.on('load', () => {
        map.addSource('feed', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 50,
        });
        map.addLayer({
          id: 'feed-clusters',
          type: 'circle',
          source: 'feed',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#0f766e',
            'circle-radius': ['step', ['get', 'point_count'], 18, 25, 24, 100, 30],
          },
        });
        map.addLayer({
          id: 'feed-points',
          type: 'circle',
          source: 'feed',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': ['get', 'color'],
            'circle-radius': 8,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff',
          },
        });
      });
      mapRef.current = map;
    }
    void createMap();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [center.latitude, center.longitude, view]);

  useEffect(() => {
    const source = mapRef.current?.getSource('feed') as GeoJSONSource | undefined;
    if (!source) return;
    source.setData({
      type: 'FeatureCollection',
      features: items.map((item) => ({
        type: 'Feature',
        geometry: item.location,
        properties: { ...item, color: colors[item.category] },
      })),
    });
  }, [items]);

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}${pathname}?${searchParams.toString()}`;
  }, [pathname, searchParams]);

  return (
    <AppShell>
      <main>
        <PageContainer>
          <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-primary">
                  Community
                </p>
                <h1 className="mt-1 text-3xl font-bold tracking-tight text-text">
                  Public issue feed
                </h1>
                <p className="mt-2 text-sm text-neutral-600">
                  Anonymous, opt-in reports from your area.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={view === 'list' ? 'primary' : 'secondary'}
                  onClick={() => {
                    setView('list');
                    updateUrl({ view: null });
                  }}
                >
                  List
                </Button>
                <Button
                  size="sm"
                  variant={view === 'map' ? 'primary' : 'secondary'}
                  onClick={() => {
                    setView('map');
                    updateUrl({ view: 'map' });
                  }}
                >
                  Map
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void navigator.clipboard?.writeText(shareUrl)}
                >
                  Share
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-text">
                Category
                <select
                  className="mt-2 min-h-10 w-full rounded-md border border-border bg-surface px-3 font-normal"
                  value={category}
                  onChange={(event) =>
                    updateUrl({
                      category: event.target.value === 'all' ? null : event.target.value,
                    })
                  }
                >
                  {categories.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold text-text">
                Status
                <select
                  className="mt-2 min-h-10 w-full rounded-md border border-border bg-surface px-3 font-normal"
                  value={status}
                  onChange={(event) =>
                    updateUrl({ status: event.target.value === 'all' ? null : event.target.value })
                  }
                >
                  {statuses.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {error ? <ErrorState message={error} onRetry={() => window.location.reload()} /> : null}
            {loading ? <LoadingState label="Loading public issues" /> : null}
            {!loading && !error && view === 'map' ? (
              <div
                className="h-[min(70vh,42rem)] rounded-xl border border-border"
                ref={mapContainer}
              />
            ) : null}
            {!loading && !error && view === 'map' && !token ? (
              <p className="text-sm text-neutral-600">
                Add NEXT_PUBLIC_MAPBOX_TOKEN to enable the map view.
              </p>
            ) : null}
            {!loading && !error && view === 'list' ? (
              items.length ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((item) => (
                    <Link href={`/complaints/${item.id}`} key={item.id}>
                      <Card className="h-full transition hover:-translate-y-0.5 hover:shadow-lg">
                        <CardContent className="space-y-3 p-4">
                          <div className="flex items-center justify-between gap-2">
                            <Badge variant="info">{item.category}</Badge>
                            <Badge variant={item.status === 'resolved' ? 'success' : 'neutral'}>
                              <span aria-hidden="true">{item.status}</span>
                              <span className="sr-only">Status: {item.status}</span>
                            </Badge>
                          </div>
                          <p className="text-sm text-neutral-600">{item.supportCount} supporters</p>
                          <p className="text-xs text-neutral-500">
                            {new Date(item.createdAt).toLocaleDateString()}
                          </p>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-neutral-600">No public issues match these filters.</p>
              )
            ) : null}
          </div>
        </PageContainer>
      </main>
    </AppShell>
  );
}

export default function FeedPage() {
  return (
    <ProtectedRoute>
      <FeedContent />
    </ProtectedRoute>
  );
}
