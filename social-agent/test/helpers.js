// محاكاة كل الخدمات الخارجية (تلغرام، Meta، Gemini) داخل الاختبارات.
import { vi } from 'vitest';
import { env, exports } from 'cloudflare:workers';
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { webhookSecret } from '../src/util.js';
import worker from '../src/index.js';

export const OWNER = 1001;
export const STRANGER = 2002;
export const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]);

export function stub() {
  return env.AGENT.get(env.AGENT.idFromName('main'));
}

async function readBody(init) {
  const b = init?.body;
  if (b == null) return null;
  if (typeof b === 'string') {
    try {
      return JSON.parse(b);
    } catch {
      return b;
    }
  }
  if (b instanceof URLSearchParams) return Object.fromEntries(b);
  if (b instanceof FormData) {
    const o = {};
    for (const [k, v] of b) o[k] = typeof v === 'string' ? v : '[file]';
    return o;
  }
  return String(b);
}

export class World {
  constructor() {
    this.calls = [];
    this.msgId = 100;
    this.routes = [];
    this.llm = []; // [(system, user) => object | undefined]
    this.spy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => this.handle(input, init));
  }

  restore() {
    this.spy.mockRestore();
  }

  on(method, pattern, fn) {
    this.routes.unshift({ method, pattern, fn });
    return this;
  }

  // أول دالة ترجع قيمة (غير undefined) لطلب ذكاء اصطناعي هي الرد.
  onLLM(fn) {
    this.llm.unshift(fn);
    return this;
  }

  async handle(input, init) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method || (typeof input === 'object' && input.method) || 'GET';
    const body = await readBody(init);
    const call = { url, method, body };
    this.calls.push(call);

    if (url.startsWith('https://generativelanguage.googleapis.com/')) {
      const system = body.systemInstruction.parts[0].text;
      const user = body.contents[0].parts.map((p) => p.text || '[image]').join('\n');
      call.llm = { system, user, images: body.contents[0].parts.filter((p) => p.inlineData).length };
      for (const fn of this.llm) {
        const out = fn(system, user);
        if (out !== undefined) return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] });
      }
      return Response.json({ error: { message: 'no LLM mock' } }, { status: 500 });
    }

    if (url.startsWith('https://api.telegram.org/file/')) return new Response(JPEG);
    const tg = url.match(/^https:\/\/api\.telegram\.org\/bot[^/]+\/(\w+)$/);
    if (tg) {
      call.tg = tg[1];
      for (const r of this.routes) if (r.method === 'TG' && r.pattern === tg[1]) return Response.json({ ok: true, result: await r.fn(body) });
      if (tg[1] === 'getMe') return Response.json({ ok: true, result: { id: 1, username: 'feniq_test_bot' } });
      if (tg[1] === 'getFile') return Response.json({ ok: true, result: { file_path: 'photos/1.jpg' } });
      return Response.json({ ok: true, result: { message_id: ++this.msgId } });
    }

    if (url.startsWith('https://graph.facebook.com/')) {
      const u = new URL(url);
      const path = u.pathname.replace(/^\/v[\d.]+\//, '');
      call.graph = { path, query: Object.fromEntries(u.searchParams) };
      for (const r of this.routes) {
        if (r.method !== method) continue;
        const m = typeof r.pattern === 'string' ? (r.pattern === path ? [path] : null) : path.match(r.pattern);
        if (m) {
          const out = await r.fn({ path, query: call.graph.query, body, m });
          if (out instanceof Response) return out;
          return Response.json(out);
        }
      }
      return Response.json({ error: { message: `unmocked graph ${method} ${path}`, code: 100 } }, { status: 400 });
    }
    throw new Error(`unmocked fetch ${method} ${url}`);
  }

  telegram(method) {
    return this.calls.filter((c) => c.tg === method);
  }
  sentTexts() {
    return this.calls.filter((c) => c.tg === 'sendMessage' || c.tg === 'sendPhoto').map((c) => c.body.text || c.body.caption || '');
  }
  graph(method, path) {
    return this.calls.filter((c) => c.graph && c.method === method && (typeof path === 'string' ? c.graph.path === path : path.test(c.graph.path)));
  }
  lastButtons() {
    const c = [...this.calls].reverse().find((x) => (x.tg === 'sendMessage' || x.tg === 'sendPhoto') && x.body.reply_markup);
    const rm = typeof c.body.reply_markup === 'string' ? JSON.parse(c.body.reply_markup) : c.body.reply_markup;
    return rm.inline_keyboard.flat();
  }
  reset() {
    this.calls = [];
  }
}

let updateId = 1;

export async function sendUpdate(update, origin = 'https://agent.example.workers.dev') {
  const res = await exports.default.fetch(`${origin}/tg`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': await webhookSecret(env) },
    body: JSON.stringify({ update_id: updateId++, ...update }),
  });
  if (res.status !== 200) throw new Error(`webhook ${res.status}`);
  await drain();
}

// ينتظر حتى يخلص الـ Agent كل المهام (الـ alarm ممكن يشتغل لحاله بالخلفية).
export async function drain() {
  for (let i = 0; i < 400; i++) {
    await runDurableObjectAlarm(stub());
    const idle = await runInDurableObject(stub(), async (obj, state) => {
      const pending = obj.one('SELECT COUNT(*) AS c FROM jobs WHERE done=0').c;
      return !obj.running && pending === 0;
    });
    if (idle) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('agent did not become idle');
}

export function text(from, t, extra = {}) {
  return sendUpdate({
    message: { message_id: updateId + 500, from: { id: from, first_name: 'عمار' }, chat: { id: from, type: 'private' }, date: 0, text: t, ...extra },
  });
}

export function photo(from, caption) {
  return sendUpdate({
    message: {
      message_id: updateId + 500, from: { id: from, first_name: 'عمار' }, chat: { id: from, type: 'private' }, date: 0,
      caption, photo: [{ file_id: 'small', width: 90, height: 90 }, { file_id: 'big', width: 1080, height: 1080 }],
    },
  });
}

export function press(from, data) {
  return sendUpdate({
    callback_query: { id: `cb${updateId}`, from: { id: from }, data, message: { message_id: 55, chat: { id: from, type: 'private' } } },
  });
}

export async function tick() {
  await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *', noRetry() {} }, env, { waitUntil() {}, passThroughOnException() {} });
  await drain();
}
