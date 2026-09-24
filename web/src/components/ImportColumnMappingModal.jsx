import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// The import's column-mapping step (catalog overhaul Phase 4.1). Opens when an
// upload comes back IMPORT_COLUMNS_UNRECOGNIZED: every header the file has is
// listed with a dropdown, pre-set to whatever the server did recognize, and the
// warehouse says which column is which. The answer ({ headerKey: field }) is
// sent with the same file again - and the server remembers it, so the next file
// with these headers imports without asking.
export function ImportColumnMappingModal({ details, onSubmit, onClose, isSubmitting }) {
  const { t } = useTranslation();
  const headers = details?.headers ?? [];
  const fields = details?.fields ?? ['name', 'price', 'manufacturer', 'unit', 'currency', 'bonus'];
  const required = details?.required ?? ['name', 'price', 'manufacturer'];
  const [choice, setChoice] = useState(() =>
    Object.fromEntries(headers.map((header) => [header.headerKey, header.field ?? '']))
  );
  const [error, setError] = useState(null);

  const chosen = Object.values(choice).filter(Boolean);
  const missing = required.filter((field) => !chosen.includes(field));
  const duplicated = fields.filter((field) => chosen.filter((c) => c === field).length > 1);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (missing.length > 0) {
      setError(t('importMapping.missing', { fields: missing.map((field) => t(`importMapping.field.${field}`)).join('، ') }));
      return;
    }
    if (duplicated.length > 0) {
      setError(t('importMapping.duplicated'));
      return;
    }
    onSubmit(Object.fromEntries(Object.entries(choice).filter(([, field]) => field)));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h2>{t('importMapping.title')}</h2>
        <p className="hint">{t('importMapping.hint')}</p>
        <form onSubmit={handleSubmit} className="product-form">
          <table className="product-table">
            <thead>
              <tr>
                <th>{t('importMapping.header')}</th>
                <th>{t('importMapping.meaning')}</th>
              </tr>
            </thead>
            <tbody>
              {headers.map((header) => (
                <tr key={header.headerKey}>
                  <td>{header.header}</td>
                  <td>
                    <select
                      value={choice[header.headerKey] ?? ''}
                      onChange={(e) => setChoice((prev) => ({ ...prev, [header.headerKey]: e.target.value }))}
                    >
                      <option value="">{t('importMapping.ignore')}</option>
                      {fields.map((field) => (
                        <option key={field} value={field}>
                          {t(`importMapping.field.${field}`)}
                          {required.includes(field) ? ' *' : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {error && <p className="error-text">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? t('products.importing') : t('importMapping.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
