import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import './AdminQuarterAllocationPage.css';

const fieldOf = (plan) => ({
  cityFeniq: String(plan.city.feniqToPharmacyBps / 100),
  cityRep: String(plan.city.repToPharmacyBps / 100),
  outsideFeniq: String(plan.outside.feniqToPharmacyBps / 100),
});
function parseShare(value) {
  // Parse decimal text, not n * 100: 33.33 is a valid percentage even if
  // floating multiplication produces 3332.9999999999995.
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(value.trim())) throw new Error('invalid');
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('invalid');
  return Math.round(n * 100);
}
function planOf(fields) {
  return {
    city: {
      feniqToPharmacyBps: parseShare(fields.cityFeniq),
      repToPharmacyBps: parseShare(fields.cityRep),
    },
    outside: { feniqToPharmacyBps: parseShare(fields.outsideFeniq) },
  };
}
const fmt = (n) => typeof n === 'number' ? n.toLocaleString('en-US') : '—';

function MoneyRow({ label, amount }) {
  return <div className="quarter-money-row">
    <span>{label}</span><strong dir="ltr">{fmt(amount)} ل.س</strong>
  </div>;
}
function ResultCard({ title, data, t }) {
  if (!data) return null;
  return <div className="quarter-result-card">
    <h3>{title}</h3>
    <p>{t('quarterPolicy.basis', { feniq: data.baseQuarters.feniq, rep: data.baseQuarters.rep })}</p>
    <MoneyRow label={t('quarterPolicy.feniq')} amount={data.earned.feniqSyp} />
    <MoneyRow label={t('quarterPolicy.rep')} amount={data.earned.repSyp} />
    <MoneyRow label={t('quarterPolicy.pharmacy')} amount={data.earned.pharmacySyp} />
    <p className="quarter-detail">{t('quarterPolicy.fromFeniq')}: {fmt(data.earned.pharmacyFromFeniqSyp)} · {t('quarterPolicy.fromRep')}: {fmt(data.earned.pharmacyFromRepSyp)}</p>
  </div>;
}

