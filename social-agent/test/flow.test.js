// سيناريو كامل من أول يوم: تفعيل المالك ← ربط الصفحة ← منشورات ← تعليقات ورسائل.
// الخطوات متسلسلة وتتشارك نفس قاعدة البيانات.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env, exports } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { claimCode, setupKey } from '../src/util.js';
import { JPEG, OWNER, STRANGER, World, photo, press, stub, text, tick } from './helpers.js';

const PAGE = '111';
const IG = '999';
const ORIGIN = 'https://agent.example.workers.dev';
const said = (user) => user.split('## رسالة المالك الآن')[1] || '';

let w;
beforeAll(() => {
  w = new World();
});
afterAll(() => w.restore());

const sql = (q, ...a) => runInDurableObject(stub(), (obj) => obj.all(q, ...a));

describe('public endpoints', () => {
  it('serves health, privacy and rejects forged webhooks', async () => {
    const h = await (await exports.default.fetch(`${ORIGIN}/health`)).json();
    expect(h.ok).toBe(true);
    const privacy = await (await exports.default.fetch(`${ORIGIN}/privacy`)).text();
    expect(privacy).toContain('سياسة الخصوصية');
    const icon = await exports.default.fetch(`${ORIGIN}/icon.jpg`);
    expect(icon.headers.get('content-type')).toBe('image/jpeg');
    expect((await icon.arrayBuffer()).byteLength).toBeGreaterThan(10000);
    const forged = await exports.default.fetch(`${ORIGIN}/tg`, { method: 'POST', body: '{"update_id":1}', headers: { 'x-telegram-bot-api-secret-token': 'nope' } });
    expect(forged.status).toBe(403);
  });

  it('setup registers the webhook and returns the owner claim link', async () => {
    const bad = await exports.default.fetch(`${ORIGIN}/setup`, { method: 'POST' });
    expect(bad.status).toBe(403);
    const res = await exports.default.fetch(`${ORIGIN}/setup`, { method: 'POST', headers: { 'x-setup-key': await setupKey(env) } });
    const out = await res.json();
    expect(out.ok).toBe(true);
    expect(out.claim_link).toBe(`https://t.me/feniq_test_bot?start=${await claimCode(env)}`);
    const hook = w.telegram('setWebhook')[0].body;
    expect(hook.url).toBe(`${ORIGIN}/tg`);
    expect(hook.secret_token).toHaveLength(48);
    expect(w.telegram('setMyCommands')).toHaveLength(1);
  });
});

