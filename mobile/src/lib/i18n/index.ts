import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import { en } from './locales/en';
import { es } from './locales/es';

// Get device language
const deviceLanguage = Localization.getLocales()[0]?.languageCode || 'en';

// Determine initial language
const initialLanguage = deviceLanguage.startsWith('es') ? 'es' : 'en';

const resources = {
  en: { translation: en },
  es: { translation: es },
};

i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false, // React already prevents XSS
  },
  react: {
    useSuspense: false, // Disable Suspense for React Native
  },
});

export default i18n;
