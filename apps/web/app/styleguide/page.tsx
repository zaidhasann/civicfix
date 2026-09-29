'use client';

import { useState } from 'react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Modal,
  Textarea,
  ToastProvider,
  useToast,
} from '@/components/ui';

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
  const [isModalOpen, setIsModalOpen] = useState(false);

  function toggleTheme() {
    const nextIsDark = !isDark;
    document.documentElement.classList.toggle('dark', nextIsDark);
    setIsDark(nextIsDark);
  }

  return (
    <ToastProvider>
      <main className="min-h-screen bg-surface px-5 py-10 text-text transition-colors sm:px-10">
        <div className="mx-auto max-w-5xl space-y-12">
          <header className="flex flex-col gap-6 border-b border-border pb-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-primary">
                CivicFix UI
              </p>
              <h1 className="text-4xl font-bold tracking-tight">Design tokens</h1>
              <p className="mt-3 max-w-xl text-neutral-600 dark:text-neutral-300">
                A practical reference for the colors, type, spacing, radii, and elevation used
                across the product.
              </p>
            </div>
            <Button onClick={toggleTheme} size="sm">
              Use {isDark ? 'light' : 'dark'} theme
            </Button>
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
                    <span className="w-8 text-sm text-neutral-600 dark:text-neutral-300">
                      {name}
                    </span>
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

          <section
            className="space-y-6 border-t border-border pt-10"
            aria-labelledby="components-heading"
          >
            <div>
              <h2 className="text-2xl font-semibold" id="components-heading">
                Components
              </h2>
              <p className="mt-2 text-neutral-600 dark:text-neutral-300">
                Keyboard-ready primitives for common civic issue workflows.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Report details</CardTitle>
                  <p className="text-sm text-neutral-600 dark:text-neutral-300">
                    Form controls with labels, hints, and errors.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input
                    label="Issue title"
                    placeholder="Streetlight out on Main Street"
                    hint="Keep it short and specific."
                  />
                  <Textarea label="Description" placeholder="Tell the city what happened..." />
                </CardContent>
                <CardFooter>
                  <Button size="sm">Save draft</Button>
                  <Button size="sm" variant="secondary">
                    Cancel
                  </Button>
                </CardFooter>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Actions and statuses</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm">Primary</Button>
                    <Button size="sm" variant="secondary">
                      Secondary
                    </Button>
                    <Button size="sm" variant="danger">
                      Danger
                    </Button>
                    <Button size="sm" variant="ghost">
                      Ghost
                    </Button>
                    <Button loading size="sm">
                      Loading
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="neutral">New</Badge>
                    <Badge variant="info">Assigned</Badge>
                    <Badge variant="success">Resolved</Badge>
                    <Badge variant="warning">Pending</Badge>
                    <Badge variant="danger">Blocked</Badge>
                  </div>
                  <Button onClick={() => setIsModalOpen(true)} variant="secondary">
                    Open accessible modal
                  </Button>
                  <ToastExamples />
                </CardContent>
              </Card>
            </div>
          </section>
        </div>
        <Modal
          description="This dialog traps focus and closes with Escape."
          onClose={() => setIsModalOpen(false)}
          open={isModalOpen}
          title="Confirm report"
        >
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            Your report is ready for review.
          </p>
          <div className="mt-5 flex justify-end gap-3">
            <Button onClick={() => setIsModalOpen(false)} variant="secondary">
              Go back
            </Button>
            <Button onClick={() => setIsModalOpen(false)}>Continue</Button>
          </div>
        </Modal>
      </main>
    </ToastProvider>
  );
}

function ToastExamples() {
  const { toast } = useToast();

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        onClick={() => toast({ title: 'Report saved', variant: 'success' })}
        size="sm"
        variant="ghost"
      >
        Show success toast
      </Button>
      <Button
        onClick={() =>
          toast({
            title: 'Needs attention',
            description: 'Add a photo before submitting.',
            variant: 'warning',
          })
        }
        size="sm"
        variant="ghost"
      >
        Show warning toast
      </Button>
    </div>
  );
}
