import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import i18next from 'i18next';
import en from '../locales/en/translation.json';
import ar from '../locales/ar/translation.json';
import { api } from '../api/client';
import { cameraSupport, createCameraCapture } from '../utils/cameraCapture';
import { ImagePicker } from './ImagePicker';
import { EMPTY_PRODUCT_FORM, ProductImageField } from './ProductFormModal';

// The shared image picker: "من المعرض" (the file picker) and "تصوير" (the
// camera). The camera flow runs against a mocked getUserMedia - node has no
// camera and no DOM - and the markup is rendered statically in each state.

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

// A browser with `cameras` cameras. `fail` makes getUserMedia refuse with that
// DOMException name; `hold` keeps it pending until release() is called.
function fakeBrowser({ cameras = 1, secure = true, noMediaDevices = false, fail = null, hold = false } = {}) {
  const streams = [];
  let release = null;
  const getUserMedia = vi.fn(async (constraints) => {
    if (fail) throw new DOMException('refused', fail);
    const track = { kind: 'video', stop: vi.fn() };
    const stream = { constraints, track, getTracks: () => [track] };
    streams.push(stream);
    if (hold) await new Promise((resolve) => (release = resolve));
    return stream;
  });
  const enumerateDevices = vi.fn(async () =>
    Array.from({ length: cameras }, (_, index) => ({ kind: 'videoinput', deviceId: `cam${index}` }))
  );
  const env = {
    isSecureContext: secure,
    navigator: noMediaDevices ? {} : { mediaDevices: { getUserMedia, enumerateDevices } },
  };
  return { env, getUserMedia, streams, release: () => release?.() };
}

// A <video> showing a 1280x720 frame, and a canvas that encodes it.
const video = { videoWidth: 1280, videoHeight: 720 };
function fakeCanvas() {
  const drawImage = vi.fn();
  const canvas = {
    width: 0,
    height: 0,
    drawImage,
    getContext: () => ({ drawImage }),
    toBlob: vi.fn((callback, type, quality) => callback(new Blob([JPEG_BYTES], { type }), quality)),
  };
  return canvas;
}

function camera(browser, onFile = vi.fn()) {
  const canvas = fakeCanvas();
  const session = createCameraCapture({ env: browser.env, onFile, createCanvas: () => canvas, now: () => 1700000000000 });
  return { session, canvas, onFile };
}

function render(props, lng = 'ar') {
  const i18n = i18next.createInstance();
  i18n.use(initReactI18next).init({
    lng,
    resources: { en: { translation: en }, ar: { translation: ar } },
    interpolation: { escapeValue: false },
  });
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <ImagePicker onFile={() => {}} {...props} />
    </I18nextProvider>
  );
}

const buttons = (html) => [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
const enabledButtons = (html) =>
  [...html.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)].filter((m) => !/\sdisabled=""/.test(m[1])).map((m) => m[2]);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the picker buttons', () => {
  it('offers the gallery and the camera, in Arabic', () => {
    const html = render({ env: fakeBrowser().env });
    expect(buttons(html)).toEqual(['من المعرض', 'تصوير']);
    // The gallery is the file picker it always was.
    expect(html).toContain('type="file"');
    expect(html).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(html).not.toContain('capture=');
  });

  it('is used by the warehouse product image field', () => {
    const i18n = i18next.createInstance();
    i18n.use(initReactI18next).init({ lng: 'ar', resources: { ar: { translation: ar } }, interpolation: { escapeValue: false } });
    const html = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <ProductImageField form={EMPTY_PRODUCT_FORM} setForm={() => {}} />
      </I18nextProvider>
    );
    expect(buttons(html)).toEqual(expect.arrayContaining(['من المعرض', 'تصوير']));
  });
});

