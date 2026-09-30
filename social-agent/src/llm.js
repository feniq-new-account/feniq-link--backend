// النماذج اللغوية: يجرّب المتاح بالترتيب (Gemini ← OpenAI ← Workers AI المجاني بلا مفتاح)
// ويرجع JSON. إذا فشل واحد (حصة، ضغط، اسم موديل) ينتقل للتالي تلقائياً.
import { extractJson, toBase64 } from './util.js';

export class LLMError extends Error {}

async function gemini(env, model, { system, user, images, temperature }) {
  const parts = [
    ...images.map((img) => ({ inlineData: { mimeType: img.mime, data: toBase64(img.bytes) } })),
    { text: user },
  ];
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', temperature, maxOutputTokens: 8192 },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new LLMError(`gemini/${model} ${res.status}: ${data.error?.message || ''}`.slice(0, 300));
  const text = (data.candidates?.[0]?.content?.parts || [])
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('');
  if (!text) throw new LLMError(`gemini/${model}: رد فارغ (${data.candidates?.[0]?.finishReason || 'no candidates'})`);
  return text;
}

async function openai(env, { system, user, images }) {
  const content = [
    { type: 'text', text: user },
    ...images.map((img) => ({ type: 'image_url', image_url: { url: `data:${img.mime};base64,${toBase64(img.bytes)}` } })),
  ];
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || 'gpt-5-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new LLMError(`openai ${res.status}: ${data.error?.message || ''}`.slice(0, 300));
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new LLMError('openai: رد فارغ');
  return text;
}

async function workersAI(env, { system, user, temperature }) {
  const r = await env.AI.run(env.WORKERS_AI_TEXT_MODEL || '@cf/meta/llama-4-scout-17b-16e-instruct', {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: 4096,
    temperature,
  });
  const out = r?.response ?? r?.result?.response;
  if (out == null || out === '') throw new LLMError('workers-ai: رد فارغ');
  return out;
}

function providers(env) {
  const list = [];
  if (env.GEMINI_API_KEY) {
    for (const model of (env.GEMINI_MODELS || 'gemini-flash-latest').split(',').map((s) => s.trim()).filter(Boolean)) {
      list.push({ name: `gemini/${model}`, vision: true, run: (o) => gemini(env, model, o) });
    }
  }
  if (env.OPENAI_API_KEY) list.push({ name: 'openai', vision: true, run: (o) => openai(env, o) });
  if (env.AI) list.push({ name: 'workers-ai', vision: false, run: (o) => workersAI(env, o) });
  return list;
}

// يرجع { data, provider }.
export async function askJSON(env, { system, user, images = [], temperature = 0.7 }) {
  const errors = [];
  for (const p of providers(env)) {
    let prompt = user;
    if (images.length && !p.vision) prompt += '\n\n(ملاحظة: في صورة مرفقة ما بتقدر تشوفها — اعتمد على كلام المالك.)';
    try {
      const text = await p.run({ system, user: prompt, images: p.vision ? images : [], temperature });
      return { data: extractJson(text), provider: p.name };
    } catch (e) {
      errors.push(`${p.name}: ${e.message}`);
    }
  }
  throw new LLMError(errors.length ? errors.join(' | ') : 'ما في أي نموذج ذكاء اصطناعي متاح');
}

// صورة للمنشور من وصف إنكليزي (Workers AI، مجاني ضمن الحصة اليومية).
export async function generateImage(env, prompt) {
  if (!env.AI) throw new LLMError('توليد الصور غير متاح');
  const r = await env.AI.run(env.WORKERS_AI_IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell', {
    prompt: `${prompt}. Clean professional photo, no text, no letters, no watermark, no logos.`,
    steps: 6,
  });
  if (!r?.image) throw new LLMError('ما رجعت صورة من مولّد الصور');
  return r.image; // base64 JPEG
}
