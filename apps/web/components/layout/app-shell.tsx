'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { useAuth } from '../auth/auth-provider';
import { cn } from '../ui/utils';

interface NavigationItem {
  href: string;
  label: string;
  icon: (className: string) => ReactNode;
}

const navigationItems: NavigationItem[] = [
  {
    href: '/report',
    label: 'Report',
    icon: (className) => (
      <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
        <path d="M12 5v14m-7-7h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    ),
  },
  {
    href: '/map',
    label: 'Map',
    icon: (className) => (
      <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
        <path
          d="m9 18-6 3V6l6-3 6 3 6-3v15l-6 3-6-3Zm0 0V3m6 3v15"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    ),
  },
  {
    href: '/dashboard',
    label: 'My Complaints',
    icon: (className) => (
      <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
        <path
          d="M6 4.75h12A1.25 1.25 0 0 1 19.25 6v14.25L12 17l-7.25 3.25V6A1.25 1.25 0 0 1 6 4.75Z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
        <path d="M8 9h8m-8 3.5h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    href: '/profile',
    label: 'Profile',
    icon: (className) => (
      <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M5.5 20c.7-3.18 2.87-4.75 6.5-4.75s5.8 1.57 6.5 4.75"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.8"
        />
      </svg>
    ),
  },
];

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavigationLink({ item, mobile = false }: { item: NavigationItem; mobile?: boolean }) {
  const pathname = usePathname();
  const active = isActivePath(pathname, item.href);

  return (
    <Link
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex items-center rounded-md font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        mobile ? 'min-w-0 flex-1 flex-col gap-1 px-2 py-2 text-xs' : 'gap-3 px-3 py-2 text-sm',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-neutral-600 hover:bg-neutral-100 hover:text-text',
      )}
      href={item.href}
    >
      {item.icon(mobile ? 'h-5 w-5' : 'h-5 w-5')}
      <span className={mobile ? 'truncate' : undefined}>{item.label}</span>
    </Link>
  );
}

export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">{children}</div>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-neutral-50 text-text">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link
            className="rounded text-lg font-bold tracking-tight text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            href="/"
          >
            CivicFix
          </Link>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-neutral-600 sm:inline">{user?.name}</span>
            <Link
              className="rounded-full bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              href="/profile"
            >
              Profile
            </Link>
          </div>
        </div>
      </header>

      <nav
        aria-label="Main navigation"
        className="hidden border-b border-border bg-surface sm:block"
      >
        <div className="mx-auto flex max-w-6xl gap-2 px-4 py-2 sm:px-6">
          {navigationItems.map((item) => (
            <NavigationLink item={item} key={item.href} />
          ))}
        </div>
      </nav>

      <div className="pb-24 sm:pb-8">{children}</div>

      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
      >
        <div className="mx-auto flex max-w-md">
          {navigationItems.map((item) => (
            <NavigationLink item={item} key={item.href} mobile />
          ))}
        </div>
      </nav>
    </div>
  );
}
