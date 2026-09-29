import type { Config } from 'tailwindcss';

const withAlpha = (variable: string) => `hsl(var(${variable}) / <alpha-value>)`;

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        primary: withAlpha('--color-primary'),
        success: withAlpha('--color-success'),
        warning: withAlpha('--color-warning'),
        danger: withAlpha('--color-danger'),
        neutral: {
          50: withAlpha('--color-neutral-50'),
          100: withAlpha('--color-neutral-100'),
          200: withAlpha('--color-neutral-200'),
          300: withAlpha('--color-neutral-300'),
          400: withAlpha('--color-neutral-400'),
          500: withAlpha('--color-neutral-500'),
          600: withAlpha('--color-neutral-600'),
          700: withAlpha('--color-neutral-700'),
          800: withAlpha('--color-neutral-800'),
          900: withAlpha('--color-neutral-900'),
        },
        surface: withAlpha('--color-surface'),
        text: withAlpha('--color-text'),
        border: withAlpha('--color-border'),
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.75rem' }],
        xl: ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
      },
      spacing: {
        18: '4.5rem',
        22: '5.5rem',
        30: '7.5rem',
      },
      borderRadius: {
        sm: '0.25rem',
        md: '0.5rem',
        lg: '0.75rem',
        xl: '1rem',
      },
      boxShadow: {
        card: '0 4px 18px hsl(222 47% 11% / 0.08)',
        focus: '0 0 0 3px hsl(var(--color-primary) / 0.25)',
      },
    },
  },
  plugins: [],
};

export default config;
