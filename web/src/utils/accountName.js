import i18n from 'i18next';

// An account's display name in the panel's language: the pharmacy or
// warehouse name in Arabic or English, falling back to the other language and
// then to the owner's name.
export function accountName(account, language = i18n.language) {
  const profile = account.pharmacy || account.warehouse;
  const [first, second] = language === 'ar' ? ['nameAr', 'nameEn'] : ['nameEn', 'nameAr'];
  return profile?.[first] || profile?.[second] || account.user?.name || '';
}