describe('owner onboarding', () => {
  it('ignores strangers and wrong claim codes', async () => {
    w.reset();
    await text(STRANGER, '/start wrongcode');
    await text(STRANGER, 'مرحبا');
    expect(w.sentTexts().every((t) => t.includes('خاص بفريق فينيق'))).toBe(true);
    expect(await sql('SELECT * FROM users')).toHaveLength(0);
  });

  it('claims ownership with the link code, once', async () => {
    w.reset();
    await text(OWNER, `/start ${await claimCode(env)}`);
    expect(w.sentTexts()[0]).toContain('/connect');
    await text(STRANGER, `/start ${await claimCode(env)}`);
    const users = await sql('SELECT tg_id, role FROM users');
    expect(users).toEqual([{ tg_id: OWNER, role: 'owner' }]);
  });

  it('walks through connecting Facebook + Instagram', async () => {
    w.reset();
    await text(OWNER, '/connect');
    expect(w.sentTexts()[0]).toContain(`${ORIGIN}/privacy`);

    await text(OWNER, 'abc');
    expect(w.sentTexts().at(-1)).toContain('أرقام');
    await text(OWNER, '1234567890123456');
    await text(OWNER, 'f'.repeat(32));
    expect(w.telegram('deleteMessage')).toHaveLength(1); // السر ما بيضل بالمحادثة
    expect(w.sentTexts().at(-1)).toContain('developers.facebook.com/tools/explorer');

    w.on('GET', 'oauth/access_token', ({ query }) => {
      expect(query).toMatchObject({ client_id: '1234567890123456', client_secret: 'f'.repeat(32), fb_exchange_token: 'EAA' + 'x'.repeat(40) });
      return { access_token: 'LONG_USER_TOKEN' };
    })
      .on('GET', 'me/permissions', () => ({
        data: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'pages_read_user_content', 'pages_manage_engagement', 'instagram_basic', 'instagram_content_publish', 'instagram_manage_comments'].map((permission) => ({ permission, status: 'granted' })),
      }))
      .on('GET', 'me/accounts', () => ({
        data: [{ id: PAGE, name: 'فينيق', access_token: 'PAGE_TOKEN', instagram_business_account: { id: IG, username: 'feniq.sy' } }],
      }));

    await text(OWNER, 'EAA' + 'x'.repeat(40));
    expect(w.telegram('deleteMessage')).toHaveLength(2); // التوكن انمسح كمان
    const done = w.sentTexts().at(-1);
    expect(done).toContain('تم الربط');
    expect(done).toContain('@feniq.sy');
    expect(done).toContain('pages_messaging'); // ناقصة، بس الباقي شغال
    const acc = await sql('SELECT page_id, page_token, ig_id, ig_username, enabled FROM accounts');
    expect(acc).toEqual([{ page_id: PAGE, page_token: 'PAGE_TOKEN', ig_id: IG, ig_username: 'feniq.sy', enabled: 1 }]);
  });
});

