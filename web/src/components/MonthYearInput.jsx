import { useTranslation } from 'react-i18next';

// A batch date picked as month + year - how production and expiry dates are
// written on medicine packs. Two plain dropdowns instead of the browser's own
// date box, which garbles its Arabic placeholder on an RTL page (letters
// reversed in Chrome). `value` / onChange use 'YYYY-MM-01', or '' for none.
const FIRST_YEAR = 2020;
const LAST_YEAR = 2040;

export function MonthYearInput({ value, onChange, id }) {
  const { t } = useTranslation();
  const [year = '', month = ''] = (value || '').split('-');

  const emit = (nextYear, nextMonth) => {
    if (!nextYear && !nextMonth) return onChange('');
    // A half-picked date waits for the other half; the saved value is only
    // ever a whole month.
    if (!nextYear || !nextMonth) return onChange(`${nextYear || ''}-${nextMonth || ''}`);
    return onChange(`${nextYear}-${nextMonth}-01`);
  };

  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const years = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => String(FIRST_YEAR + i));

  return (
    <div className="month-year-input" dir="ltr">
      <select id={id} aria-label={t('productForm.month')} value={month} onChange={(e) => emit(year, e.target.value)}>
        <option value="">{t('productForm.month')}</option>
        {months.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <span aria-hidden="true">/</span>
      <select aria-label={t('productForm.year')} value={year} onChange={(e) => emit(e.target.value, month)}>
        <option value="">{t('productForm.year')}</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}

// '' while empty or half-picked, else the whole-month date the server stores.
export function monthYearValue(value) {
  return /^\d{4}-\d{2}-01$/.test(value || '') ? value : '';
}
