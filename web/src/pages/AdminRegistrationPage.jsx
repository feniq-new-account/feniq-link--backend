import { LaunchSettingsCard } from '../components/LaunchSettingsCard';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { formatBusinessDate } from '../utils/businessDate';

// Everything that decides what happens when a pharmacy signs up: the approval
// switch, the pharmacists' syndicate list new names are checked against, a
// box to try a name against that list, and the admins' Telegram bot that
// brings each registration to the admin's phone with approve/reject buttons.
// Laid out as stacked cards so it works from a phone.
export function AdminRegistrationPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setStatus(await api.registrationStatus());
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="reg-page">
      <div className="adm-page-head">
        <h1>{t('nav.registration')}</h1>
      </div>
      <LaunchSettingsCard />
      {error && <p className="error-text">{error}</p>}
      {!status && !error && <p className="hint">{t('common.loading')}</p>}
      {status && (
        <>
          <ApprovalCard status={status} onChanged={load} />
          <SyndicateListCard registry={status.registry} onChanged={load} />
          <TryNameCard disabled={status.registry.count === 0} />
          <TelegramCard telegram={status.telegram} onChanged={load} />
        </>
      )}
    </div>
  );
}

function Card({ title, children }) {
  return (
    <section className="adm-card reg-card">
      <div className="adm-card-head">
        <span>{title}</span>
      </div>
      <div className="reg-card-body">{children}</div>
    </section>
  );
}

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (work) => {
    setBusy(true);
    setError(null);
    try {
      return await work();
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function ApprovalCard({ status, onChanged }) {
  const { t } = useTranslation();
  const { busy, error, run } = useAction();
  const on = status.approvalRequired;

  const toggle = () => {
    if (on && status.pendingPharmacies > 0) {
      if (!window.confirm(t('registration.approval.confirmOff', { count: status.pendingPharmacies }))) return;
    }
    run(async () => {
      await api.setApprovalRequired(!on);
      await onChanged();
    });
  };

  return (
    <Card title={t('registration.approval.title')}>
      <p className={`reg-state ${on ? 'reg-state-on' : 'reg-state-off'}`}>
        {on ? t('registration.approval.on') : t('registration.approval.off')}
      </p>
      {on && status.pendingPharmacies > 0 && (
        <p className="hint">{t('registration.approval.pending', { count: status.pendingPharmacies })}</p>
      )}
      {error && <p className="error-text">{error}</p>}
      <button type="button" className={on ? 'btn-secondary' : 'btn-primary'} disabled={busy} onClick={toggle}>
        {on ? t('registration.approval.turnOff') : t('registration.approval.turnOn')}
      </button>
      <MinScoreControl minScore={status.minScore} onChanged={onChanged} />
    </Card>
  );
}

// The lowest syndicate-list match that gets in without the admin looking.
// Higher = stricter: only names typed almost exactly as listed get straight in.
const MIN_SCORE_OPTIONS = [70, 75, 80, 85, 90, 95, 100];

function MinScoreControl({ minScore, onChanged }) {
  const { t } = useTranslation();
  const { busy, error, run } = useAction();
  const [released, setReleased] = useState(null);

  const change = (event) => {
    const value = Number(event.target.value);
    run(async () => {
      const data = await api.setAutoApproveMinScore(value);
      setReleased(data.autoApproved);
      await onChanged();
    });
  };

  return (
    <div className="reg-min-score">
      <label htmlFor="reg-min-score">{t('registration.approval.minScore')}</label>
      <select id="reg-min-score" value={minScore} onChange={change} disabled={busy}>
        {MIN_SCORE_OPTIONS.map((value) => (
          <option key={value} value={value}>
            {`${value}%`}
          </option>
        ))}
      </select>
      <p className="hint">{t('registration.approval.minScoreHint')}</p>
      {released > 0 && <p className="reg-success">{t('registration.approval.released', { count: released })}</p>}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

function SyndicateListCard({ registry, onChanged }) {
  const { t } = useTranslation();
  const { busy, error, run } = useAction();
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const last = registry.lastImport;

  const upload = (event) => {
    event.preventDefault();
    if (!file) return;
    run(async () => {
      const data = await api.uploadSyndicateList(file);
      setResult(data);
      setFile(null);
      event.target.reset();
      await onChanged();
    });
  };

  return (
    <Card title={t('registration.list.title')}>
      {registry.count > 0 ? (
        <p className="reg-state reg-state-on">
          {t('registration.list.loaded', { count: registry.count })}
          {last && (
            <span className="reg-sub">
              {' '}
              {t('registration.list.lastImport', {
                date: formatBusinessDate(last.importedAt),
                name: last.importedBy || '—',
              })}
            </span>
          )}
        </p>
      ) : (
        <p className="reg-state reg-state-off">{t('registration.list.empty')}</p>
      )}
      <p className="hint">{t('registration.list.hint')}</p>
      <form className="reg-upload" onSubmit={upload}>
        {/* The native picker labels itself in the browser's language, not the
            panel's - so it is hidden behind a label that speaks ours. */}
        <label className="btn-secondary reg-file-label">
          {t('registration.list.choose')}
          <input
            type="file"
            className="reg-file-input"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <span className="reg-sub reg-file-name">{file ? file.name : t('registration.list.noFile')}</span>
        <button type="submit" className="btn-primary" disabled={!file || busy}>
          {busy ? t('registration.list.uploading') : t('registration.list.upload')}
        </button>
      </form>
      {error && <p className="error-text">{error}</p>}
      {result && (
        <p className="reg-success">
          {t('registration.list.done', { count: result.imported })}
          {result.autoApproved > 0 && ` ${t('registration.list.autoApproved', { count: result.autoApproved })}`}
        </p>
      )}
    </Card>
  );
}

export function MatchSummary({ match }) {
  const { t } = useTranslation();
  if (!match) return null;
  const onList = match.decision === 'approved';
  const where = [match.place, match.region].filter(Boolean).join('، ');
  return (
    <div className={`reg-match ${onList ? 'reg-match-on' : 'reg-match-off'}`}>
      <div className="reg-match-verdict">
        {onList ? t('registration.match.onList') : t('registration.match.notOnList')}
      </div>
      {match.reasons?.length > 0 && <div className="reg-sub">{match.reasons.join(' — ')}</div>}
      {match.pharmacistName && (
        <div className="reg-sub">
          {onList ? t('registration.match.matched') : t('registration.match.closest')}{' '}
          <b>{match.pharmacistName}</b>
          {match.fatherName && ` (${t('registration.match.father')} ${match.fatherName})`}
          {match.pharmacyName && ` — ${match.pharmacyName}`}
          {where && ` — ${where}`}
          {match.phones?.length > 0 && (
            <>
              {' — '}
              <bdi className="adm-num">{match.phones.join(' / ')}</bdi>
            </>
          )}
        </div>
      )}
      {match.pharmacistName && (
        <div className="reg-sub">
          {t('registration.match.score')} <bdi className="adm-num">{`${match.score}%`}</bdi>
        </div>
      )}
    </div>
  );
}

function TryNameCard({ disabled }) {
  const { t } = useTranslation();
  const { busy, error, run } = useAction();
  const [form, setForm] = useState({ name: '', pharmacyName: '', phone: '' });
  const [result, setResult] = useState(null);
  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const check = (event) => {
    event.preventDefault();
    run(async () => {
      const data = await api.checkRegistrationName(form);
      setResult(data.result);
    });
  };

  return (
    <Card title={t('registration.try.title')}>
      <p className="hint">{t('registration.try.hint')}</p>
      <form className="reg-try" onSubmit={check}>
        <input placeholder={t('registration.try.name')} value={form.name} onChange={set('name')} />
        <input placeholder={t('registration.try.pharmacyName')} value={form.pharmacyName} onChange={set('pharmacyName')} />
        <input placeholder={t('registration.try.phone')} value={form.phone} onChange={set('phone')} dir="ltr" inputMode="tel" />
        <button
          type="submit"
          className="btn-primary"
          disabled={disabled || busy || (!form.name.trim() && !form.pharmacyName.trim())}
        >
          {t('registration.try.check')}
        </button>
      </form>
      {error && <p className="error-text">{error}</p>}
      <MatchSummary match={result} />
    </Card>
  );
}

function TelegramCard({ telegram, onChanged }) {
  const { t } = useTranslation();
  const { busy, error, run } = useAction();
  const [token, setToken] = useState('');
  const [link, setLink] = useState(null);

  const saveToken = (event) => {
    event.preventDefault();
    run(async () => {
      await api.setTelegramBot(token.trim());
      setToken('');
      await onChanged();
    });
  };

  const makeLink = () =>
    run(async () => {
      setLink(await api.createTelegramLink());
    });

  const unlink = () =>
    run(async () => {
      await api.unlinkTelegram();
      setLink(null);
      await onChanged();
    });

  const removeBot = () => {
    if (!window.confirm(t('registration.telegram.confirmRemove'))) return;
    run(async () => {
      await api.removeTelegramBot();
      setLink(null);
      await onChanged();
    });
  };

  if (!telegram.configured) {
    return (
      <Card title={t('registration.telegram.title')}>
        <p className="hint">{t('registration.telegram.why')}</p>
        <ol className="reg-steps">
          <li>
            {t('registration.telegram.step1')}{' '}
            <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">
              <bdi>@BotFather</bdi>
            </a>
          </li>
          <li>
            {t('registration.telegram.step2')} <code dir="ltr">/newbot</code>{' '}
            {t('registration.telegram.step2b')}
          </li>
          <li>
            {t('registration.telegram.step3')} <code dir="ltr">feniq_admin_bot</code>
          </li>
          <li>{t('registration.telegram.step4')}</li>
        </ol>
        <form className="reg-token" onSubmit={saveToken}>
          <input
            dir="ltr"
            autoComplete="off"
            placeholder="123456789:ABC..."
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <button type="submit" className="btn-primary" disabled={busy || !token.trim()}>
            {t('registration.telegram.save')}
          </button>
        </form>
        {error && <p className="error-text">{error}</p>}
      </Card>
    );
  }

  return (
    <Card title={t('registration.telegram.title')}>
      <p className={`reg-state ${telegram.reachable ? 'reg-state-on' : 'reg-state-off'}`}>
        {telegram.reachable ? (
          <>
            {t('registration.telegram.bot')} <bdi>@{telegram.username}</bdi>
          </>
        ) : (
          t('registration.telegram.unreachable')
        )}
      </p>
      {!telegram.publicUrlKnown && <p className="error-text">{t('registration.telegram.noPublicUrl')}</p>}

      {telegram.linked ? (
        <>
          <p className="reg-state reg-state-on">{t('registration.telegram.linked')}</p>
          <button type="button" className="btn-secondary" disabled={busy} onClick={unlink}>
            {t('registration.telegram.unlink')}
          </button>
        </>
      ) : (
        <>
          <p className="hint">{t('registration.telegram.linkHint')}</p>
          {link ? (
            <div className="reg-link">
              <a className="btn-primary" href={link.url} target="_blank" rel="noreferrer">
                {t('registration.telegram.openLink')}
              </a>
              <p className="hint">{t('registration.telegram.linkExpires', { minutes: link.expiresInMinutes })}</p>
              <button type="button" className="btn-secondary" onClick={onChanged}>
                {t('registration.telegram.linkedCheck')}
              </button>
            </div>
          ) : (
            <button type="button" className="btn-primary" disabled={busy} onClick={makeLink}>
              {t('registration.telegram.link')}
            </button>
          )}
        </>
      )}
      {telegram.linkedAdmins > 0 && (
        <p className="hint">{t('registration.telegram.linkedAdmins', { count: telegram.linkedAdmins })}</p>
      )}
      {error && <p className="error-text">{error}</p>}
      {telegram.source === 'panel' && (
        <button type="button" className="reg-text-button" disabled={busy} onClick={removeBot}>
          {t('registration.telegram.remove')}
        </button>
      )}
    </Card>
  );
}