export function AdminQuarterAllocationPage() {
  const { t } = useTranslation();
  const [saved, setSaved] = useState(null);
  const [fields, setFields] = useState(null);
  const [reason, setReason] = useState('');
  const [invoice, setInvoice] = useState('100000');
  const [commission, setCommission] = useState('2000');
  const [collected, setCollected] = useState('100000');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [working, setWorking] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let current = true;
    api.getQuarterAllocationDraft().then(response => {
      if (!current) return;
      setSaved(response.allocation);
      setFields(fieldOf(response.allocation.plan));
    }).catch(err => { if (current) setError(err.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);

  const setField = (name, value) => {
    setFields(old => ({ ...old, [name]: value }));
    setPreview(null);
    setSuccess('');
  };

  const withPlan = async (run) => {
    setError('');
    setSuccess('');
    try {
      const plan = planOf(fields);
      await run(plan);
    } catch (err) {
      setError(err.message === 'invalid' ? t('quarterPolicy.invalidPercent') : err.message);
    }
  };

  const simulate = () => withPlan(async (plan) => {
    const invoiceSyp = Number(invoice);
    const originalCommissionSyp = Number(commission);
    const eligibleCollectedSyp = Number(collected);
    if (![invoiceSyp, originalCommissionSyp, eligibleCollectedSyp].every(Number.isSafeInteger) ||
        invoiceSyp <= 0 || originalCommissionSyp < 0 || originalCommissionSyp > invoiceSyp ||
        eligibleCollectedSyp < 0 || eligibleCollectedSyp > invoiceSyp) {
      throw new Error(t('quarterPolicy.invalidExample'));
    }
    setWorking(true);
    try {
      const response = await api.previewQuarterAllocationDraft({
        plan, invoiceSyp, originalCommissionSyp, eligibleCollectedSyp,
      });
      setPreview(response);
    } finally { setWorking(false); }
  });

  const save = (event) => {
    event.preventDefault();
    return withPlan(async (plan) => {
      if (reason.trim().length < 5) throw new Error(t('quarterPolicy.reasonRequired'));
      setWorking(true);
      try {
        const response = await api.saveQuarterAllocationDraft({
          revision: saved.revision, plan, reason: reason.trim(),
        });
        setSaved(response.allocation);
        setReason('');
        setSuccess(t('quarterPolicy.savedDraft'));
      } finally { setWorking(false); }
    });
  };

  return <div className="quarter-settings">
    <header className="quarter-head">
      <span>{t('quarterPolicy.eyebrow')}</span>
      <h1>{t('quarterPolicy.title')}</h1>
      <p>{t('quarterPolicy.description')}</p>
    </header>
    <div className="quarter-warning" role="note">
      <strong>{t('quarterPolicy.draftWarningTitle')}</strong>
      <p>{t('quarterPolicy.draftWarning')}</p>
    </div>
    {loading && <p role="status">{t('common.loading')}</p>}
    {error && <p className="error-text" role="alert">{error}</p>}
    {success && <p className="quarter-success" role="status">{success}</p>}
    {saved && fields && <form onSubmit={save} className="quarter-form">
      <div className="quarter-layout">
        <section className="quarter-panel" aria-labelledby="quarter-city-title">
          <h2 id="quarter-city-title">{t('quarterPolicy.cityTitle')}</h2>
          <p>{t('quarterPolicy.cityBase')}</p>
          <label>{t('quarterPolicy.cityFeniqTransfer')}
            <div className="quarter-percentage"><input type="number" inputMode="decimal" min="0" max="100" step="0.01" required
              value={fields.cityFeniq} onChange={e => setField('cityFeniq', e.target.value)} /><span>%</span></div>
          </label>
          <label>{t('quarterPolicy.cityRepTransfer')}
            <div className="quarter-percentage"><input type="number" inputMode="decimal" min="0" max="100" step="0.01" required
              value={fields.cityRep} onChange={e => setField('cityRep', e.target.value)} /><span>%</span></div>
          </label>
          <small>{t('quarterPolicy.cityExample')}</small>
        </section>
        <section className="quarter-panel" aria-labelledby="quarter-outside-title">
          <h2 id="quarter-outside-title">{t('quarterPolicy.outsideTitle')}</h2>
          <p>{t('quarterPolicy.outsideBase')}</p>
          <label>{t('quarterPolicy.outsideTransfer')}
            <div className="quarter-percentage"><input type="number" inputMode="decimal" min="0" max="100" step="0.01" required
              value={fields.outsideFeniq} onChange={e => setField('outsideFeniq', e.target.value)} /><span>%</span></div>
          </label>
          <small>{t('quarterPolicy.outsideExample')}</small>
        </section>
      </div>
      <section className="quarter-panel">
        <h2>{t('quarterPolicy.previewTitle')}</h2>
        <p>{t('quarterPolicy.previewHint')}</p>
        <div className="quarter-example-fields">
          <label>{t('quarterPolicy.invoice')} <input type="number" min="1" step="1" value={invoice}
            onChange={e => { setInvoice(e.target.value); setPreview(null); }} /></label>
          <label>{t('quarterPolicy.originalCommission')} <input type="number" min="0" step="1" value={commission}
            onChange={e => { setCommission(e.target.value); setPreview(null); }} /></label>
          <label>{t('quarterPolicy.collected')} <input type="number" min="0" step="1" value={collected}
            onChange={e => { setCollected(e.target.value); setPreview(null); }} /></label>
        </div>
        <button type="button" className="btn-secondary" disabled={working} onClick={simulate}>
          {t('quarterPolicy.calculate')}
        </button>
        {preview && <div className="quarter-layout quarter-results">
          <ResultCard title={t('quarterPolicy.cityTitle')} data={preview.city} t={t}/>
          <ResultCard title={t('quarterPolicy.outsideTitle')} data={preview.outside} t={t}/>
        </div>}
      </section>
      <section className="quarter-panel">
        <h2>{t('quarterPolicy.saveTitle')}</h2>
        <p>{t('quarterPolicy.revision', { revision: saved.revision })}</p>
        <label>{t('quarterPolicy.reason')}
          <input value={reason} maxLength={500} required minLength={5} onChange={e => setReason(e.target.value)}
            placeholder={t('quarterPolicy.reasonPlaceholder')} />
        </label>
        <button type="submit" className="btn-primary" disabled={working}>
          {working ? t('common.saving') : t('quarterPolicy.saveDraft')}
        </button>
      </section>
    </form>}
  </div>;
}
