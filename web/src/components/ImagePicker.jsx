import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { cameraSupport, createCameraCapture } from '../utils/cameraCapture';

const LIVE_STATUSES = new Set(['starting', 'live', 'captured']);

// The one image picker every image upload in the dashboards uses: the central
// catalog item image and the manufacturer logo (admin), and a product's
// override image (warehouse). Two buttons:
//  - "من المعرض": the file picker, as before;
//  - "تصوير": the device's camera - a live preview in a modal (utils/
//    cameraCapture.js), or, in a browser with no getUserMedia at all, a file
//    input with capture="environment" that opens the phone's camera app.
// Either way the picked or captured image goes to `onFile(file)` - one upload
// path, so a photo meets the same size and type checks as a chosen file.
//
// `label` is an optional caption before the buttons ("Replace image"). `env`
// (the browser globals) and `session` are only ever passed by tests.
export function ImagePicker({
  onFile,
  disabled = false,
  label = null,
  accept = 'image/jpeg,image/png,image/webp',
  buttonClassName = 'btn-secondary',
  env = globalThis,
  session: givenSession = null,
}) {
  const { t } = useTranslation();
  const onFileRef = useRef(onFile);
  useEffect(() => {
    onFileRef.current = onFile;
  });
  const [ownSession] = useState(() =>
    givenSession ? null : createCameraCapture({ env, onFile: (file) => onFileRef.current(file) })
  );
  const session = givenSession ?? ownSession;
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getState);
  // Leaving the page (or closing the form around the picker) stops the camera.
  useEffect(() => () => session.close(), [session]);

  const galleryRef = useRef(null);
  const fallbackRef = useRef(null);
  const support = cameraSupport(env);

  const picked = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) onFile(file);
  };

  return (
    <div className="image-picker">
      {label && <span className="image-picker-label">{label}</span>}
      <button type="button" className={buttonClassName} disabled={disabled} onClick={() => galleryRef.current?.click()}>
        {t('imagePicker.gallery')}
      </button>
      <input ref={galleryRef} type="file" accept={accept} hidden onChange={picked} />
      {support === 'fallback' ? (
        <>
          <button type="button" className={buttonClassName} disabled={disabled} onClick={() => fallbackRef.current?.click()}>
            {t('imagePicker.camera')}
          </button>
          <input ref={fallbackRef} type="file" accept="image/*" capture="environment" hidden onChange={picked} />
        </>
      ) : (
        <button
          type="button"
          className={buttonClassName}
          disabled={disabled || LIVE_STATUSES.has(state.status)}
          onClick={() => session.open()}
        >
          {t('imagePicker.camera')}
        </button>
      )}
      {state.status === 'error' && (
        <p className="error-text image-picker-error" role="alert">
          {t(`imagePicker.errors.${state.error}`)}
        </p>
      )}
      {LIVE_STATUSES.has(state.status) && <CameraModal session={session} state={state} />}
    </div>
  );
}

function CameraModal({ session, state }) {
  const { t } = useTranslation();
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = state.stream ?? null;
    if (state.stream) video.play?.()?.catch?.(() => {});
  }, [state.stream]);

  const photoUrl = useMemo(() => (state.photo ? URL.createObjectURL(state.photo) : null), [state.photo]);
  useEffect(() => () => photoUrl && URL.revokeObjectURL(photoUrl), [photoUrl]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') session.close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [session]);

  const captured = state.status === 'captured';
  // React events bubble along the component tree even out of a portal: a
  // click here must not also reach the product form the picker sits in.
  const closeOnBackdrop = (event) => {
    event.stopPropagation();
    session.close();
  };
  const modal = (
    <div className="modal-overlay camera-modal-overlay" onClick={closeOnBackdrop}>
      <div
        className="modal camera-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('imagePicker.title')}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>{t('imagePicker.title')}</h2>
        <div className="camera-frame">
          {captured ? (
            <img src={photoUrl} alt={t('imagePicker.capturedAlt')} />
          ) : (
            <video ref={videoRef} autoPlay playsInline muted />
          )}
          {state.status === 'starting' && <p className="camera-starting">{t('imagePicker.starting')}</p>}
        </div>
        <div className="modal-actions camera-actions">
          <button type="button" className="btn-secondary" onClick={() => session.close()}>
            {t('common.cancel')}
          </button>
          {captured ? (
            <>
              <button type="button" className="btn-secondary" onClick={() => session.retake()}>
                {t('imagePicker.retake')}
              </button>
              <button type="button" className="btn-primary" onClick={() => session.use()}>
                {t('imagePicker.use')}
              </button>
            </>
          ) : (
            <>
              {state.canSwitch && (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={state.status !== 'live'}
                  onClick={() => session.switchCamera()}
                >
                  {t('imagePicker.switch')}
                </button>
              )}
              <button
                type="button"
                className="btn-primary"
                disabled={state.status !== 'live'}
                onClick={() => session.capture(videoRef.current)}
              >
                {t('imagePicker.capture')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
  // On <body>, above any modal the picker sits in (the product form). Only a
  // test renders this without a document.
  return typeof document === 'undefined' ? modal : createPortal(modal, document.body);
}
