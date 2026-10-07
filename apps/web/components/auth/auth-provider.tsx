'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  apiPost,
  getAccessToken,
  setAccessToken,
  type AnonymousResponse,
  type ApiUser,
  type AuthResponse,
} from '../../lib/api';

interface LoginCredentials {
  email: string;
  password: string;
}

interface SignupCredentials extends LoginCredentials {
  name: string;
}

interface AuthContextValue {
  user: ApiUser | null;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<ApiUser>;
  signup: (credentials: SignupCredentials) => Promise<ApiUser>;
  continueAnonymously: () => Promise<ApiUser>;
  logout: () => void;
}

const userKey = 'civicfix_user';
const AuthContext = createContext<AuthContextValue | null>(null);

function getStoredUser(): ApiUser | null {
  if (typeof window === 'undefined') return null;
  const storedUser = window.localStorage.getItem(userKey);
  if (!storedUser) return null;
  try {
    return JSON.parse(storedUser) as ApiUser;
  } catch {
    window.localStorage.removeItem(userKey);
    return null;
  }
}

function persistAuth(user: ApiUser, accessToken: string): void {
  setAccessToken(accessToken);
  window.localStorage.setItem(userKey, JSON.stringify(user));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = getAccessToken();
    const storedUser = getStoredUser();
    if (storedToken && storedUser) setUser(storedUser);
    setIsLoading(false);
  }, []);

  async function login(credentials: LoginCredentials): Promise<ApiUser> {
    const result = await apiPost<AuthResponse>('/auth/login', credentials);
    persistAuth(result.user, result.accessToken);
    setUser(result.user);
    return result.user;
  }

  async function signup(credentials: SignupCredentials): Promise<ApiUser> {
    const result = await apiPost<AuthResponse>('/auth/register', credentials);
    persistAuth(result.user, result.accessToken);
    setUser(result.user);
    return result.user;
  }

  async function continueAnonymously(): Promise<ApiUser> {
    const result = await apiPost<AnonymousResponse>('/auth/anonymous');
    const anonymousUser: ApiUser = {
      anonymous: true,
      email: undefined,
      id: result.anonymousId,
      name: 'Anonymous reporter',
      role: 'anonymous',
    };
    persistAuth(anonymousUser, result.accessToken);
    setUser(anonymousUser);
    return anonymousUser;
  }

  function logout(): void {
    setAccessToken(null);
    window.localStorage.removeItem(userKey);
    setUser(null);
  }

  const value = useMemo(
    () => ({ continueAnonymously, isLoading, login, logout, signup, user }),
    [isLoading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
