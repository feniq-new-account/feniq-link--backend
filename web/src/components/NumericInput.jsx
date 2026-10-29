import { forwardRef, useCallback, useId, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { asciiDigits } from '../utils/digits';

// Text-backed to accept Arabic/Persian mobile keyboards before normalization.
// Keep native number constraints: a rejected paste is never shortened into a
// different amount, fractions obey step, and a parent rejecting a change wins.
export const NumericInput = forwardRef(function NumericInput({
  type = 'number', value, defaultValue, min, max, step = 1, inputMode, onChange,
  onBlur, lang = 'en', dir = 'ltr', ...props
}, ref) {
  const { t } = useTranslation();
  const node = useRef(null);
  const errorId = useId();
  const [rejected, setRejected] = useState(false);
  const [raw, setRaw] = useState(() => asciiDigits(value ?? defaultValue ?? ''));
  const telephone = type === 'tel';
  const validate = useCallback((element, text, wasRejected = rejected) => {
    let valid = !wasRejected;
    if (!telephone && text !== '') {
      const number = Number(text);
      valid &&= /^[-+]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/.test(text) && Number.isFinite(number);
      if (min !== undefined && min !== '') valid &&= number >= Number(min);
      if (max !== undefined && max !== '') valid &&= number <= Number(max);
      if (step !== 'any' && Number(step) > 0) {
        const ticks = (number - Number(min || 0)) / Number(step);
        valid &&= Math.abs(ticks - Math.round(ticks)) < 1e-7;
      }
    }
    element.setCustomValidity(valid ? '' : t('numericInput.invalid'));
  }, [telephone, min, max, step, rejected, t]);
  useLayoutEffect(() => {
    let display = raw;
    if (value !== undefined) {
      const expected = asciiDigits(value ?? '');
      const sameNumber = !telephone && raw !== '' && expected !== '' && Number(raw) === Number(expected);
      if (raw !== expected && !sameNumber) { display = expected; setRaw(expected); if (rejected) setRejected(false); }
    }
    if (node.current) validate(node.current, display);
  }, [value, raw, telephone, rejected, validate]);
  function change(event) {
    const text = asciiDigits(event.target.value);
    // Reject an entire malformed paste; never strip decimal/sign characters.
    if (!telephone && text !== '' && !/^[-+]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/.test(text)) {
      event.target.value = raw; setRejected(true); event.target.setCustomValidity(t('numericInput.invalid'));
      return;
    }
    event.target.value = text; setRaw(text); setRejected(false); validate(event.target, text, false); onChange?.(event);
  }
  return <><input {...props} type={telephone ? 'tel' : 'text'} data-numeric-input={telephone ? 'tel' : 'number'} aria-invalid={rejected || props['aria-invalid'] || undefined} aria-describedby={[props['aria-describedby'], rejected ? errorId : null].filter(Boolean).join(' ') || undefined} inputMode={inputMode || (telephone ? 'tel' : 'decimal')}
    lang={lang} dir={dir} min={min} max={max} step={step} value={raw}
    ref={(element) => { node.current = element; if (typeof ref === 'function') ref(element); else if (ref) ref.current = element; }}
    onChange={change} onBlur={(event) => { validate(event.target, raw); onBlur?.(event); }} />{rejected && <small id={errorId} role="alert" className="numeric-input-error">{t('numericInput.invalid')}</small>}</>;
});
