// Live camera capture for the shared image picker (components/ImagePicker.jsx).
// Plain JS, no React and no DOM of its own - the browser pieces it needs
// (navigator.mediaDevices, a canvas) come in through `env` / `createCanvas` -
// so the whole flow runs under test with a mocked getUserMedia.
//
// The flow: open() starts the camera (rear on a phone, the default built-in
// one on a laptop) -> capture(video) freezes the current frame into a JPEG
// and stops the camera -> retake() starts it again, or use() hands the JPEG
// to `onFile` - the same function a gallery pick goes to, so a photo takes
// the exact same upload path (and server limits) as a chosen file. close()
// stops the camera whatever state it is in.

export const CAPTURE_TYPE = 'image/jpeg';
const JPEG_QUALITY = 0.9;

// What the "تصوير" button can do here:
//  - 'live'     getUserMedia is available: live preview in a modal;
//  - 'insecure' the page is not https/localhost - browsers only expose the
//               camera to a secure context, so it is blocked, not missing;
//  - 'fallback' no getUserMedia at all: a file input with capture="environment"
//               (the phone's own camera app) instead.
export function cameraSupport(env = globalThis) {
  if (env.isSecureContext === false) return 'insecure';
  if (typeof env.navigator?.mediaDevices?.getUserMedia !== 'function') return 'fallback';
  return 'live';
}

// A getUserMedia refusal (a DOMException, by name) -> the message to show.
export function cameraErrorCode(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'notFound';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'inUse';
    default:
      return 'failed';
  }
}

function constraintsFor(facingMode) {
  // `ideal`, never `exact`: a laptop's single camera has no facing mode and is
  // used as it is.
  return {
    audio: false,
    video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
  };
}

function stopTracks(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

const CLOSED = Object.freeze({
  // 'idle' | 'starting' | 'live' | 'captured' | 'error'. The modal shows while
  // starting, live or captured; an error closes it and is shown beside the
  // picker's buttons, where the gallery button still works.
  status: 'idle',
  error: null,
  stream: null,
  facingMode: 'environment',
  // More than one camera (a phone's front and rear): offer to switch.
  canSwitch: false,
  // The captured JPEG, as a File.
  photo: null,
});

export function createCameraCapture({
  env = globalThis,
  onFile,
  createCanvas = () => env.document.createElement('canvas'),
  now = () => Date.now(),
} = {}) {
  let state = CLOSED;
  const listeners = new Set();
  // Bumped by every camera start and by close(): a getUserMedia answer or a
  // capture that arrives for an earlier run (the modal was closed while the
  // permission prompt was up, say) is stopped and dropped, never shown.
  let run = 0;
  // A second "التقط" click while the first frame is still being encoded.
  let capturing = false;

  const set = (patch) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };

  const stopStream = () => {
    stopTracks(state.stream);
    if (state.stream) set({ stream: null });
  };

  async function countCameras() {
    try {
      const devices = await env.navigator.mediaDevices.enumerateDevices();
      return devices.filter((device) => device.kind === 'videoinput').length;
    } catch {
      return 1;
    }
  }

  async function startStream(facingMode) {
    const thisRun = ++run;
    set({ status: 'starting', error: null, facingMode });
    let stream;
    try {
      stream = await env.navigator.mediaDevices.getUserMedia(constraintsFor(facingMode));
    } catch (err) {
      if (thisRun === run) set({ ...CLOSED, status: 'error', error: cameraErrorCode(err) });
      return;
    }
    if (thisRun !== run) {
      stopTracks(stream);
      return;
    }
    set({ status: 'live', stream });
    // Devices are only listed in full once the permission is granted.
    const cameras = await countCameras();
    if (thisRun === run) set({ canSwitch: cameras > 1 });
  }

  function close() {
    run += 1;
    stopTracks(state.stream);
    set({ ...CLOSED });
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async open() {
      if (['starting', 'live', 'captured'].includes(state.status)) return;
      const support = cameraSupport(env);
      if (support !== 'live') {
        set({ ...CLOSED, status: 'error', error: support === 'insecure' ? 'insecure' : 'unsupported' });
        return;
      }
      set({ ...CLOSED });
      await startStream('environment');
    },

    // Freezes the frame `video` is showing, then stops the camera.
    async capture(video) {
      if (state.status !== 'live' || capturing || !video?.videoWidth) return;
      const thisRun = run;
      const canvas = createCanvas();
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      stopStream();
      capturing = true;
      let blob;
      try {
        blob = await new Promise((resolve) => canvas.toBlob(resolve, CAPTURE_TYPE, JPEG_QUALITY));
      } finally {
        capturing = false;
      }
      if (thisRun !== run) return;
      if (!blob) {
        set({ ...CLOSED, status: 'error', error: 'captureFailed' });
        return;
      }
      set({ status: 'captured', photo: new File([blob], `camera-${now()}.jpg`, { type: CAPTURE_TYPE }) });
    },

    async retake() {
      if (state.status !== 'captured') return;
      set({ photo: null });
      await startStream(state.facingMode);
    },

    // Rear <-> front. The running camera is stopped first: many phones cannot
    // open the second one while the first is in use.
    async switchCamera() {
      if (state.status !== 'live') return;
      const next = state.facingMode === 'environment' ? 'user' : 'environment';
      stopStream();
      await startStream(next);
    },

    // Hands the captured JPEG to `onFile` - the gallery's own upload path.
    async use() {
      if (state.status !== 'captured') return;
      const file = state.photo;
      close();
      await onFile(file);
    },

    close,
  };
}