describe('the live camera', () => {
  it('opens the rear camera by default; a switch button appears only when there is another camera', async () => {
    const phone = fakeBrowser({ cameras: 2 });
    const { session } = camera(phone);
    await session.open();
    expect(phone.getUserMedia).toHaveBeenCalledTimes(1);
    expect(phone.getUserMedia.mock.calls[0][0].video.facingMode).toEqual({ ideal: 'environment' });
    expect(session.getState()).toMatchObject({ status: 'live', canSwitch: true, facingMode: 'environment' });
    expect(buttons(render({ env: phone.env, session }))).toContain('تبديل الكاميرا');

    // Front camera: the rear one is stopped before it starts.
    await session.switchCamera();
    expect(phone.streams[0].track.stop).toHaveBeenCalled();
    expect(phone.getUserMedia.mock.calls[1][0].video.facingMode).toEqual({ ideal: 'user' });
    expect(session.getState()).toMatchObject({ status: 'live', facingMode: 'user' });

    // A laptop's one built-in camera: its default, no switch button.
    const laptop = fakeBrowser({ cameras: 1 });
    const { session: laptopSession } = camera(laptop);
    await laptopSession.open();
    expect(laptopSession.getState()).toMatchObject({ status: 'live', canSwitch: false });
    const html = render({ env: laptop.env, session: laptopSession });
    expect(html).toContain('<video');
    expect(buttons(html)).not.toContain('تبديل الكاميرا');
    expect(enabledButtons(html)).toEqual(expect.arrayContaining(['إلغاء', 'التقط']));
  });

  it('capture -> "استخدم الصورة" uploads the JPEG exactly as a gallery file is uploaded', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'token', setItem() {}, removeItem() {} });
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true }) }));
    vi.stubGlobal('fetch', fetchMock);
    const upload = vi.spyOn(api, 'uploadCatalogImage');

    const browser = fakeBrowser();
    // The catalog page's own upload function, as ImagePicker's onFile.
    const { session, canvas } = camera(browser, (file) => api.uploadCatalogImage('item1', file));
    await session.open();
    await session.capture(video);

    // The frame is frozen and the camera stopped.
    expect(canvas.width).toBe(1280);
    expect(canvas.height).toBe(720);
    expect(canvas.drawImage).toHaveBeenCalledWith(video, 0, 0, 1280, 720);
    expect(canvas.toBlob.mock.calls[0][1]).toBe('image/jpeg');
    expect(browser.streams[0].track.stop).toHaveBeenCalled();
    const { status, photo, stream } = session.getState();
    expect(status).toBe('captured');
    expect(stream).toBeNull();
    expect(photo).toBeInstanceOf(File);
    expect(photo.type).toBe('image/jpeg');
    expect(photo.name).toBe('camera-1700000000000.jpg');
    expect(new Uint8Array(await photo.arrayBuffer())).toEqual(JPEG_BYTES);
    const frozen = render({ env: browser.env, session });
    expect(frozen).toContain('<img src="blob:');
    expect(enabledButtons(frozen)).toEqual(expect.arrayContaining(['استخدم الصورة', 'إعادة']));

    await session.use();
    expect(session.getState().status).toBe('idle');
    expect(upload).toHaveBeenCalledWith('item1', photo);
    const [cameraUrl, cameraRequest] = fetchMock.mock.calls[0];
    expect(cameraUrl).toMatch(/\/admin\/catalog\/item1\/image$/);
    expect(cameraRequest.method).toBe('POST');
    expect(cameraRequest.body.get('image')).toBe(photo);

    // A gallery file makes the very same request.
    const galleryFile = new File([JPEG_BYTES], 'from-gallery.jpg', { type: 'image/jpeg' });
    await api.uploadCatalogImage('item1', galleryFile);
    const [galleryUrl, galleryRequest] = fetchMock.mock.calls[1];
    expect(galleryUrl).toBe(cameraUrl);
    expect(galleryRequest.method).toBe(cameraRequest.method);
    expect(galleryRequest.headers).toEqual(cameraRequest.headers);
    expect([...galleryRequest.body.keys()]).toEqual([...cameraRequest.body.keys()]);
  });

  it('"إعادة" drops the frozen frame and starts the same camera again', async () => {
    const browser = fakeBrowser({ cameras: 2 });
    const { session, onFile } = camera(browser);
    await session.open();
    await session.switchCamera(); // the front camera
    await session.capture(video);
    expect(session.getState().status).toBe('captured');

    await session.retake();
    expect(session.getState()).toMatchObject({ status: 'live', photo: null, facingMode: 'user' });
    expect(browser.getUserMedia).toHaveBeenCalledTimes(3);
    expect(browser.getUserMedia.mock.calls[2][0].video.facingMode).toEqual({ ideal: 'user' });
    expect(browser.streams[1].track.stop).toHaveBeenCalled(); // stopped at capture
    expect(browser.streams[2].track.stop).not.toHaveBeenCalled(); // the live one
    expect(onFile).not.toHaveBeenCalled();
  });

  it('cancel stops the camera - while live, after a capture, and even before it has started', async () => {
    const browser = fakeBrowser();
    const { session, onFile } = camera(browser);
    await session.open();
    session.close();
    expect(browser.streams[0].track.stop).toHaveBeenCalledTimes(1);
    expect(session.getState()).toMatchObject({ status: 'idle', stream: null });

    await session.open();
    await session.capture(video);
    session.close();
    expect(session.getState()).toMatchObject({ status: 'idle', photo: null });
    expect(onFile).not.toHaveBeenCalled();

    // Cancelled while the permission prompt is still up: the stream that
    // arrives afterwards is stopped at once and never shown.
    const slow = fakeBrowser({ hold: true });
    const { session: slowSession } = camera(slow);
    const opening = slowSession.open();
    expect(slowSession.getState().status).toBe('starting');
    slowSession.close();
    slow.release();
    await opening;
    expect(slow.streams[0].track.stop).toHaveBeenCalledTimes(1);
    expect(slowSession.getState().status).toBe('idle');
  });
});

