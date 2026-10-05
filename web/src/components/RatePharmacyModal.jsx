import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { StarRating } from './StarRating';

// Section 13b/13c: rating the pharmacy is a one-time action per delivered
// order (the unique {orderId, reviewerType} index backs this up server-side
// too) - shown immediately once submitted, unlike the reverse direction.
export function RatePharmacyModal({ order, onClose, onRated }) {
  const { t } = useTranslation();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    if (rating < 1) {
      setError(t('orders.pleaseSelectRating'));
      return;
    }

    setIsSaving(true);
    try {
      await api.ratePharmacy(order.id, rating, comment.trim() || undefined);
      onRated();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h2>{t('orders.rateModalTitle', { name: order.pharmacy?.nameEn })}</h2>
        <form onSubmit={handleSubmit} className="product-form">
          <label>
            {t('orders.rating')}
            <StarRating value={rating} onChange={setRating} size={28} />
          </label>
          <label>
            {t('orders.commentOptional')}
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
          </label>

          {error && <p className="error-text">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={isSaving}>
              {isSaving ? t('orders.submitting') : t('orders.submitRating')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
