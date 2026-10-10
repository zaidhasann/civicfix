'use client';

import { useCallback, useEffect, useState } from 'react';

export type GeolocationStatus =
  'idle' | 'loading' | 'success' | 'denied' | 'unavailable' | 'timeout' | 'error' | 'manual';

export type Coordinates = {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
};

export type GeolocationHookState = {
  coords: Coordinates | null;
  accuracy: number | null;
  status: GeolocationStatus;
  error: Error | GeolocationPositionError | null;
  retry: () => void;
  setManualOverride: (coords: Coordinates | null) => void;
};

function toCoordinates(position: GeolocationPosition): Coordinates {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    altitude: position.coords.altitude,
    accuracy: position.coords.accuracy,
    altitudeAccuracy: position.coords.altitudeAccuracy,
    heading: position.coords.heading,
    speed: position.coords.speed,
  };
}

function errorForStatus(error: GeolocationPositionError): GeolocationStatus {
  if (error.code === error.PERMISSION_DENIED) return 'denied';
  if (error.code === error.POSITION_UNAVAILABLE) return 'unavailable';
  if (error.code === error.TIMEOUT) return 'timeout';
  return 'error';
}

export function useGeolocation(): GeolocationHookState {
  const [state, setState] = useState<Omit<GeolocationHookState, 'retry' | 'setManualOverride'>>({
    coords: null,
    accuracy: null,
    status: 'idle',
    error: null,
  });

  const requestLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({
        coords: null,
        accuracy: null,
        status: 'unavailable',
        error: new Error('Geolocation is not available'),
      });
      return;
    }

    setState((current) => ({ ...current, status: 'loading', error: null }));
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = toCoordinates(position);
        setState({ coords, accuracy: coords.accuracy, status: 'success', error: null });
      },
      (error) => {
        setState({ coords: null, accuracy: null, status: errorForStatus(error), error });
      },
    );
  }, []);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  const setManualOverride = useCallback((coords: Coordinates | null) => {
    setState({
      coords,
      accuracy: coords?.accuracy ?? null,
      status: coords ? 'manual' : 'idle',
      error: null,
    });
  }, []);

  return { ...state, retry: requestLocation, setManualOverride };
}
