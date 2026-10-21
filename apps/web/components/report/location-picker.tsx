'use client';

import 'mapbox-gl/dist/mapbox-gl.css';

import { useEffect, useRef, useState } from 'react';
import type { Map, Marker } from 'mapbox-gl';

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
}

interface LocationPickerProps {
  coordinates: LocationCoordinates | null;
  currentCoordinates: LocationCoordinates | null;
  onCoordinatesChange: (coordinates: LocationCoordinates) => void;
  onAddressChange: (address: string) => void;
  onUseMyLocation: () => void;
}

const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

async function reverseGeocode(coordinates: LocationCoordinates): Promise<string> {
  if (!mapboxToken)
    return `${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`;
  const response = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${coordinates.longitude},${coordinates.latitude}.json?access_token=${encodeURIComponent(mapboxToken)}&limit=1`,
  );
  if (!response.ok) throw new Error('The address could not be loaded.');
  const body = (await response.json()) as { features?: Array<{ place_name?: string }> };
  return body.features?.[0]?.place_name ?? `${coordinates.latitude}, ${coordinates.longitude}`;
}

export function LocationPicker({
  coordinates,
  currentCoordinates,
  onCoordinatesChange,
  onAddressChange,
  onUseMyLocation,
}: LocationPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [mapError, setMapError] = useState('');
  const selectedCoordinates = coordinates ?? currentCoordinates;

  useEffect(() => {
    let cancelled = false;

    async function createMap(): Promise<void> {
      if (!mapContainerRef.current || !mapboxToken || mapRef.current) return;
      try {
        const mapbox = await import('mapbox-gl');
        if (cancelled || !mapContainerRef.current) return;
        mapbox.default.accessToken = mapboxToken;
        const initial = selectedCoordinates ?? { latitude: 20, longitude: 0 };
        const map = new mapbox.default.Map({
          container: mapContainerRef.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [initial.longitude, initial.latitude],
          zoom: selectedCoordinates ? 14 : 1,
        });
        const marker = new mapbox.default.Marker({ color: '#0891b2', draggable: true })
          .setLngLat([initial.longitude, initial.latitude])
          .addTo(map);
        marker.on('dragend', () => {
          const position = marker.getLngLat();
          onCoordinatesChange({ latitude: position.lat, longitude: position.lng });
        });
        mapRef.current = map;
        markerRef.current = marker;
      } catch {
        if (!cancelled)
          setMapError('The map could not be loaded. You can still use your location.');
      }
    }

    void createMap();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [onCoordinatesChange]);

  useEffect(() => {
    if (!selectedCoordinates) return;
    markerRef.current?.setLngLat([selectedCoordinates.longitude, selectedCoordinates.latitude]);
    const map = mapRef.current;
    if (map) {
      map.flyTo({
        center: [selectedCoordinates.longitude, selectedCoordinates.latitude],
        zoom: Math.max(map.getZoom(), 14),
      });
    }
    void reverseGeocode(selectedCoordinates)
      .then(onAddressChange)
      .catch(() => setMapError('The address could not be loaded. Coordinates were retained.'));
  }, [onAddressChange, selectedCoordinates]);

  return (
    <div className="mt-6 space-y-3">
      {mapboxToken ? (
        <div
          className="h-64 overflow-hidden rounded-lg border border-border"
          ref={mapContainerRef}
        />
      ) : (
        <div className="rounded-lg border border-border bg-neutral-50 p-4 text-sm text-neutral-600">
          Add a Mapbox token to enable the interactive map. Coordinates can still be selected from
          your current location.
        </div>
      )}
      <button
        className="inline-flex items-center gap-2 rounded-md text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onClick={onUseMyLocation}
        type="button"
      >
        <span aria-hidden="true">◎</span>
        Use my location
      </button>
      {mapError ? (
        <p aria-live="polite" className="text-xs text-neutral-600">
          {mapError}
        </p>
      ) : null}
    </div>
  );
}
