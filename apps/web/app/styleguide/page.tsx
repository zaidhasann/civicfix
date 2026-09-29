'use client';

import { useState } from 'react';

const colorGroups = [
  {
    name: 'Civic status',
    colors: [
      ['Primary', 'bg-primary'],
      ['Success', 'bg-success'],
      ['Warning', 'bg-warning'],
      ['Danger', 'bg-danger'],
    ],
  },
  {
    name: 'Neutrals',
    colors: [
      ['50', 'bg-neutral-50'],
      ['200', 'bg-neutral-200'],
      ['500', 'bg-neutral-500'],
      ['800', 'bg-neutral-800'],
      ['900', 'bg-neutral-900'],
    ],
  },
] as const;

const spacingTokens = [
  ['4', 'w-4'],
  ['8', 'w-8'],
  ['18', 'w-18'],
  ['22', 'w-22'],
  ['30', 'w-30'],
] as const;

export default function StyleguidePage() {
  const [isDark, setIsDark] = useState(false);

  function toggleTheme() {
    const nextIsDark = !isDark;
    document.documentElement.classList.toggle('dark', nextIsDark);
    setIsDark(nextIsDark);
  }

  return (
    <main className="min-h-screen bg-surface px-5 py-10 text-text transition-colors sm:px-10">
      <div className="mx-auto max-w-5xl space-y-12">
        <header className="flex flex-col gap-6 border-b border-border pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-primary">
              CivicFix UI
            </p>
            <h1 className="text-4xl font-bold tracking-tight">Design tokens</h1>
            <p className="mt-3 max-w-xl text-neutral-600 dark:text-neutral-300">
              A practical reference for the colors, type, spacing, radii, and elevation used across
              the product.
            </p>
          </div>
          <button
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-focus transition hover:opacity-90"
            onClick={toggleTheme}
            type="button"
          >
            Use {isDark ? 'light' : 'dark'} theme
          </button>
        </header>

        <section className="space-y-5" aria-labelledby="colors-heading">
          <h2 className="text-2xl font-semibold" id="colors-heading">
            Colors
          </h2>
          <div className="grid gap-8 sm:grid-cols-2">
            {colorGroups.map((group) => (
              <div className="space-y-3" key={group.name}>
                <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-300">
                  {group.name}
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {group.colors.map(([name, colorClass]) => (
                    <div
                      className="overflow-hidden rounded-md border border-border shadow-card"
                      key={name}
                    >
                      <div className={`h-16 ${colorClass}`} />
                      <p className="bg-surface px-3 py-2 text-sm font-medium">{name}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-10 border-t border-border pt-10 sm:grid-cols-2">
          <div className="space-y-5">
            <h2 className="text-2xl font-semibold">Type scale</h2>
            <div className="space-y-3">
              <p className="text-4xl font-bold">Display / 4xl</p>
              <p className="text-3xl font-bold">Heading / 3xl</p>
              <p className="text-2xl font-semibold">Title / 2xl</p>
              <p className="text-lg">Body large / lg</p>
              <p className="text-base">Body / base</p>
              <p className="text-sm text-neutral-600 dark:text-neutral-300">Caption / sm</p>
            </div>
          </div>
          <div className="space-y-5">
            <h2 className="text-2xl font-semibold">Spacing</h2>
            <div className="space-y-4">
              {spacingTokens.map(([name, widthClass]) => (
                <div className="flex items-center gap-4" key={name}>
                  <span className="w-8 text-sm text-neutral-600 dark:text-neutral-300">{name}</span>
                  <div className={`h-4 rounded-sm bg-primary ${widthClass}`} />
                </div>
              ))}
            </div>
            <h2 className="pt-5 text-2xl font-semibold">Elevation</h2>
            <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
              Card shadow
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