describe('posts', () => {
  it('drafts a Facebook post from a chat message and publishes it on approval', async () => {
    w.reset();
    w.onLLM((system, user) => {
      if (!system.includes('أيجنت فينيق') || !said(user).includes('بوست ترحيبي')) return;
      expect(user).toContain('فيسبوك «فينيق»');
      return {
        reply: 'تكرم، هي المسودة 👇',
        action: { type: 'draft_post', text: 'أهلاً بكم في فينيق 🧡 نزّلوا التطبيق من الموقع.', targets: ['fb'], when: 'now', image: 'none' },
      };
    });
    await text(OWNER, 'اعمل بوست ترحيبي عالفيس بس');
    const preview = w.sentTexts().at(-1);
    expect(preview).toContain('مسودة #1');
    expect(preview).toContain('أهلاً بكم في فينيق');
    expect(w.lastButtons().map((b) => b.callback_data)).toContain('pp:1');
    expect(w.graph('POST', `${PAGE}/feed`)).toHaveLength(0); // ما بينزل بلا موافقة

    w.on('POST', `${PAGE}/feed`, ({ body }) => {
      expect(body).toMatchObject({ message: 'أهلاً بكم في فينيق 🧡 نزّلوا التطبيق من الموقع.', access_token: 'PAGE_TOKEN' });
      return { id: `${PAGE}_555` };
    });
    await press(OWNER, 'pp:1');
    expect(w.graph('POST', `${PAGE}/feed`)).toHaveLength(1);
    expect(w.sentTexts().at(-1)).toContain(`https://www.facebook.com/${PAGE}_555`);
    const [p] = await sql('SELECT status, fb_id FROM posts WHERE id=1');
    expect(p).toEqual({ status: 'published', fb_id: `${PAGE}_555` });

    await press(OWNER, 'pp:1'); // ضغطة مكررة ما بتنشر مرتين
    expect(w.graph('POST', `${PAGE}/feed`)).toHaveLength(1);
  });

  it('turns an owner photo into a post for Facebook and Instagram', async () => {
    w.reset();
    w.onLLM((system, user) => {
      if (!system.includes('أيجنت فينيق') || !said(user).includes('اعمل منها بوست')) return;
      return { reply: 'حلوة الصورة!', action: { type: 'draft_post', text: 'فريق فينيق بزيارة لمستودعات اللاذقية 💼\n#فينيق #Feniq', targets: ['fb', 'ig'], when: 'now', image: 'attached' } };
    });
    await photo(OWNER, 'اعمل منها بوست');
    const llmCall = w.calls.find((c) => said(c.llm?.user || '').includes('اعمل منها بوست'));
    expect(llmCall.llm.images).toBe(1); // النموذج شاف الصورة
    expect(w.telegram('sendPhoto')).toHaveLength(1); // المعاينة مع الصورة

    let imageUrl;
    w.on('POST', `${PAGE}/photos`, ({ body }) => {
      imageUrl = body.url;
      return { id: 'photo1', post_id: `${PAGE}_777` };
    })
      .on('POST', `${IG}/media`, ({ body }) => {
        expect(body.image_url).toBe(imageUrl);
        expect(body.caption).toContain('#فينيق');
        return { id: 'container1' };
      })
      .on('GET', 'container1', () => ({ status_code: 'FINISHED' }))
      .on('POST', `${IG}/media_publish`, ({ body }) => {
        expect(body.creation_id).toBe('container1');
        return { id: 'igmedia1' };
      })
      .on('GET', 'igmedia1', () => ({ permalink: 'https://www.instagram.com/p/abc/' }));

    await press(OWNER, 'pp:2');
    expect(imageUrl).toMatch(new RegExp(`^${ORIGIN}/m/[a-f0-9]{32}\\.jpg$`));
    expect(w.sentTexts().at(-1)).toContain('https://www.instagram.com/p/abc/');
    const [p] = await sql('SELECT status, fb_id, ig_id FROM posts WHERE id=2');
    expect(p).toEqual({ status: 'published', fb_id: `${PAGE}_777`, ig_id: 'igmedia1' });

    // انستغرام وفيسبوك بيحمّلوا الصورة من رابط الأيجنت
    const img = await exports.default.fetch(imageUrl);
    expect(img.headers.get('content-type')).toBe('image/jpeg');
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(JPEG);
  });

  it('keeps Instagram out when no image can be made, and says so', async () => {
    w.reset();
    w.onLLM((system, user) => {
      if (!system.includes('أيجنت فينيق') || !said(user).includes('بوست بلا صورة')) return;
      return { reply: 'تمام', action: { type: 'draft_post', text: 'نص فقط', targets: ['fb', 'ig'], when: 'now', image: 'generate', image_prompt: 'pharmacy' } };
    });
    await text(OWNER, 'بوست بلا صورة');
    const preview = w.sentTexts().at(-1);
    expect(preview).toContain('مسودة #3</b> — فيسبوك\n');
    expect(preview).toContain('انستغرام بدو صورة');
    const [p] = await sql('SELECT targets FROM posts WHERE id=3');
    expect(JSON.parse(p.targets)).toEqual(['fb']);
    await press(OWNER, 'px:3');
    expect((await sql('SELECT status FROM posts WHERE id=3'))[0].status).toBe('cancelled');
  });

  it('schedules a post and publishes it when its time comes', async () => {
    w.reset();
    w.onLLM((system, user) => {
      if (!system.includes('أيجنت فينيق') || !said(user).includes('بكرا المسا')) return;
      return { reply: 'جاهز', action: { type: 'draft_post', text: 'منشور مجدول', targets: ['fb'], when: '2099-01-01 19:00', image: 'none' } };
    });
    await text(OWNER, 'بوست بكرا المسا');
    expect(w.lastButtons().map((b) => b.callback_data)).toEqual(expect.arrayContaining(['pa:4', 'pp:4']));
    await press(OWNER, 'pa:4');
    expect(w.sentTexts().at(-1)).toContain('مجدول');
    expect((await sql('SELECT status FROM posts WHERE id=4'))[0].status).toBe('scheduled');

    w.on('GET', `${PAGE}/posts`, () => ({ data: [] })).on('GET', `${IG}/media`, () => ({ data: [] })).on('GET', `${PAGE}/conversations`, () => ({ data: [] }));
    await tick();
    expect(w.graph('POST', `${PAGE}/feed`)).toHaveLength(0); // لسا ما إجا وقته

    await sql('UPDATE posts SET scheduled_at=? WHERE id=4', Date.now() - 1000);
    w.on('POST', `${PAGE}/feed`, () => ({ id: `${PAGE}_888` }));
    await sql('DELETE FROM jobs'); // tick جديد بنفس الخمس دقايق
    await tick();
    expect(w.graph('POST', `${PAGE}/feed`)).toHaveLength(1);
    expect((await sql('SELECT status FROM posts WHERE id=4'))[0].status).toBe('published');
  });

  it('revises the latest draft from a follow-up message', async () => {
    w.reset();
    w.onLLM((system, user) => {
      if (!system.includes('أيجنت فينيق')) return;
      if (said(user).includes('عن المرتجعات')) return { reply: 'هي', action: { type: 'draft_post', text: 'نص طويل عن المرتجعات', targets: ['fb'], when: 'now', image: 'none' } };
      if (said(user).includes('قصّره')) {
        expect(user).toContain('#5');
        return { reply: 'قصّرته', action: { type: 'revise_post', post_id: 5, text: 'المرتجعات صارت أسهل ✅' } };
      }
    });
    await text(OWNER, 'اعمل بوست عن المرتجعات');
    await text(OWNER, 'قصّره');
    expect(w.sentTexts().at(-1)).toContain('المرتجعات صارت أسهل');
    expect((await sql('SELECT text, status FROM posts WHERE id=5'))[0]).toEqual({ text: 'المرتجعات صارت أسهل ✅', status: 'draft' });
    await press(OWNER, 'px:5');
  });
});

