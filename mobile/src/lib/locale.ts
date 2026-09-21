import i18n from '@/lib/i18n';

export type AppLocale = 'es' | 'en';

export function getCurrentAppLocale(): AppLocale {
  const language = i18n.language?.trim().toLowerCase();
  return language?.startsWith('es') ? 'es' : 'en';
}
