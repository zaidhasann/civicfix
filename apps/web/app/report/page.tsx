'use client';

import { useReducer } from 'react';

import { ProtectedRoute } from '../../components/auth/protected-route';
import { AppShell, PageContainer } from '../../components/layout/app-shell';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';

const steps = [
  { title: 'Photo', description: 'Add a photo of the issue' },
  { title: 'Location', description: 'Pinpoint where it is' },
  { title: 'Details', description: 'Tell us a little more' },
] as const;

type ReportState = {
  step: number;
  photoName: string;
  location: string;
  title: string;
  description: string;
};

type ReportAction =
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'set-photo'; photoName: string }
  | { type: 'set-location'; location: string }
  | { type: 'set-title'; title: string }
  | { type: 'set-description'; description: string };

const initialState: ReportState = {
  step: 0,
  photoName: '',
  location: '',
  title: '',
  description: '',
};

function reportReducer(state: ReportState, action: ReportAction): ReportState {
  switch (action.type) {
    case 'next':
      return { ...state, step: Math.min(state.step + 1, steps.length - 1) };
    case 'back':
      return { ...state, step: Math.max(state.step - 1, 0) };
    case 'set-photo':
      return { ...state, photoName: action.photoName };
    case 'set-location':
      return { ...state, location: action.location };
    case 'set-title':
      return { ...state, title: action.title };
    case 'set-description':
      return { ...state, description: action.description };
  }
}

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <nav aria-label="Report progress" className="mb-8">
      <ol className="grid grid-cols-3 gap-2 sm:gap-4">
        {steps.map((step, index) => {
          const isCurrent = index === currentStep;
          const isComplete = index < currentStep;

          return (
            <li className="min-w-0" key={step.title}>
              <div
                aria-current={isCurrent ? 'step' : undefined}
                className="flex items-center gap-2 sm:gap-3"
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    isCurrent || isComplete
                      ? 'bg-primary text-white'
                      : 'border border-border bg-surface text-neutral-500'
                  }`}
                >
                  {isComplete ? '✓' : index + 1}
                </span>
                <span className="min-w-0">
                  <span
                    className={`block truncate text-xs font-semibold sm:text-sm ${
                      isCurrent ? 'text-primary' : 'text-neutral-600'
                    }`}
                  >
                    {step.title}
                  </span>
                  <span className="hidden text-xs text-neutral-500 sm:block">
                    {step.description}
                  </span>
                </span>
              </div>
              {index < steps.length - 1 ? (
                <div
                  aria-hidden="true"
                  className={`ml-10 mt-2 h-0.5 sm:ml-11 ${
                    index < currentStep ? 'bg-primary' : 'bg-border'
                  }`}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function PhotoStep({
  photoName,
  onPhotoChange,
}: {
  photoName: string;
  onPhotoChange: (photoName: string) => void;
}) {
  return (
    <div>
      <CardTitle>Add a photo</CardTitle>
      <p className="mt-2 text-sm leading-6 text-neutral-600">
        A clear photo helps your community understand and resolve the issue faster.
      </p>
      <label className="mt-6 flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-neutral-50 px-5 text-center transition hover:border-primary hover:bg-primary/5">
        <svg aria-hidden="true" className="h-10 w-10 text-primary" fill="none" viewBox="0 0 24 24">
          <path
            d="M4 16.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1.5M8 10l4-4m0 0 4 4m-4-4v11"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
        <span className="mt-3 font-semibold text-text">
          {photoName || 'Choose a photo to upload'}
        </span>
        <span className="mt-1 text-sm text-neutral-500">PNG, JPG up to 10MB</span>
        <input
          accept="image/png,image/jpeg"
          className="sr-only"
          onChange={(event) => onPhotoChange(event.target.files?.[0]?.name ?? '')}
          type="file"
        />
      </label>
    </div>
  );
}

function LocationStep({
  location,
  onLocationChange,
}: {
  location: string;
  onLocationChange: (location: string) => void;
}) {
  return (
    <div>
      <CardTitle>Where is the issue?</CardTitle>
      <p className="mt-2 text-sm leading-6 text-neutral-600">
        Add an address or landmark so the right team can find it.
      </p>
      <label className="mt-6 block text-sm font-semibold text-text" htmlFor="report-location">
        Address or landmark
      </label>
      <input
        className="mt-2 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-text outline-none transition placeholder:text-neutral-400 focus:border-primary focus:ring-2 focus:ring-primary/20"
        id="report-location"
        onChange={(event) => onLocationChange(event.target.value)}
        placeholder="e.g. Main Street near the library"
        type="text"
        value={location}
      />
      <button
        className="mt-4 inline-flex items-center gap-2 rounded-md text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onClick={() => onLocationChange('Current location')}
        type="button"
      >
        <span aria-hidden="true">◎</span>
        Use my current location
      </button>
    </div>
  );
}

function DetailsStep({
  title,
  description,
  onTitleChange,
  onDescriptionChange,
}: {
  title: string;
  description: string;
  onTitleChange: (title: string) => void;
  onDescriptionChange: (description: string) => void;
}) {
  return (
    <div>
      <CardTitle>Describe the issue</CardTitle>
      <p className="mt-2 text-sm leading-6 text-neutral-600">
        A few details will help us understand what needs attention.
      </p>
      <label className="mt-6 block text-sm font-semibold text-text" htmlFor="report-title">
        Short title
      </label>
      <input
        className="mt-2 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-text outline-none transition placeholder:text-neutral-400 focus:border-primary focus:ring-2 focus:ring-primary/20"
        id="report-title"
        onChange={(event) => onTitleChange(event.target.value)}
        placeholder="e.g. Large pothole on Main Street"
        type="text"
        value={title}
      />
      <label className="mt-5 block text-sm font-semibold text-text" htmlFor="report-description">
        Description <span className="font-normal text-neutral-500">(optional)</span>
      </label>
      <textarea
        className="mt-2 min-h-32 w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-text outline-none transition placeholder:text-neutral-400 focus:border-primary focus:ring-2 focus:ring-primary/20"
        id="report-description"
        onChange={(event) => onDescriptionChange(event.target.value)}
        placeholder="Share anything else that might be helpful."
        value={description}
      />
    </div>
  );
}

function ReportFlow() {
  const [state, dispatch] = useReducer(reportReducer, initialState);
  const isLastStep = state.step === steps.length - 1;

  return (
    <AppShell>
      <main>
        <PageContainer>
          <div className="mx-auto max-w-2xl">
            <p className="text-sm font-bold tracking-wide text-primary">CivicFix</p>
            <h1 className="mt-2 text-3xl font-semibold">Report an issue</h1>
            <p className="mt-2 text-neutral-600">
              Help improve your neighborhood in just a few steps.
            </p>

            <div className="mt-8">
              <StepIndicator currentStep={state.step} />
              <Card>
                <CardHeader className="p-5 pb-0 sm:p-8 sm:pb-0">
                  {state.step === 0 ? (
                    <PhotoStep
                      onPhotoChange={(photoName) => dispatch({ type: 'set-photo', photoName })}
                      photoName={state.photoName}
                    />
                  ) : null}
                  {state.step === 1 ? (
                    <LocationStep
                      location={state.location}
                      onLocationChange={(location) => dispatch({ type: 'set-location', location })}
                    />
                  ) : null}
                  {state.step === 2 ? (
                    <DetailsStep
                      description={state.description}
                      onDescriptionChange={(description) =>
                        dispatch({ type: 'set-description', description })
                      }
                      onTitleChange={(title) => dispatch({ type: 'set-title', title })}
                      title={state.title}
                    />
                  ) : null}
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-3 p-5 pt-8 sm:p-8 sm:pt-10">
                  <Button
                    disabled={state.step === 0}
                    onClick={() => dispatch({ type: 'back' })}
                    variant="secondary"
                  >
                    Back
                  </Button>
                  <Button onClick={() => dispatch({ type: 'next' })}>
                    {isLastStep ? 'Review report' : 'Continue'}
                    <span aria-hidden="true">→</span>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </PageContainer>
      </main>
    </AppShell>
  );
}

export default function ReportPage() {
  return (
    <ProtectedRoute>
      <ReportFlow />
    </ProtectedRoute>
  );
}
