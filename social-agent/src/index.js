// نقطة الدخول: يستقبل تلغرام ويخدم الصور العامة وصفحات Meta، ويحوّل كل الشغل للـ Agent.
import { Agent } from './agent.js';
import { privacyPage, dataDeletionPage } from './pages.js';
import { safeEqual, setupKey, webhookSecret } from './util.js';
import icon from './icon.jpg';

export { Agent };

function agent(env) {
  // "weur": أوروبا الغربية — قريب من تلغرام وMeta، وبعيد عن مناطق يحجبها مزوّدو الذكاء الاصطناعي.
  return env.AGENT.get(env.AGENT.idFromName('main'), { locationHint: 'weur' });
}

const html = (body) => new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });
const json = (obj, status = 200) => Response.json(obj, { status });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = url.origin;

    if (url.pathname === '/tg' && request.method === 'POST') {
      if (!env.TELEGRAM_BOT_TOKEN) return new Response('not configured', { status: 503 });
      const got = request.headers.get('x-telegram-bot-api-secret-token') || '';
      if (!safeEqual(got, await webhookSecret(env))) return new Response('forbidden', { status: 403 });
      const update = await request.json().catch(() => null);
      if (!update || typeof update.update_id !== 'number') return new Response('bad request', { status: 400 });
      await agent(env).enqueue('tg', update, `tg:${update.update_id}`, origin);
      return new Response('ok');
    }

    const media = url.pathname.match(/^\/m\/([a-f0-9]{32})\.(jpg|png|webp)$/);
    if (media && (request.method === 'GET' || request.method === 'HEAD')) {
      const m = await agent(env).getMedia(media[1]);
      if (!m) return new Response('not found', { status: 404 });
      return new Response(request.method === 'HEAD' ? null : m.data, {
        headers: { 'content-type': m.mime, 'cache-control': 'public, max-age=86400', 'content-length': String(m.data.byteLength) },
      });
    }

    // يستدعيه سكربت النشر مرة بعد كل نشر: يسجّل الـ webhook ويرجع رابط تفعيل المالك.
    if (url.pathname === '/setup' && request.method === 'POST') {
      if (!env.TELEGRAM_BOT_TOKEN) return json({ ok: false, error: 'TELEGRAM_BOT_TOKEN ناقص' }, 503);
      if (!safeEqual(request.headers.get('x-setup-key') || '', await setupKey(env))) return json({ ok: false }, 403);
      return json(await agent(env).setup(origin));
    }

    if (url.pathname === '/health') return json(await agent(env).health());
    if (url.pathname === '/privacy') return html(privacyPage());
    if (url.pathname === '/icon.jpg') return new Response(icon, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=86400' } });
    if (url.pathname === '/data-deletion') return html(dataDeletionPage());
    if (url.pathname === '/') return html('<!doctype html><meta charset="utf-8"><title>Feniq</title><p dir="rtl">أيجنت فينيق شغّال ✅</p>');
    return new Response('not found', { status: 404 });
  },

  async scheduled(controller, env) {
    await agent(env).tick();
  },
};
