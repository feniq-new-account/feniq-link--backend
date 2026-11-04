import { useTranslation } from 'react-i18next';
import { useRealtime } from '../realtime/RealtimeProvider';

export function ConnectionStatus({ updatedAt, onRefresh, busy = false }) {
  const { t } = useTranslation();
  const { isConnected } = useRealtime();
  return <div className="connection-status" role="status">
    <span>{t(isConnected ? 'connection.live' : 'connection.offline')}</span>
    {updatedAt && <span>{t('connection.updated', { time: new Date(updatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) })}</span>}
    <button type="button" className="btn-secondary" onClick={onRefresh} disabled={busy}>{t('connection.refresh')}</button>
  </div>;
}
