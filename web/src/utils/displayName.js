import i18next from 'i18next';

// Names in one language only (catalog overhaul, pre-merge review): a medicine
// may be named in Arabic only, English only, or both - and so may a company.
// Every product and manufacturer name on screen goes through this: the name in
// the panel's current language, else the other one. Never an empty name.
//
// Reads the language from the shared i18next instance that i18n.js initializes
// (the panel's own language switch), defaulting to Arabic, the app's fallback
// language.
function currentLanguage() {
  const language = i18next.resolvedLanguage || i18next.language || '';
  return language.startsWith('en') ? 'en' : 'ar';
}

function clean(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

// (en, ar) - the argument order the old withArFallback(en, ar) had, so every
// call site reads the same.
export function localizedName(en, ar, language = currentLanguage()) {
  const english = clean(en);
  const arabic = clean(ar);
  const [preferred, other] = language === 'en' ? [english, arabic] : [arabic, english];
  return preferred || other || '-';
}