describe('when the camera cannot start', () => {
  it('permission denied: a clear Arabic message, and the gallery still works', async () => {
    const browser = fakeBrowser({ fail: 'NotAllowedError' });
    const { session } = camera(browser);
    await session.open();
    expect(session.getState()).toMatchObject({ status: 'error', error: 'denied', stream: null });
    const html = render({ env: browser.env, session });
    expect(html).toContain(ar.imagePicker.errors.denied);
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('<video'); // no modal
    expect(enabledButtons(html)).toEqual(['من المعرض', 'تصوير']);
    // And in English.
    expect(render({ env: browser.env, session }, 'en')).toContain(en.imagePicker.errors.denied);
  });

  it('no camera found, or the camera busy in another app', async () => {
    for (const [name, code] of [['NotFoundError', 'notFound'], ['NotReadableError', 'inUse']]) {
      const browser = fakeBrowser({ fail: name });
      const { session } = camera(browser);
      await session.open();
      expect(session.getState().error, name).toBe(code);
      expect(render({ env: browser.env, session })).toContain(ar.imagePicker.errors[code]);
    }
  });

  it('not https/localhost: says so without asking for the camera, and the gallery still works', async () => {
    const browser = fakeBrowser({ secure: false });
    expect(cameraSupport(browser.env)).toBe('insecure');
    const { session } = camera(browser);
    await session.open();
    expect(browser.getUserMedia).not.toHaveBeenCalled();
    expect(session.getState()).toMatchObject({ status: 'error', error: 'insecure' });
    const html = render({ env: browser.env, session });
    expect(html).toContain(ar.imagePicker.errors.insecure);
    expect(html).toContain('https');
    expect(enabledButtons(html)).toContain('من المعرض');
  });
});

describe('a browser with no getUserMedia at all', () => {
  it('"تصوير" falls back to a file input that opens the camera app', () => {
    const browser = fakeBrowser({ noMediaDevices: true });
    expect(cameraSupport(browser.env)).toBe('fallback');
    const html = render({ env: browser.env });
    expect(buttons(html)).toEqual(['من المعرض', 'تصوير']);
    expect(html).toMatch(/<input[^>]*type="file"[^>]*accept="image\/\*"[^>]*capture="environment"/);
    // Alongside the gallery's own input.
    expect(html).toMatch(/<input[^>]*type="file"[^>]*accept="image\/jpeg,image\/png,image\/webp"/);
  });

  it('the live flow is never attempted there', async () => {
    const browser = fakeBrowser({ noMediaDevices: true });
    const { session } = camera(browser);
    await session.open();
    expect(session.getState()).toMatchObject({ status: 'error', error: 'unsupported' });
  });
});