describe('comments and messages', () => {
  const now = () => new Date().toISOString();

  it('drafts replies for new comments and waits for approval (review mode)', async () => {
    w.reset();
    await sql('DELETE FROM jobs');
    const old = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
    w.on('GET', `${PAGE}/posts`, () => ({
      data: [{
        id: `${PAGE}_555`, message: 'أهلاً بكم في فينيق',
        comments: { data: [
          { id: 'c1', message: 'كيف بنزل التطبيق؟ عندي صيدلية بجبلة', created_time: now(), from: { id: 'u1', name: 'أبو خالد' } },
          { id: 'c0', message: 'تعليق قديم', created_time: old, from: { id: 'u0', name: 'قديم' } },
          { id: 'c9', message: 'أهلا فيك', created_time: now(), from: { id: PAGE, name: 'فينيق' } },
        ] },
      }],
    }));
    w.on('GET', `${IG}/media`, () => ({ data: [] })).on('GET', `${PAGE}/conversations`, () => ({ data: [] }));
    w.onLLM((system, user) => {
      if (!system.includes('مسؤول خدمة العملاء')) return;
      expect(user).toContain('كيف بنزل التطبيق');
      expect(user).not.toContain('تعليق قديم'); // أقدم من يوم الربط
      expect(user).not.toContain('أهلا فيك'); // تعليق الصفحة نفسها
      const ref = JSON.parse(user.slice(user.indexOf('['))).find((i) => i.text.includes('كيف بنزل')).ref;
      return { results: [{ ref, category: 'question', needs_owner: false, hide: false, confidence: 0.95, summary: 'تنزيل', reply: 'أهلين أبو خالد! التطبيق بينزل مباشرة من الموقع 🙏' }] };
    });
    await tick();
    const card = w.sentTexts().at(-1);
    expect(card).toContain('أبو خالد');
    expect(card).toContain('التطبيق بينزل مباشرة');
    expect(w.graph('POST', /\/comments$/)).toHaveLength(0);

    const [row] = await sql("SELECT n FROM inbox WHERE ext_id='fb:c1'");
    w.on('POST', 'c1/comments', ({ body }) => {
      expect(body.message).toContain('التطبيق بينزل');
      return { id: 'r1' };
    });
    await press(OWNER, `cs:${row.n}`);
    expect(w.graph('POST', 'c1/comments')).toHaveLength(1);
    expect((await sql("SELECT status, reply_id FROM inbox WHERE ext_id='fb:c1'"))[0]).toEqual({ status: 'replied', reply_id: 'r1' });

    // الفحص الجاي ما بيعيد نفس التعليق
    await sql('DELETE FROM jobs');
    await tick();
    expect(w.graph('POST', 'c1/comments')).toHaveLength(1);
  });

  it('lets the owner rewrite a suggested reply in plain words', async () => {
    w.reset();
    await sql('DELETE FROM jobs');
    w.on('GET', `${PAGE}/posts`, () => ({ data: [{ id: `${PAGE}_555`, message: 'x', comments: { data: [{ id: 'c2', message: 'قديش العمولة؟', created_time: now(), from: { id: 'u2', name: 'مستودع النور' } }] } }] }));
    w.onLLM((system, user) => {
      if (system.includes('مسؤول خدمة العملاء')) {
        const ref = JSON.parse(user.slice(user.indexOf('[')))[0].ref;
        return { results: [{ ref, category: 'lead', needs_owner: true, hide: false, confidence: 0.6, summary: 'عمولة', reply: 'منحكي بالتفاصيل باتصال 🙏' }] };
      }
      if (system.includes('أيجنت فينيق') && said(user).includes('خليه يتصل')) {
        expect(user).toContain('عم يعدّل الرد');
        const ref = user.match(/ref "(c:\d+)"/)[1];
        return { reply: 'عدّلته', action: { type: 'revise_reply', ref, text: 'أهلين! اتصلوا على 0982-001415 ومنزوركم 🙏' } };
      }
    });
    await tick();
    const [row] = await sql("SELECT n FROM inbox WHERE ext_id='fb:c2'");
    await press(OWNER, `ce:${row.n}`);
    await text(OWNER, 'خليه يتصل عالرقم');
    expect(w.sentTexts().at(-1)).toContain('0982-001415');
    w.on('POST', 'c2/comments', () => ({ id: 'r2' }));
    await press(OWNER, `cs:${row.n}`);
    expect(w.graph('POST', 'c2/comments')[0].body.message).toBe('أهلين! اتصلوا على 0982-001415 ومنزوركم 🙏');
  });

  it('auto mode: answers easy comments, hides spam, escalates complaints', async () => {
    w.reset();
    await sql('DELETE FROM jobs');
    await press(OWNER, 'mode:auto');
    w.on('GET', `${PAGE}/posts`, () => ({ data: [] }));
    w.on('GET', `${IG}/media`, () => ({
      data: [{
        id: 'm1', caption: 'فريق فينيق',
        comments: { data: [
          { id: 'i1', text: 'رووعة 😍', timestamp: now(), username: 'pharma_lina', replies: { data: [{ id: 'i1r', text: 'شكراً لينا', timestamp: now(), username: 'feniq.sy' }] } },
          { id: 'i2', text: 'اربح 1000$ باليوم ادخل عالرابط', timestamp: now(), username: 'spam_bot' },
          { id: 'i3', text: 'الطلبية وصلت ناقصة!!', timestamp: now(), username: 'sam_pharmacy' },
        ] },
      }],
    }));
    w.onLLM((system, user) => {
      if (!system.includes('مسؤول خدمة العملاء')) return;
      const items = JSON.parse(user.slice(user.indexOf('[')));
      expect(items.map((i) => i.author)).toEqual(['pharma_lina', 'spam_bot', 'sam_pharmacy']); // ردنا نحنا مو ضمنهم
      const [a, b, c] = items.map((i) => i.ref);
      return { results: [
        { ref: a, category: 'praise', needs_owner: false, hide: false, confidence: 0.9, reply: 'تسلمي لينا 🧡' },
        { ref: b, category: 'spam', needs_owner: false, hide: true, confidence: 0.99, reply: '' },
        { ref: c, category: 'complaint', needs_owner: true, hide: false, confidence: 0.5, reply: 'نعتذر منك، رح نتواصل معك فوراً 🙏' },
      ] };
    });
    w.on('POST', 'i1/replies', () => ({ id: 'ir1' })).on('POST', 'i2', ({ body }) => {
      expect(body.hide).toBe('true');
      return { success: true };
    });
    await tick();
    expect(w.graph('POST', 'i1/replies')).toHaveLength(1);
    expect(w.graph('POST', 'i2')).toHaveLength(1);
    expect(w.graph('POST', 'i3/replies')).toHaveLength(0);
    const texts = w.sentTexts();
    expect(texts.some((t) => t.includes('تصرّفت لحالي (2)'))).toBe(true);
    expect(texts.some((t) => t.includes('sam_pharmacy') && t.includes('شكوى'))).toBe(true);
    await press(OWNER, 'mode:review');
  });

  it('falls back to a copy-ready card when Meta blocks sending DMs', async () => {
    w.reset();
    await sql('DELETE FROM jobs');
    await press(OWNER, 'mode:auto');
    w.on('GET', `${PAGE}/posts`, () => ({ data: [] })).on('GET', `${IG}/media`, () => ({ data: [] }));
    w.on('GET', `${PAGE}/conversations`, ({ query }) => ({
      data: query.platform === 'messenger'
        ? [{ id: 't1', messages: { data: [
            { id: 'mid2', message: 'بدي أعرف كيف بسجّل', from: { id: 'psid1', name: 'رنا' }, created_time: now() },
            { id: 'mid1', message: 'مرحبا', from: { id: 'psid1', name: 'رنا' }, created_time: now() },
          ] } }]
        : [],
    }));
    w.onLLM((system, user) => {
      if (!system.includes('مسؤول خدمة العملاء')) return;
      const [item] = JSON.parse(user.slice(user.indexOf('[')));
      expect(item.text).toBe('مرحبا\nبدي أعرف كيف بسجّل');
      return { results: [{ ref: item.ref, category: 'question', needs_owner: false, hide: false, confidence: 0.9, reply: 'أهلين رنا! بتنزلي التطبيق وبتسجلي برقمك 🙏' }] };
    });
    w.on('POST', `${PAGE}/messages`, () => Response.json({ error: { code: 10, message: 'Application does not have permission for this action' } }, { status: 400 }));
    await tick();
    expect(w.graph('POST', `${PAGE}/messages`)).toHaveLength(1);
    const card = w.sentTexts().at(-1);
    expect(card).toContain('رنا');
    expect(card).toContain('<code>أهلين رنا!');
    expect(card).toContain('Meta Business Suite');
    expect((await sql('SELECT dm_send FROM accounts'))[0].dm_send).toBe(0);
    await press(OWNER, 'mode:review');
  });
});

