const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const accessTokenKey = 'civicfix_access_token';

export interface ApiUser {
  id: string;
  name: string;
  email?: string;
  role: 'citizen' | 'admin' | 'anonymous';
  anonymous?: boolean;
}

export interface AuthResponse {
  accessToken: string;
  user: ApiUser;
}

export interface AnonymousResponse {
  accessToken: string;
  anonymousId: string;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(accessTokenKey);
}

export function setAccessToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) {
    window.localStorage.setItem(accessTokenKey, token);
  } else {
    window.localStorage.removeItem(accessTokenKey);
  }
}

async function parseResponse(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : 'Request failed';
    throw new ApiError(message, response.status);
  }
  return body;
}

async function refreshAccessToken(): Promise<string | null> {
  const response = await fetch(`${API_URL}/auth/refresh`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
    method: 'POST',
  });
  if (!response.ok) return null;

  const body = (await parseResponse(response)) as AuthResponse;
  setAccessToken(body.accessToken);
  return body.accessToken;
}

export interface ApiRequestOptions extends RequestInit {
  skipRefresh?: boolean;
}

function canRefresh(path: string): boolean {
  return !['/auth/login', '/auth/register', '/auth/anonymous', '/auth/refresh'].includes(path);
}

export async function apiFetch<T>(
  path: string,
  { skipRefresh = false, ...options }: ApiRequestOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (response.status === 401 && !skipRefresh && canRefresh(path)) {
    const refreshedToken = await refreshAccessToken();
    if (refreshedToken) {
      return apiFetch<T>(path, { ...options, skipRefresh: true });
    }
  }

  return (await parseResponse(response)) as T;
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    body: body === undefined ? undefined : JSON.stringify(body),
    method: 'POST',
  });
}
