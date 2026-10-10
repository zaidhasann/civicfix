// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useGeolocation, type Coordinates } from './use-geolocation';

const position = {
  coords: {
    latitude: 40.7128,
    longitude: -74.006,
    altitude: null,
    accuracy: 12,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  },
} as GeolocationPosition;

const manualCoords: Coordinates = {
  latitude: 51.5072,
  longitude: -0.1276,
  altitude: null,
  accuracy: 5,
  altitudeAccuracy: null,
  heading: null,
  speed: null,
};

function installGeolocation(error?: GeolocationPositionError) {
  const getCurrentPosition = vi.fn((success: PositionCallback, failure: PositionErrorCallback) => {
    if (error) failure(error);
    else success(position);
  });
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
  return getCurrentPosition;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useGeolocation', () => {
  it('returns a successful position and accuracy', () => {
    const getCurrentPosition = installGeolocation();
    const { result } = renderHook(() => useGeolocation());

    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(result.current.status).toBe('success');
    expect(result.current.coords?.latitude).toBe(position.coords.latitude);
    expect(result.current.accuracy).toBe(12);
  });

  it.each([
    [1, 'denied'],
    [2, 'unavailable'],
    [3, 'timeout'],
  ] as const)('distinguishes geolocation error code %i as %s', (code, status) => {
    const error = {
      code,
      message: 'location error',
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    };
    installGeolocation(error as GeolocationPositionError);
    const { result } = renderHook(() => useGeolocation());

    expect(result.current.status).toBe(status);
    expect(result.current.error).toBe(error);
  });

  it('reports unavailable when the browser has no geolocation API', () => {
    vi.stubGlobal('navigator', {});
    const { result } = renderHook(() => useGeolocation());

    expect(result.current.status).toBe('unavailable');
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('retries and supports a manual override', () => {
    const getCurrentPosition = installGeolocation();
    const { result } = renderHook(() => useGeolocation());

    act(() => result.current.retry());
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);

    act(() => result.current.setManualOverride(manualCoords));
    expect(result.current.status).toBe('manual');
    expect(result.current.coords).toEqual(manualCoords);
    expect(result.current.accuracy).toBe(5);
  });
});
