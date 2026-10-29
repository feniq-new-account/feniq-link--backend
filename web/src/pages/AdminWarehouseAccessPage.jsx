import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { usePaginatedData } from '../hooks/usePaginatedData';
import { LoadMoreControl } from '../components/LoadMoreControl';

const EMPTY_MEMBER = { name: '', phone: '', password: '', warehouseRole: 'accountant' };
function localDateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function AdminWarehouseAccessPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState(null);
  const [member, setMember] = useState(EMPTY_MEMBER);
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const generation = useRef(0);
  const list = usePaginatedData(async (after) => {
    const result = await api.listAdminWarehouseAccess({ search, after });
    return { rows: result.warehouses, ...result.pagination };
  });
  useEffect(() => { list.reset(); }, [search, list.reset]);

  useEffect(() => {
    const current = ++generation.current;
    setDetail(null); setForm(null); setMembers([]); setCreated(null); setMember(EMPTY_MEMBER);
    setError(null); setNotice(null);
    if (!selected) return;
    setLoading(true);
    Promise.all([api.getAdminWarehouseSubscription(selected.id), api.getAdminWarehouseMembers(selected.id)])
      .then(([subscription, accounts]) => {
        if (current !== generation.current) return;
        setDetail(subscription); setMembers(accounts.members);
        const config = subscription.configuration;
        setForm({ plan: config?.plan || 'field_team', status: config?.status || 'trial',
          paidUntil: localDateInput(config?.paidUntil), graceDays: config?.graceDays ?? 7,
          note: config?.note || '',
          features: Object.fromEntries(subscription.featureNames.map((key) => [key, config?.features?.[key] !== false])),
        });
      }).catch((err) => { if (current === generation.current) setError(err.message); })
      .finally(() => { if (current === generation.current) setLoading(false); });
    return () => { generation.current += 1; };
  }, [selected]);

  const saveSubscription = async (event) => {
    event.preventDefault(); setBusy(true); setError(null); setNotice(null);
    try {
      const result = await api.updateAdminWarehouseSubscription(selected.id, {
        ...form, graceDays: Number(form.graceDays), paidUntil: form.paidUntil ? new Date(form.paidUntil).toISOString() : null,
      });
      setDetail(result); setNotice(t('warehouseAccess.saved'));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const createMember = async (event) => {
    event.preventDefault(); setBusy(true); setError(null); setNotice(null); setCreated(null);
    try {
      const result = await api.createAdminWarehouseMember(selected.id, member);
      setMembers((rows) => [...rows, result.member]);
      setCreated({ ...result.member, temporaryPassword: member.password });
      setMember(EMPTY_MEMBER); setNotice(t('warehouseAccess.created'));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const changeMemberRole = async (id, warehouseRole) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = await api.updateAdminWarehouseMemberRole(selected.id, id, warehouseRole);
      setMembers(result.members); setNotice(t('warehouseAccess.roleChanged'));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return <section className="warehouse-access-page">
    <h1>{t('warehouseAccess.title')}</h1>
    <p className="hint">{t('warehouseAccess.help')}</p>
    <label>{t('common.search')}<input type="search" value={search} disabled={busy}
      onChange={(event) => setSearch(event.target.value)} /></label>
    {list.error && <div><p className="error-text" role="alert">{list.error}</p>
      <button type="button" className="btn-secondary" onClick={list.reset}>{t('common.retry')}</button></div>}
    {list.isLoading && <p role="status">{t('common.loading')}</p>}
    {!list.isLoading && list.data.length === 0 && <p>{t('warehouseAccess.empty')}</p>}
    <div className="warehouse-access-list">
      {list.data.map((row) => <button key={row.id} type="button" disabled={busy}
        className={selected?.id === row.id ? 'btn-primary' : 'btn-secondary'}
        aria-pressed={selected?.id === row.id} onClick={() => setSelected(row)}>{row.nameAr} · {row.city}</button>)}
    </div>
    {list.data.length > 0 && <LoadMoreControl hasMore={list.hasMore} isLoadingMore={list.isLoadingMore} onLoadMore={list.loadMore} pageSize={20} />}
    {loading && <p role="status">{t('common.loading')}</p>}
    {error && <div><p className="error-text" role="alert">{error}</p>
      {!detail && selected && <button type="button" className="btn-secondary"
        onClick={() => setSelected({ ...selected })}>{t('common.retry')}</button>}</div>}
    {notice && <p role="status">{notice}</p>}
    {detail && form && <>
      <h2>{selected.nameAr}</h2>
      <p>{t('warehouseAccess.currentState')}: <strong>{t(`warehouseAccess.states.${detail.state}`)}</strong></p>
      <div className="warehouse-access-layout">
        <form onSubmit={saveSubscription}>
          <fieldset disabled={busy}>
            <legend>{t('warehouseAccess.subscription')}</legend>
            <label>{t('warehouseAccess.plan')}<select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
              {['basic', 'management', 'field_team'].map((key) => <option value={key} key={key}>{t(`warehouseAccess.plans.${key}`)}</option>)}
            </select></label>
            <label>{t('warehouseAccess.status')}<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {['trial', 'active', 'paused'].map((key) => <option value={key} key={key}>{t(`warehouseAccess.states.${key}`)}</option>)}
            </select></label>
            <label>{t('warehouseAccess.paidUntil')}<input type="datetime-local" lang="en" dir="ltr" value={form.paidUntil}
              required={form.status === 'active'} onChange={(e) => setForm({ ...form, paidUntil: e.target.value })} /></label>
            <label>{t('warehouseAccess.graceDays')}<input type="number" lang="en" dir="ltr" min="0" max="30" step="1" value={form.graceDays}
              onChange={(e) => setForm({ ...form, graceDays: e.target.value })} /></label>
            <p className="hint">{t('warehouseAccess.trialHelp')}</p>
            {detail.featureNames.map((key) => <label key={key} className="warehouse-access-feature">
              <input type="checkbox" checked={form.features[key]} onChange={(e) => setForm({ ...form,
                features: { ...form.features, [key]: e.target.checked } })} />{t(`warehouseAccess.features.${key}`)}
            </label>)}
            <label>{t('warehouseAccess.note')}<textarea maxLength="1000" value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
            <button className="btn-primary" type="submit">{busy ? t('common.loading') : t('warehouseAccess.save')}</button>
          </fieldset>
        </form>
        <div>
          <h3>{t('warehouseAccess.members')}</h3>
          <ul>{members.map((row) => <li key={row.id}>
            {row.name} — <bdi dir="ltr">{row.phone}</bdi>
            <label>{t('warehouseAccess.role')}<select value={row.warehouseRole} disabled={busy}
              onChange={(event) => changeMemberRole(row.id, event.target.value)}>
              {row.warehouseRole === 'legacy' && <option value="legacy" disabled>{t('warehouseAccess.roles.legacy')}</option>}
              <option value="owner">{t('warehouseAccess.roles.owner')}</option>
              <option value="accountant">{t('warehouseAccess.roles.accountant')}</option>
            </select></label>
          </li>)}</ul>
          <form onSubmit={createMember}>
            <fieldset disabled={busy}>
              <legend>{t('warehouseAccess.addMember')}</legend>
              <label>{t('warehouseAccess.name')}<input required maxLength="120" value={member.name}
                onChange={(e) => setMember({ ...member, name: e.target.value })} /></label>
              <label>{t('warehouseAccess.phone')}<input required type="tel" dir="ltr" value={member.phone}
                onChange={(e) => setMember({ ...member, phone: e.target.value })} /></label>
              <label>{t('warehouseAccess.password')}<input required type="password" autoComplete="new-password" minLength="10"
                value={member.password} onChange={(e) => setMember({ ...member, password: e.target.value })} /></label>
              <label>{t('warehouseAccess.role')}<select value={member.warehouseRole}
                onChange={(e) => setMember({ ...member, warehouseRole: e.target.value })}>
                <option value="accountant">{t('warehouseAccess.roles.accountant')}</option>
                <option value="owner">{t('warehouseAccess.roles.owner')}</option>
              </select></label>
              <button type="submit" className="btn-primary">{t('warehouseAccess.create')}</button>
            </fieldset>
          </form>
          {created && <div className="warehouse-access-credentials">
            <p>{t('warehouseAccess.credentialsHelp')}</p>
            <p><bdi dir="ltr">{created.phone}</bdi></p>
            <label>{t('warehouseAccess.password')}<input readOnly dir="ltr" value={created.temporaryPassword} /></label>
            <button type="button" className="btn-secondary" onClick={() => setCreated(null)}>{t('warehouseAccess.hideCredentials')}</button>
          </div>}
        </div>
      </div>
    </>}
  </section>;
}
