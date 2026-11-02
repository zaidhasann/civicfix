import { getRequestConfig } from 'next-intl/server';

export const supportedLocales = ['en', 'hi'] as const;
export type Locale = (typeof supportedLocales)[number];

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: Locale = requested === 'hi' ? 'hi' : 'en';

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
