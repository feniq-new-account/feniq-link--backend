import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, setSession } from '../api/client';
import { PasswordInput } from './PasswordInput';
import { useModalSafety } from '../hooks/useModalSafety';

// The signed-in panel user changes their own password. The server signs out
// every other device and hands this one a fresh session, kept here so the
// panel stays signed in.
const MIN_LENGTH = { admin: 12, warehouse: 10 };

export function ChangePasswordModal({ role, onClose, required = false }) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const minLength = MIN_LENGTH[role] ?? 8;
  const close = () => { if (!saving && (!required || done)) onClose(); };
  const modal = useModalSafety(saving, close);

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    if (next.length < minLength) {
      setError(t('changePassword.tooShort', { count: minLength }));
      return;
    }
    if (next !== confirm) {
      setError(t('changePassword.mismatch'));
      return;
    }
    setSaving(true);
    try {
      const data = await api.changePassword(current, next);
      setSession({ token: data.token, refreshToken: data.refreshToken });
      setDone(true);
    } catch (err) {
      setError(err.code === 'INVALID_CURRENT_PASSWORD' ? t('changePassword.wrongCurrent') : err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" {...modal.overlayProps}>
      <div className="modal" {...modal.dialogProps}>
        <h2>{t('changePassword.title')}</h2>
        {done ? (
          <>
            <p className="reg-success">{t('changePassword.done')}</p>
            <div className="modal-actions">
              <button type="button" className="btn-primary" onClick={close}>
                {t('common.close')}
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={submit} className="product-form">
            <label htmlFor="cp-current">{t('changePassword.current')}</label>
            <PasswordInput id="cp-current" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
            <label htmlFor="cp-new">{t('changePassword.new', { count: minLength })}</label>
            <PasswordInput id="cp-new" value={next} onChange={(e) => setNext(e.target.value)} required autoComplete="new-password" />
            <label htmlFor="cp-confirm">{t('changePassword.confirm')}</label>
            <PasswordInput id="cp-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
            {error && <p className="error-text">{error}</p>}
            <div className="modal-actions">
              {!required && <button type="button" className="btn-secondary" onClick={close} disabled={saving}>
                {t('common.cancel')}
              </button>}
              <button type="submit" className="btn-primary" disabled={saving}>
                {t('changePassword.save')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
