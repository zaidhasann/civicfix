'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';

import { Button } from '../ui/button';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Input } from '../ui/input';
import { useAuth } from './auth-provider';

type AuthMode = 'login' | 'signup';

interface AuthFormProps {
  mode: AuthMode;
}

interface AuthCredentials {
  email: string;
  password: string;
  name?: string;
}

type FormErrors = Partial<Record<'name' | 'email' | 'password' | 'form', string>>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(values: AuthCredentials, mode: AuthMode): FormErrors {
  const errors: FormErrors = {};

  if (mode === 'signup' && (!values.name || values.name.trim().length < 2)) {
    errors.name = 'Enter your name (at least 2 characters).';
  }
  if (!values.email) {
    errors.email = 'Enter your email address.';
  } else if (!emailPattern.test(values.email)) {
    errors.email = 'Enter a valid email address.';
  }
  if (!values.password) {
    errors.password = 'Enter your password.';
  } else if (values.password.length < 8) {
    errors.password = 'Use at least 8 characters.';
  }

  return errors;
}

export function AuthForm({ mode }: AuthFormProps) {
  const isSignup = mode === 'signup';
  const { continueAnonymously, isLoading: isAuthLoading, login, signup } = useAuth();
  const [values, setValues] = useState<AuthCredentials>({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<FormErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  function updateValue(field: keyof AuthCredentials, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
    setSuccessMessage('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationErrors = validate(values, mode);
    setErrors(validationErrors);
    setSuccessMessage('');
    if (Object.keys(validationErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      const user = isSignup
        ? await signup({ email: values.email, name: values.name ?? '', password: values.password })
        : await login({ email: values.email, password: values.password });
      setSuccessMessage(`Welcome, ${user.name}. Your account is ready.`);
    } catch (error) {
      setErrors({
        form: error instanceof Error ? error.message : 'Something went wrong. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAnonymous() {
    setErrors({});
    setSuccessMessage('');
    setIsSubmitting(true);
    try {
      const user = await continueAnonymously();
      setSuccessMessage(`Welcome, ${user.name}. You can report an issue without an account.`);
    } catch (error) {
      setErrors({
        form: error instanceof Error ? error.message : 'Unable to continue anonymously.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-8 text-text sm:px-6 sm:py-12">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center justify-center">
        <Card className="w-full">
          <CardHeader className="space-y-4 p-6 sm:p-8">
            <Link
              className="w-fit text-sm font-bold tracking-wide text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              href="/"
            >
              CivicFix
            </Link>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-text sm:text-3xl">
                {isSignup ? 'Create your account' : 'Welcome back'}
              </h1>
              <p className="text-sm leading-6 text-neutral-600">
                {isSignup
                  ? 'Join your neighbors in making local issues visible and actionable.'
                  : 'Sign in to track your reports and help improve your community.'}
              </p>
            </div>
          </CardHeader>

          <CardContent className="p-6 pt-0 sm:p-8 sm:pt-0">
            {errors.form ? (
              <div
                aria-live="polite"
                className="mb-5 rounded-md border border-danger/30 bg-danger/10 px-3 py-3 text-sm text-danger"
                role="alert"
              >
                {errors.form}
              </div>
            ) : null}
            {successMessage ? (
              <div
                aria-live="polite"
                className="mb-5 rounded-md border border-success/30 bg-success/10 px-3 py-3 text-sm text-success"
                role="status"
              >
                {successMessage}
              </div>
            ) : null}

            <form className="space-y-5" noValidate onSubmit={handleSubmit}>
              {isSignup ? (
                <Input
                  autoComplete="name"
                  error={errors.name}
                  label="Full name"
                  onChange={(event) => updateValue('name', event.target.value)}
                  value={values.name}
                />
              ) : null}
              <Input
                autoComplete="email"
                error={errors.email}
                label="Email address"
                onChange={(event) => updateValue('email', event.target.value)}
                type="email"
                value={values.email}
              />
              <div className="relative">
                <Input
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  className="pr-20"
                  error={errors.password}
                  label="Password"
                  onChange={(event) => updateValue('password', event.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  value={values.password}
                />
                <button
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-8 rounded px-2 py-1 text-xs font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onClick={() => setShowPassword((current) => !current)}
                  type="button"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <Button
                className="w-full"
                loading={isSubmitting || isAuthLoading}
                loadingLabel={isSignup ? 'Creating account' : 'Signing in'}
                size="lg"
                type="submit"
              >
                {isSignup ? 'Create account' : 'Sign in'}
              </Button>
            </form>

            <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-neutral-500">
              <span aria-hidden="true" className="h-px flex-1 bg-border" />
              <span>or</span>
              <span aria-hidden="true" className="h-px flex-1 bg-border" />
            </div>

            <Button
              className="w-full"
              disabled={isSubmitting || isAuthLoading}
              onClick={handleAnonymous}
              size="lg"
              type="button"
              variant="secondary"
            >
              Continue anonymously
            </Button>

            <p className="mt-6 text-center text-sm text-neutral-600">
              {isSignup ? 'Already have an account?' : 'New to CivicFix?'}{' '}
              <Link
                className="font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                href={isSignup ? '/login' : '/signup'}
              >
                {isSignup ? 'Sign in' : 'Create an account'}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
