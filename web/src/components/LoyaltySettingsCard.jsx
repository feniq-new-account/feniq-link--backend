import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { asciiDigits } from '../utils/digits';
import { readTiers, tiersToRows } from '../utils/loyalty';

// The warehouse's own loyalty discount (backend/src/utils/loyalty.js): on/off
// and its tiers - "an order of at least X gets Y off", in whole SYP. The
// warehouse pays for it; Feniq takes its share of what is left.
export function LoyaltySettingsCard() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState('per_order');
  const [revision, setRevision] = useState(0);
  const [rows, setRows] = useState(tiersToRows([]));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const apply = (loyalty) => {
    setEnabled(Boolean(loyalty?.enabled));
    setMode(loyalty?.mode || 'per_order');
    setRevision(loyalty?.revision ?? 0);
    setRows(tiersToRows(loyalty?.tiers));
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.warehouseSettings();
      apply(data.settings.loyalty);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setRow = (index, field, value) => {
    setSaved(false);
    setRows((current) => current.map((row, i) => (i === index ? { ...row, [field]: asciiDigits(value) } : row)));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const result = readTiers(rows, { enabled });
    if (result.error) {
      setError(t(result.error));
      return;
    }
    setIsSaving(true);
    try {
      const data = await api.updateWarehouseLoyalty({ enabled, mode, revision, tiers: result.tiers });
      apply(data.settings.loyalty);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return null;

  return (
    <div className="wh-detail-card wh-settings-card" style={{ marginTop: 16 }}>
      <h2 className="wh-detail-card-title">{t('warehouseSettings.loyalty.title')}</h2>
      <p className="hint wh-settings-hint">{t(mode === 'monthly' ? 'warehouseSettings.loyalty.monthlyHelp' : 'warehouseSettings.loyalty.intro')}</p>
      <button type="button" className="btn-secondary" disabled={isSaving} onClick={load}>{t('common.retry')}</button>
      <form onSubmit={handleSave} className="product-form">
        <label>{t('warehouseSettings.loyalty.mode')}
          <select value={mode} disabled={isSaving} onChange={(event) => { setMode(event.target.value); setSaved(false); }}>
            <option value="per_order">{t('warehouseSettings.loyalty.perOrder')}</option>
            <option value="monthly">{t('warehouseSettings.loyalty.monthly')}</option>
          </select>
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              setSaved(false);
              setEnabled(e.target.checked);
            }}
          />
          {t('warehouseSettings.loyalty.enabled')}
        </label>
        <p className="hint">{t(mode === 'monthly' ? 'warehouseSettings.loyalty.monthlyExample' : 'warehouseSettings.loyalty.example')}</p>
        {rows.map((row, index) => (
          <div key={index} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={{ flex: '1 1 160px' }}>
              {t(mode === 'monthly' ? 'warehouseSettings.loyalty.monthlyMin' : 'warehouseSettings.loyalty.minLabel')}
              <input
                type="text"
                inputMode="numeric"
                dir="ltr"
                placeholder="100,000"
                value={row.minSyp}
                onChange={(e) => setRow(index, 'minSyp', e.target.value)}
              />
            </label>
            <label style={{ flex: '1 1 140px' }}>
              {t(mode === 'monthly' ? 'warehouseSettings.loyalty.monthlyReward' : 'warehouseSettings.loyalty.discountLabel')}
              <input
                type="text"
                inputMode="numeric"
                dir="ltr"
                placeholder="2,000"
                value={row.discountSyp}
                onChange={(e) => setRow(index, 'discountSyp', e.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn-secondary"
              style={{ width: 'auto', marginTop: 0 }}
              onClick={() => {
                setSaved(false);
                setRows((current) => (current.length > 1 ? current.filter((_, i) => i !== index) : tiersToRows([])));
              }}
            >
              {t('warehouseSettings.loyalty.removeTier')}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn-secondary"
          style={{ width: 'auto' }}
          onClick={() => setRows((current) => [...current, { minSyp: '', discountSyp: '' }])}
        >
          {t('warehouseSettings.loyalty.addTier')}
        </button>
        {error && <p className="error-text">{error}</p>}
        {saved && <p className="wh-settings-success">{t('warehouseSettings.loyalty.saved')}</p>}
        <button type="submit" className="btn-primary" disabled={isSaving}>
          {isSaving ? t('warehouseSettings.loyalty.saving') : t('warehouseSettings.loyalty.save')}
        </button>
      </form>
    </div>
  );
}