describe('team and notes', () => {
  it('remembers owner notes and forwards them to every prompt', async () => {
    w.reset();
    w.onLLM((system, user) => {
      if (!system.includes('أيجنت فينيق') || !said(user).includes('تذكّر')) return;
      return { reply: 'أكيد', action: { type: 'add_note', text: 'عنا عرض توصيل مجاني لأول طلبية' } };
    });
    await text(OWNER, 'تذكّر إنه عنا عرض توصيل مجاني لأول طلبية');
    expect(w.sentTexts().at(-1)).toContain('حفظتها');
    let seen;
    w.onLLM((system, user) => {
      if (!system.includes('أيجنت فينيق') || !said(user).includes('شو بتعرف')) return;
      seen = system;
      return { reply: 'بعرف', action: null };
    });
    await text(OWNER, 'شو بتعرف عن العروض؟');
    expect(seen).toContain('عنا عرض توصيل مجاني لأول طلبية');
    expect(seen).toContain('لا تذكر أبداً العمولة');
  });

  it('invites a team member with a one-time link', async () => {
    w.reset();
    await text(OWNER, '/invite');
    const code = w.sentTexts().at(-1).match(/start=([a-f0-9]+)/)[1];
    await text(STRANGER, `/start ${code}`);
    expect((await sql('SELECT role FROM users WHERE tg_id=?', STRANGER))[0].role).toBe('editor');
    await text(3003, `/start ${code}`);
    expect(await sql('SELECT * FROM users WHERE tg_id=3003')).toHaveLength(0);
    await text(STRANGER, '/connect');
    expect(w.sentTexts().at(-1)).toContain('المالك بس');
  });

  it('shows status', async () => {
    w.reset();
    await text(OWNER, '/status');
    const s = w.sentTexts().at(-1);
    expect(s).toContain('الأيجنت شغّال');
    expect(s).toContain('@feniq.sy');
    expect(s).toContain('Gemini');
  });
});

