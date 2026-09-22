import i18n, { type Resource } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import { es } from './i18n/locales/es';
import { en } from './i18n/locales/en';

const resources: Resource = {
  es: { translation: es },
  en: { translation: en },
};

// Get user's preferred language
const locales = getLocales();
const userLocale = locales[0]?.languageTag || 'en';

void i18n.use(initReactI18next).init({
  lng: userLocale.startsWith('es') ? 'es' : 'en',
  fallbackLng: 'en',
  resources,
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

export default i18n;
