import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { formatSyp } from '../utils/currency';
import { displayName } from '../utils/displayName';
import { createIdempotencyKeys } from '../utils/payments';
import { matchPharmacies, parseVoicePayment, paymentFor } from '../utils/voicePayment';

const MAX_PAGES = 25;

// Chrome (and Edge) listen through the browser itself, for free. Where there is
// no recognizer the text box still works: type the sentence instead.
function speechRecognitionClass() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

async function loadAllAccounts() {
  const all = [];
  let cursor;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = await api.warehouseBalances({ limit: 50, after: cursor });
    all.push(...data.pharmacies);
    if (!data.pagination.hasMore) break;
    cursor = data.pagination.nextCursor;
  }
  return all;
}

// "صيدلية النور دفعت خمسين ألف": the warehouse says (or types) what happened,
// the rules in utils/voicePayment.js read it, and a card asks for the OK
// before anything is saved.
export function VoicePaymentModal({ onClose, onDone }) {
  const { t } = useTranslation();
  const Recognition = speechRecognitionClass();
  const [idempotencyKeys] = useState(createIdempotencyKeys);
  const [accounts, setAccounts] = useState([]);
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [chosenId, setChosenId] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const recognizer = useRef(null);

  useEffect(() => {
    let active = true;
    loadAllAccounts()
      .then((rows) => active && setAccounts(rows.map((r) => ({ ...r, id: r.pharmacyId }))))
      .catch((err) => active && setError(err.message));
    return () => {
      active = false;
      recognizer.current?.abort?.();
    };
  }, []);

  const parsed = useMemo(() => parseVoicePayment(text), [text]);
  const matches = useMemo(() => matchPharmacies(parsed.name, accounts), [parsed.name, accounts]);
  // The best match is picked for the operator unless it is a weak one.
  const selectedId = chosenId ?? (matches[0]?.score >= 0.6 ? matches[0].id : null);
  const selected = accounts.find((a) => a.id === selectedId) ?? null;
  const payment = selected ? paymentFor(parsed, selected.balanceSyp) : null;

  const startListening = () => {
    if (!Recognition) return;
    setError(null);
    const rec = new Recognition();
    rec.lang = 'ar-SY';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
      let heard = '';
      for (let i = 0; i < event.results.length; i += 1) heard += event.results[i][0].transcript;
      setText(heard);
      setChosenId(null);
    };
    rec.onerror = (event) => setError(t('voicePay.micError', { code: event.error }));
    rec.onend = () => setListening(false);
    recognizer.current = rec;
    setListening(true);
    rec.start();
  };

  const stopListening = () => recognizer.current?.stop?.();

  const save = async () => {
    if (!selected || !payment) return;
    const body = {
      pharmacyId: selected.pharmacyId,
      amount: payment.paid,
      currency: 'SYP',
      method: 'cash',
      note: t('voicePay.note'),
    };
    setSaving(true);
    setError(null);
    try {
      await idempotencyKeys.submit(body, (idempotencyKey) => api.createPayment({ ...body, idempotencyKey }));
      onDone({ name: displayName(selected.nameEn, selected.nameAr), amount: payment.paid });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const nothingUnderstood = text.trim() && parsed.kind === 'unknown';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h2>{t('voicePay.title')}</h2>
        <p className="hint">{t('voicePay.hint')}</p>

        {Recognition && (
          <button
            type="button"
            className={listening ? 'btn-secondary' : 'btn-primary'}
            onClick={listening ? stopListening : startListening}
          >
            {listening ? t('voicePay.stop') : t('voicePay.speak')}
          </button>
        )}

        <label>
          {t('voicePay.heard')}
          <input
            type="text"
            value={text}
            placeholder={t('voicePay.placeholder')}
            onChange={(e) => {
              setText(e.target.value);
              setChosenId(null);
            }}
          />
        </label>

        {nothingUnderstood && <p className="error-text">{t('voicePay.notUnderstood')}</p>}

        {parsed.kind !== 'unknown' && (
          <div className="voice-card">
            <div className="voice-choices">
              {matches.length === 0 && <p className="error-text">{t('voicePay.noPharmacy')}</p>}
              {matches.map((m) => {
                const account = accounts.find((a) => a.id === m.id);
                if (!account) return null;
                return (
                  <label key={m.id} className="voice-choice">
                    <input
                      type="radio"
                      name="voice-pharmacy"
                      checked={m.id === selectedId}
                      onChange={() => setChosenId(m.id)}
                    />
                    {displayName(account.nameEn, account.nameAr)}
                    <span className="wh-table-sub"> · {t('voicePay.owes', { amount: formatSyp(account.balanceSyp) })}</span>
                  </label>
                );
              })}
            </div>
            {selected && payment && (
              <p>
                <strong>{t('voicePay.willRecord', { amount: formatSyp(payment.paid) })}</strong>
                <br />
                <span className="hint">{t('voicePay.leftAfter', { amount: formatSyp(payment.left) })}</span>
              </p>
            )}
            {selected && !payment && <p className="error-text">{t('voicePay.cannotRecord')}</p>}
          </div>
        )}

        {error && <p className="error-text">{error}</p>}
        <div className="collect-choices">
          <button type="button" className="btn-primary" disabled={!selected || !payment || saving} onClick={save}>
            {saving ? t('common.loading') : t('voicePay.confirm')}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
