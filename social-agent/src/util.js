// مساعدات صغيرة مشتركة.

const enc = new TextEncoder();

export async function hmacHex(key, message) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// كل الأسرار المشتقة من توكن البوت: لا حاجة لأسرار إضافية، وسكربت النشر يحسبها بنفس الطريقة (openssl).
export async function webhookSecret(env) {
  return (await hmacHex(env.TELEGRAM_BOT_TOKEN, 'feniq-webhook')).slice(0, 48);
}
export async function setupKey(env) {
  return (await hmacHex(env.TELEGRAM_BOT_TOKEN, 'feniq-setup')).slice(0, 48);
}
export async function claimCode(env) {
  return (await hmacHex(env.TELEGRAM_BOT_TOKEN, 'feniq-owner-claim')).slice(0, 24);
}

export function randomId(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// مقارنة بزمن ثابت للأسرار.
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function truncate(s, n) {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// يستخرج أول كائن JSON من رد نموذج (قد يلفّه بـ ```json أو بنص).
export function extractJson(text) {
  if (text && typeof text === 'object') return text;
  const s = String(text ?? '').replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(s);
  } catch {}
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(s.slice(start, end + 1));
    } catch {}
  }
  throw new Error('رد النموذج ليس JSON صالحاً: ' + truncate(s, 200));
}

export function detectImageMime(bytes) {
  const b = new Uint8Array(bytes.buffer ? bytes.buffer : bytes, bytes.byteOffset || 0, 4);
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return 'image/webp';
  return 'application/octet-stream';
}

export function toBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

export function fromBase64(b64) {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}
