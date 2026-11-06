import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';

// Documents are never embedded in the page or loaded until an administrator
// explicitly requests one. The API streams them with bearer authentication.
export function AdminPharmacyLicencesPage() {
  const { i18n } = useTranslation();
  const ar = (i18n.resolvedLanguage || i18n.language || 'ar').startsWith('ar');
  const tr = (arabic, english) => ar ? arabic : english;
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const queueGeneration = useRef(0);

  const load = useCallback(async (cursor = null) => {
    // A refresh or successful review invalidates any older load-more response.
    const generation = cursor ? queueGeneration.current : ++queueGeneration.current;
    setLoading(true);
    setError('');
    try {
      const result = await api.listAdminPharmacyLicences({ after: cursor || undefined });
      if (queueGeneration.current !== generation) return;
      setItems(previous => {
        if (!cursor) return result.items || [];
        const seen = new Set(previous.map(row => row.pharmacyId));
        return [...previous, ...(result.items || []).filter(row => !seen.has(row.pharmacyId))];
      });
      setNextCursor(result.pagination?.nextCursor || null);
    } catch (err) {
      if (queueGeneration.current !== generation) return;
      if (!cursor) {
        // A failed full refresh must not show a previously reviewed
        // document as if it were still awaiting approval.
        setItems([]);
        setNextCursor(null);
      }
      setError(err.message || 'Unable to read licence queue.');
    } finally {
      if (queueGeneration.current === generation) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { ++queueGeneration.current; };
  }, [load]);

  const review = async (row, decision) => {
    let note = '';
    if (decision === 'rejected') {
      const answer = window.prompt(tr('اكتب سبب الرفض ليظهر للصيدلي:', 'Reason for rejection shown to pharmacist:'));
      if (answer === null) return;
      note = answer.trim();
      if (!note) {
        setError(tr('سبب الرفض مطلوب.', 'Rejection reason is required.'));
        return;
      }
      if (note.length > 500) {
        setError(tr('سبب الرفض أطول من 500 حرف.', 'Reason must be under 500 characters.'));
        return;
      }
    } else if (!window.confirm(tr('متأكد من قبول هذه الرخصة؟', 'Approve this licence?'))) {
      return;
    }
    setBusyId(row.pharmacyId);
    setError('');
    setNotice('');
    try {
      await api.reviewAdminPharmacyLicence(row.pharmacyId, decision, note);
      setNotice(decision === 'approved'
        ? tr('تم قبول الرخصة.', 'Licence approved.')
        : tr('تم رفض الرخصة وإبلاغ الصيدلي بالسبب عند فتح حالته.', 'Licence rejected; pharmacist will see the reason.'));
      await load();
    } catch (err) {
      setError(err.message || tr('تعذر حفظ القرار.', 'Unable to save review.'));
    } finally {
      setBusyId(null);
    }
  };

  const download = async (row) => {
    setBusyId(row.pharmacyId);
    setError('');
    try {
      const blob = await api.downloadAdminPharmacyLicence(row.pharmacyId);
      const extension = row.mimeType === 'application/pdf' ? 'pdf'
        : row.mimeType === 'image/png' ? 'png' : 'jpg';
      const url = URL.createObjectURL(blob);
      const element = document.createElement('a');
      element.href = url;
      element.download = 'pharmacy-licence-' + row.pharmacyId + '.' + extension;
      document.body.appendChild(element);
      element.click();
      element.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err.message || tr('تعذر تنزيل الوثيقة.', 'Could not download document.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="reg-page">
      <div className="adm-page-head">
        <h1>{tr('مراجعة رخص الصيدليات', 'Pharmacy licence review')}</h1>
        <button type="button" className="btn-secondary" disabled={loading} onClick={() => load()}>
          {tr('تحديث القائمة', 'Refresh')}
        </button>
      </div>
      <p className="hint">{tr(
        'لا تظهر الوثائق هنا إلا للإدارة. يُحمّل المستند عند الطلب ولا يوجد رابط عام له.',
        'Only administrators can view documents. Files are downloaded on demand with no public URL.',
      )}</p>
      {error && <p className="error-text" role="alert">{error}</p>}
      {notice && <p className="reg-success" role="status">{notice}</p>}
      <section className="adm-card reg-card">
        <div className="adm-card-head"><span>{tr('بانتظار مراجعة الرخصة', 'Awaiting licence review')}</span></div>
        <div className="reg-card-body">
          {!loading && !error && items.length === 0 && <p className="hint">{tr('ما في وثائق بانتظار المراجعة.', 'No pending licences.')}</p>}
          {items.map(row => (
            <div key={row.pharmacyId} className="adm-card" style={{ padding: 16, marginBottom: 12 }}>
              <strong>{row.pharmacyName}</strong>
              <p className="hint">{row.ownerName} — <bdi dir="ltr">{row.phone}</bdi></p>
              <p className="hint">{tr('تاريخ الإرسال: ', 'Submitted: ')}
                {row.submittedAt ? new Date(row.submittedAt).toLocaleDateString(ar ? 'ar-SY' : 'en-US') : '—'}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button type="button" className="btn-secondary" disabled={busyId !== null || loading}
                  onClick={() => download(row)}>
                  {tr('تنزيل الوثيقة', 'Download document')}
                </button>
                <button type="button" className="btn-primary" disabled={busyId !== null || loading}
                  onClick={() => review(row, 'approved')}>
                  {tr('قبول', 'Approve')}
                </button>
                <button type="button" className="btn-secondary" disabled={busyId !== null || loading}
                  onClick={() => review(row, 'rejected')}>
                  {tr('رفض مع السبب', 'Reject with reason')}
                </button>
              </div>
            </div>
          ))}
          {loading && <p className="hint">{tr('جارٍ التحميل...', 'Loading...')}</p>}
          {nextCursor && (
            <button type="button" className="btn-secondary" disabled={loading || busyId !== null}
              onClick={() => load(nextCursor)}>
              {tr('عرض المزيد', 'Load more')}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
