'use client';

import 'mapbox-gl/dist/mapbox-gl.css';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { GeoJSONSource, Map } from 'mapbox-gl';

import { ProtectedRoute } from '../../components/auth/protected-route';
import { AppShell, PageContainer } from '../../components/layout/app-shell';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { EmptyState } from '../../components/ui/empty-state';
import { ErrorState } from '../../components/ui/error-state';
import { LoadingState } from '../../components/ui/loading-state';
import { apiFetch, ApiError } from '../../lib/api';
import { useGeolocation } from '../../hooks/use-geolocation';

type Category =
  'pothole' | 'streetlight' | 'waste' | 'water' | 'traffic' | 'public-safety' | 'other';
type NearbyIssue = {
  id: string;
  category: Category;
  status: string;
  createdAt: string;
  distanceMeters?: number;
  supportCount: number;
  location: { type: 'Point'; coordinates: [number, number] };
};

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

function MapContent() {
  const geolocation = useGeolocation();
  const [issues, setIssues] = useState<NearbyIssue[]>([]);
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const center = geolocation.coords ?? { latitude: 20, longitude: 0 };

  useEffect(() => {
    const params = new URLSearchParams({
      lat: String(center.latitude),
      lng: String(center.longitude),
      radius: '10000',
    });
    if (category !== 'all') params.set('category', category);
    setLoading(true);
    void apiFetch<{ items: NearbyIssue[] }>(`/complaints/nearby?${params}`)
      .then((result) => {
        setIssues(result.items);
        setError('');
      })
      .catch((requestError) => {
        setError(
          requestError instanceof ApiError ? requestError.message : 'Could not load map issues.',
        );
      })
      .finally(() => setLoading(false));
  }, [category, center.latitude, center.longitude]);

  useEffect(() => {
    let cancelled = false;
    async function createMap() {
      if (!token || !mapContainer.current || mapRef.current) return;
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
        map.addSource('issues', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 50,
        });
        map.addLayer({
          id: 'clusters',
          type: 'circle',
          source: 'issues',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#0f766e',
            'circle-radius': ['step', ['get', 'point_count'], 18, 25, 24, 100, 30],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          },
        });
        map.addLayer({
          id: 'cluster-count',
          type: 'symbol',
          source: 'issues',
          filter: ['has', 'point_count'],
          layout: { 'text-field': '{point_count_abbreviated}', 'text-size': 12 },
          paint: { 'text-color': '#ffffff' },
        });
        map.addLayer({
          id: 'issue-points',
          type: 'circle',
          source: 'issues',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': ['get', 'color'],
            'circle-radius': 8,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          },
        });
        map.on('click', 'clusters', (event) => {
          const feature = map.queryRenderedFeatures(event.point, { layers: ['clusters'] })[0];
          const clusterId = feature.properties?.cluster_id;
          if (typeof clusterId !== 'number') return;
          (map.getSource('issues') as GeoJSONSource).getClusterExpansionZoom(
            clusterId,
            (clusterError, zoom) => {
              if (!clusterError && zoom !== null) {
                const coordinates = (feature.geometry as GeoJSON.Point).coordinates as [
                  number,
                  number,
                ];
                map.easeTo({ center: coordinates, zoom });
              }
            },
          );
        });
        map.on('click', 'issue-points', (event) => {
          const feature = map.queryRenderedFeatures(event.point, { layers: ['issue-points'] })[0];
          const coordinates = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
          const properties = feature.properties ?? {};
          new mapbox.default.Popup()
            .setLngLat(coordinates)
            .setHTML(
              `<strong>${String(properties.category)}</strong><br/>${String(properties.supportCount)} supporters<br/><a href="/complaints/${String(properties.id)}">View issue</a>`,
            )
            .addTo(map);
        });
        map.on('mouseenter', 'clusters', () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'clusters', () => {
          map.getCanvas().style.cursor = '';
        });
        map.on('mouseenter', 'issue-points', () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'issue-points', () => {
          map.getCanvas().style.cursor = '';
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
  }, [center.latitude, center.longitude]);

  useEffect(() => {
    const source = mapRef.current?.getSource('issues') as GeoJSONSource | undefined;
    if (!source) return;
    source.setData({
      type: 'FeatureCollection',
      features: issues.map((issue) => ({
        type: 'Feature',
        geometry: issue.location,
        properties: { ...issue, color: colors[issue.category] },
      })),
    });
  }, [issues]);

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
                <h1 className="mt-1 text-3xl font-bold tracking-tight text-text">Nearby issues</h1>
                <p className="mt-2 text-sm text-neutral-600">
                  Clustered reports within 10 km of your location.
                </p>
              </div>
              <Button onClick={() => (window.location.href = '/report')}>Report here</Button>
            </div>
            <div className="flex flex-wrap gap-2" aria-label="Map category filters">
              <Button
                size="sm"
                variant={category === 'all' ? 'primary' : 'secondary'}
                onClick={() => setCategory('all')}
              >
                All
              </Button>
              {(Object.keys(colors) as Category[]).map((value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={category === value ? 'primary' : 'secondary'}
                  onClick={() => setCategory(value)}
                >
                  {value}
                </Button>
              ))}
            </div>
            {error ? <ErrorState message={error} onRetry={() => window.location.reload()} /> : null}
            {loading ? <LoadingState label="Loading nearby issues" /> : null}
            {token ? (
              <div
                className="h-[min(70vh,42rem)] overflow-hidden rounded-xl border border-border"
                ref={mapContainer}
              />
            ) : (
              <Card>
                <CardContent className="p-5">
                  <EmptyState
                    title="Mapbox is not configured"
                    description="Add NEXT_PUBLIC_MAPBOX_TOKEN to enable the interactive clustered map."
                  />
                </CardContent>
              </Card>
            )}
            {!loading && !error && !token && issues.length === 0 ? (
              <p className="text-sm text-neutral-600">No public issues found nearby.</p>
            ) : null}
            {!token && issues.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {issues.map((issue) => (
                  <Link href={`/complaints/${issue.id}`} key={issue.id}>
                    <Card>
                      <CardContent className="p-4">
                        <Badge variant="info">{issue.category}</Badge>
                        <p className="mt-2 text-sm">{issue.supportCount} supporters</p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </PageContainer>
      </main>
    </AppShell>
  );
}

export default function MapPage() {
  return (
    <ProtectedRoute>
      <MapContent />
    </ProtectedRoute>
  );
}