describe('weekly work', () => {
  it('proposes a weekly plan and schedules it all with one tap', async () => {
    w.reset();
    await sql("UPDATE posts SET status='cancelled' WHERE status IN ('draft','scheduled')");
    w.onLLM((system) => {
      if (!system.includes('مخطط محتوى')) return;
      return { posts: [
        { when: '2099-01-05 11:00', topic: 'البحث', text: 'دوّر على أي صنف بثواني 🔎', targets: ['fb', 'ig'], image_prompt: 'pharmacist with phone' },
        { when: '2099-01-07 19:00', topic: 'المستودع', text: 'قناة بيع إضافية لمستودعك 📦', targets: ['fb', 'ig'], image_prompt: 'warehouse' },
        { when: '2000-01-01 10:00', topic: 'قديم', text: 'بالماضي', targets: ['fb'] },
      ] };
    });
    await text(OWNER, '/plan');
    const summary = w.sentTexts().find((t) => t.includes('اقتراح خطة الأسبوع'));
    expect(summary).toContain('(2 منشورات)'); // الموعد الماضي انشال
    const batch = w.calls.find((c) => c.body?.reply_markup?.inline_keyboard?.flat().some((b) => b.callback_data?.startsWith('pl:')))
      .body.reply_markup.inline_keyboard.flat().find((b) => b.callback_data.startsWith('pl:')).callback_data;
    // ما في مولّد صور بالاختبار، فبيطلعوا للفيسبوك بس مع تنبيه
    const drafts = await sql("SELECT id, status, targets FROM posts WHERE source LIKE 'plan:%'");
    expect(drafts.map((d) => [d.status, JSON.parse(d.targets)])).toEqual([['draft', ['fb']], ['draft', ['fb']]]);
    await press(OWNER, batch);
    expect((await sql("SELECT status FROM posts WHERE source LIKE 'plan:%'")).map((r) => r.status)).toEqual(['scheduled', 'scheduled']);
  });

  it('writes a report from real numbers', async () => {
    w.reset();
    w.on('GET', PAGE, () => ({ name: 'فينيق', followers_count: 120 }))
      .on('GET', `${PAGE}/posts`, () => ({ data: [{ id: 'p', message: 'أهلاً', created_time: new Date().toISOString(), reactions: { summary: { total_count: 14 } }, comments: { summary: { total_count: 3 } } }] }))
      .on('GET', IG, () => ({ username: 'feniq.sy', followers_count: 80, media_count: 4 }))
      .on('GET', `${IG}/media`, () => ({ data: [{ id: 'm', caption: 'x', timestamp: new Date().toISOString(), like_count: 20, comments_count: 2 }] }));
    let stats;
    w.onLLM((system, user) => {
      if (!system.includes('محلل صفحات')) return;
      stats = JSON.parse(user);
      return { text: 'أسبوع منيح: 14 تفاعل عالفيس و20 لايك عالانستا.' };
    });
    await text(OWNER, '/report');
    expect(stats.فيسبوك.المتابعين).toBe(120);
    expect(stats.انستغرام.المنشورات[0].لايكات).toBe(20);
    expect(w.sentTexts().at(-1)).toContain('تقرير الأسبوع');
  });
});
