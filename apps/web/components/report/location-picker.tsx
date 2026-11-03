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
  const [locationMode, setLocationMode] = useState<'current' | 'other'>(
    coordinates ? 'other' : 'current',
  );
  const [search, setSearch] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [manualLatitude, setManualLatitude] = useState('');
  const [manualLongitude, setManualLongitude] = useState('');
  const selectedCoordinates = coordinates ?? currentCoordinates;

  async function searchLocation(): Promise<void> {
    if (!mapboxToken || !search.trim()) {
      setMapError('Enter a city or area and configure a Mapbox token to search it.');
      return;
    }
    setIsSearching(true);
    setMapError('');
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(search.trim())}.json?access_token=${encodeURIComponent(mapboxToken)}&limit=1`,
      );
      if (!response.ok) throw new Error('The location could not be found.');
      const body = (await response.json()) as {
        features?: Array<{ center?: [number, number]; place_name?: string }>;
      };
      const result = body.features?.[0];
      if (!result?.center || !result.place_name)
        throw new Error('The location could not be found.');
      onCoordinatesChange({ latitude: result.center[1], longitude: result.center[0] });
      onAddressChange(result.place_name);
    } catch (error) {
      setMapError(error instanceof Error ? error.message : 'The location could not be found.');
    } finally {
      setIsSearching(false);
    }
  }

  function applyManualCoordinates(): void {
    const latitude = Number(manualLatitude);
    const longitude = Number(manualLongitude);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      setMapError('Enter a valid latitude (-90 to 90) and longitude (-180 to 180).');
      return;
    }
    onCoordinatesChange({ latitude, longitude });
    onAddressChange(`${latitude}, ${longitude}`);
    setMapError('');
  }

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
      <fieldset>
        <legend className="text-sm font-semibold text-text">Location source</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 text-sm">
            <input
              checked={locationMode === 'current'}
              className="mt-0.5 h-4 w-4 text-primary focus:ring-primary"
              name="location-mode"
              onChange={() => {
                setLocationMode('current');
                onUseMyLocation();
              }}
              type="radio"
            />
            <span>
              <span className="font-semibold">Use my current location</span>
              <span className="mt-1 block text-neutral-600">
                Use this device&apos;s GPS position.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 text-sm">
            <input
              checked={locationMode === 'other'}
              className="mt-0.5 h-4 w-4 text-primary focus:ring-primary"
              name="location-mode"
              onChange={() => setLocationMode('other')}
              type="radio"
            />
            <span>
              <span className="font-semibold">Choose another city or area</span>
              <span className="mt-1 block text-neutral-600">
                Search the issue location instead.
              </span>
            </span>
          </label>
        </div>
      </fieldset>
      {locationMode === 'other' ? (
        <div className="space-y-2 rounded-md bg-neutral-50 p-3">
          <label className="block text-sm font-semibold text-text" htmlFor="location-search">
            Search city, area, landmark, or address
          </label>
          <div className="flex gap-2">
            <input
              className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-sm text-text"
              id="location-search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="e.g. Pune, Shivajinagar"
              value={search}
            />
            <button
              className="min-h-11 rounded-md bg-primary px-3 text-sm font-semibold text-white disabled:opacity-50"
              disabled={isSearching || !search.trim()}
              onClick={() => void searchLocation()}
              type="button"
            >
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </div>
          {!mapboxToken ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-semibold text-neutral-600" htmlFor="manual-latitude">
                Latitude
                <input
                  className="mt-1 min-h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text"
                  id="manual-latitude"
                  inputMode="decimal"
                  onChange={(event) => setManualLatitude(event.target.value)}
                  placeholder="18.5204"
                  value={manualLatitude}
                />
              </label>
              <label className="text-xs font-semibold text-neutral-600" htmlFor="manual-longitude">
                Longitude
                <input
                  className="mt-1 min-h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text"
                  id="manual-longitude"
                  inputMode="decimal"
                  onChange={(event) => setManualLongitude(event.target.value)}
                  placeholder="73.8567"
                  value={manualLongitude}
                />
              </label>
              <button
                className="min-h-10 rounded-md border border-primary px-3 text-sm font-semibold text-primary sm:col-span-2"
                onClick={applyManualCoordinates}
                type="button"
              >
                Use these coordinates
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
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
        onClick={() => {
          setLocationMode('current');
          onUseMyLocation();
        }}
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
