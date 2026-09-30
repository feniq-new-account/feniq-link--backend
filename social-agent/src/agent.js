// الـ Agent: كائن واحد (Durable Object) فيه كل الحالة بقاعدة SQLite، وكل الشغل يمر عبر
// طابور مهام يُعالَج بالـ alarm (حتى نرد على تلغرام فوراً ونشتغل على مهل بعدها).
import { DurableObject } from 'cloudflare:workers';
import { Telegram } from './telegram.js';
import { Graph, PERMISSIONS, REQUIRED, explainMetaError, isAccessError } from './meta.js';
import { ownerTurn, triageInbound, weeklyPlan, writeReport } from './brain.js';
import { generateImage } from './llm.js';
import { claimCode, escapeHtml, fromBase64, randomId, truncate, webhookSecret } from './util.js';
import { humanTime, localDayIndex, localHour, localStamp, parseLocal, weekKey } from './time.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS users (tg_id INTEGER PRIMARY KEY, name TEXT, role TEXT, added_at INTEGER);
CREATE TABLE IF NOT EXISTS accounts (page_id TEXT PRIMARY KEY, name TEXT, page_token TEXT, ig_id TEXT, ig_username TEXT,
  enabled INTEGER DEFAULT 1, dm_send INTEGER DEFAULT 1, added_at INTEGER);
CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, mime TEXT, data BLOB, width INTEGER, height INTEGER, created_at INTEGER);
CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT, text TEXT, targets TEXT, media_id TEXT,
  image_prompt TEXT, scheduled_at INTEGER, created_at INTEGER, published_at INTEGER, fb_id TEXT, ig_id TEXT, links TEXT,
  error TEXT, source TEXT);
CREATE TABLE IF NOT EXISTS inbox (n INTEGER PRIMARY KEY AUTOINCREMENT, ext_id TEXT UNIQUE, kind TEXT, platform TEXT,
  page_id TEXT, thread_id TEXT, author TEXT, author_id TEXT, text TEXT, context TEXT, created_at INTEGER, status TEXT,
  category TEXT, reply TEXT, reply_id TEXT, handled_at INTEGER);
CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, payload TEXT, dedupe TEXT UNIQUE,
  created_at INTEGER, done INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS chat (id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT, text TEXT, created_at INTEGER);
CREATE INDEX IF NOT EXISTS jobs_pending ON jobs (done, id);
CREATE INDEX IF NOT EXISTS inbox_status ON inbox (status);
CREATE INDEX IF NOT EXISTS posts_status ON posts (status, scheduled_at)`;

const TICK_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_JOBS_PER_ALARM = 6;
const TRIAGE_BATCH = 15;

const COMMANDS = [
  ['connect', 'ربط صفحة فيسبوك وانستغرام'],
  ['queue', 'المسودات والمنشورات المجدولة'],
  ['plan', 'اقترح خطة منشورات للأسبوع'],
  ['inbox', 'التعليقات والرسائل اللي بانتظارك'],
  ['report', 'تقرير أداء الصفحات'],
  ['mode', 'الردود: تلقائي أو مراجعة'],
  ['brief', 'ملاحظاتك اللي بيتذكرها الأيجنت'],
  ['status', 'حالة الأيجنت'],
  ['invite', 'إضافة شخص من الفريق'],
  ['help', 'شو بيقدر يعمل الأيجنت'],
].map(([command, description]) => ({ command, description }));

const HELP = `🤖 <b>أيجنت فينيق</b> — احكي معه عادي بالعربي:
• «اعمل بوست عن ميزة المرتجعات وانشره بكرا الساعة 7 المسا»
• ابعت صورة وقلّه «اعمل منها بوست للانستا»
• «قصّره شوي وزيد إيموجي» ← بيعدّل آخر مسودة
• «تذكّر إنه عنا عرض جديد هالشهر...» ← بيحفظها وبيستعملها بالمنشورات والردود
• «شو في تعليقات؟» أو /inbox

✅ ولا منشور بينزل قبل ما توافق عليه.
💬 التعليقات والرسائل: بوضع «مراجعة» كل رد بينتظر موافقتك، وبوضع «تلقائي» بيرد لحاله عالأسئلة السهلة وبيبعتلك الحساس (/mode).
🗓 كل أحد مسا بيقترح خطة الأسبوع، وكل خميس مسا بيبعت تقرير.`;

const PLATFORM = { fb: 'فيسبوك', ig: 'انستغرام' };
const CATEGORY = {
  question: 'سؤال', lead: 'زبون مهتم', complaint: 'شكوى', praise: 'مديح', spam: 'سبام',
  offensive: 'إساءة', no_reply: 'ما بدو رد', other: 'غير ذلك',
};
const AUTO_OK = new Set(['praise', 'question', 'other']);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normTargets(t) {
  const list = (Array.isArray(t) ? t : ['fb', 'ig']).map((x) => String(x).toLowerCase())
    .map((x) => (x.startsWith('face') ? 'fb' : x.startsWith('insta') ? 'ig' : x))
    .filter((x) => x === 'fb' || x === 'ig');
  return list.length ? [...new Set(list)] : ['fb', 'ig'];
}

const targetsLabel = (t) => t.map((x) => PLATFORM[x]).join(' + ');

export class Agent extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    for (const stmt of SCHEMA.split(';')) if (stmt.trim()) this.sql.exec(stmt);
    this.tg = new Telegram(env.TELEGRAM_BOT_TOKEN);
    this.graph = new Graph(env.GRAPH_VERSION || 'v25.0');
  }

  // ---------- تخزين ----------
  all(q, ...a) {
    return this.sql.exec(q, ...a).toArray();
  }
  one(q, ...a) {
    return this.all(q, ...a)[0] ?? null;
  }
  run(q, ...a) {
    this.sql.exec(q, ...a);
  }
  kvGet(key, def = null) {
    const r = this.one('SELECT value FROM kv WHERE key=?', key);
    return r ? JSON.parse(r.value) : def;
  }
  kvSet(key, value) {
    if (value == null) this.run('DELETE FROM kv WHERE key=?', key);
    else this.run('INSERT INTO kv (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, JSON.stringify(value));
  }
  user(id) {
    return this.one('SELECT * FROM users WHERE tg_id=?', id);
  }
  users() {
    return this.all('SELECT * FROM users');
  }
  accounts() {
    return this.all('SELECT * FROM accounts WHERE enabled=1 ORDER BY added_at');
  }
  account(pageId) {
    return this.one('SELECT * FROM accounts WHERE page_id=?', pageId);
  }
  post(id) {
    return this.one('SELECT * FROM posts WHERE id=?', Number(id));
  }
  notes() {
    return this.kvGet('notes', []);
  }
  origin() {
    return this.kvGet('origin');
  }
  saveMedia(bytes, mime, width = null, height = null) {
    const id = randomId(16);
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    this.run('INSERT INTO media (id,mime,data,width,height,created_at) VALUES (?,?,?,?,?,?)', id, mime, buf, width, height, Date.now());
    return id;
  }
  media(id) {
    return id ? this.one('SELECT * FROM media WHERE id=?', id) : null;
  }
  mediaUrl(id) {
    const m = this.one('SELECT mime FROM media WHERE id=?', id);
    const ext = m?.mime === 'image/png' ? 'png' : m?.mime === 'image/webp' ? 'webp' : 'jpg';
    return this.origin() && m ? `${this.origin()}/m/${id}.${ext}` : null;
  }
  addChat(role, text) {
    this.run('INSERT INTO chat (role,text,created_at) VALUES (?,?,?)', role, truncate(text, 1500), Date.now());
  }

  // ---------- واجهة يستدعيها index.js ----------
  async enqueue(kind, payload, dedupe = null, origin = null) {
    if (origin && origin.startsWith('https://') && origin !== this.origin()) this.kvSet('origin', origin);
    this.run('INSERT OR IGNORE INTO jobs (kind,payload,dedupe,created_at) VALUES (?,?,?,?)', kind, JSON.stringify(payload ?? {}), dedupe, Date.now());
    const cur = await this.ctx.storage.getAlarm();
    if (cur == null || cur > Date.now()) await this.ctx.storage.setAlarm(Date.now());
  }

  async tick() {
    await this.enqueue('tick', {}, `tick:${Math.floor(Date.now() / TICK_MS)}`);
  }

  async getMedia(id) {
    const m = this.media(id);
    return m ? { mime: m.mime, data: m.data } : null;
  }

  async health() {
    return {
      ok: true,
      owner: !!this.one("SELECT 1 FROM users WHERE role='owner'"),
      accounts: this.accounts().length,
      pending_jobs: this.one('SELECT COUNT(*) AS c FROM jobs WHERE done=0').c,
      last_tick: this.kvGet('last_tick'),
    };
  }

  async setup(origin) {
    if (origin?.startsWith('https://')) this.kvSet('origin', origin);
    const me = await this.tg.getMe();
    this.kvSet('bot_username', me.username);
    await this.tg.setWebhook(`${origin}/tg`, await webhookSecret(this.env));
    await this.tg.setCommands(COMMANDS);
    const owner = this.one("SELECT * FROM users WHERE role='owner'");
    return {
      ok: true,
      bot: me.username,
      owner_claimed: !!owner,
      claim_link: owner ? null : `https://t.me/${me.username}?start=${await claimCode(this.env)}`,
    };
  }

  async alarm() {
    this.running = true;
    try {
      await this.runJobs();
    } finally {
      this.running = false;
    }
    if (this.one('SELECT 1 FROM jobs WHERE done=0 LIMIT 1')) await this.ctx.storage.setAlarm(Date.now() + 50);
  }

  async runJobs() {
    for (let i = 0; i < MAX_JOBS_PER_ALARM; i++) {
      // رسائل المالك أولاً، قبل الفحص الدوري.
      const job = this.one("SELECT * FROM jobs WHERE done=0 ORDER BY CASE kind WHEN 'tg' THEN 0 ELSE 1 END, id LIMIT 1");
      if (!job) break;
      // يُعلَّم منفّذاً قبل التنفيذ: مهمة تفشل لا تعيد نفسها للأبد (تلغرام والـ cron يعيدان ما يلزم).
      this.run('UPDATE jobs SET done=1 WHERE id=?', job.id);
      try {
        await this.runJob(job.kind, JSON.parse(job.payload));
      } catch (e) {
        console.error('job failed', job.kind, e?.stack || e);
        await this.reportError(job.kind === 'tg' ? 'رسالتك' : 'الفحص الدوري', e);
      }
    }
  }

  async runJob(kind, p) {
    if (kind === 'tg') return this.onUpdate(p);
    if (kind === 'tick') return this.runTick();
  }

  // ---------- إشعارات ----------
  async notify(text, opts) {
    for (const u of this.users()) {
      try {
        await this.tg.send(u.tg_id, text, opts);
      } catch (e) {
        console.error('notify failed', u.tg_id, e.message);
      }
    }
  }

  async reportError(where, e) {
    const last = this.kvGet('last_error_at', 0);
    if (Date.now() - last < 15 * 60 * 1000) return;
    this.kvSet('last_error_at', Date.now());
    const owner = this.one("SELECT * FROM users WHERE role='owner'");
    if (owner) await this.tg.send(owner.tg_id, `⚠️ صار خطأ (${escapeHtml(where)}): ${escapeHtml(truncate(explainMetaError(e), 600))}`).catch(() => {});
  }

  // ---------- تلغرام ----------
  async onUpdate(u) {
    if (u.callback_query) return this.onCallback(u.callback_query);
    const msg = u.message;
    if (!msg || msg.chat?.type !== 'private' || !msg.from) return;
    const text = (msg.text || msg.caption || '').trim();
    if (/^\/start\b/.test(text)) return this.onStart(msg, text.split(/\s+/)[1]);
    if (!this.user(msg.from.id)) return this.tg.send(msg.chat.id, 'هذا البوت خاص بفريق فينيق 🙏');

    const wiz = this.kvGet(`wiz:${msg.from.id}`);
    if (/^EAA[A-Za-z0-9_-]{30,}$/.test(text)) return this.onToken(msg, text);
    if (wiz && text && !msg.photo && !text.startsWith('/')) return this.onWizard(msg, wiz, text);
    if (text.startsWith('/')) return this.onCommand(msg, text);
    return this.onChat(msg, text);
  }

  async onStart(msg, param) {
    const chat = msg.chat.id;
    const uid = msg.from.id;
    const name = msg.from.first_name || '';
    if (this.user(uid)) return this.welcome(chat, name);
    const owner = this.one("SELECT 1 FROM users WHERE role='owner'");
    if (!owner && param && param === (await claimCode(this.env))) {
      this.run("INSERT INTO users (tg_id,name,role,added_at) VALUES (?,?,'owner',?)", uid, name, Date.now());
      return this.welcome(chat, name);
    }
    const invite = param ? this.kvGet(`invite:${param}`) : null;
    if (invite && invite.exp > Date.now()) {
      this.kvSet(`invite:${param}`, null);
      this.run("INSERT INTO users (tg_id,name,role,added_at) VALUES (?,?,'editor',?)", uid, name, Date.now());
      await this.notify(`👋 انضم ${escapeHtml(name)} لفريق إدارة الصفحات.`);
      return this.welcome(chat, name);
    }
    return this.tg.send(chat, 'هذا البوت خاص بفريق فينيق 🙏');
  }

  async welcome(chat, name) {
    const connected = this.accounts().length > 0;
    await this.tg.send(
      chat,
      `أهلين ${escapeHtml(name)} 👋 أنا أيجنت فينيق: بكتب منشورات فيسبوك وانستغرام وبجدولها، وبرد عالتعليقات والرسائل بالعربي.\n\n` +
        (connected ? HELP : 'أول خطوة: نربط صفحة فينيق. ابعت /connect وبمشي معك خطوة خطوة (5 دقايق).'),
    );
  }

  async onCommand(msg, text) {
    const chat = msg.chat.id;
    const [cmd, ...rest] = text.slice(1).split(/\s+/);
    const arg = rest.join(' ');
    switch (cmd.split('@')[0].toLowerCase()) {
      case 'help':
        return this.tg.send(chat, HELP);
      case 'connect':
        return this.startConnect(msg);
      case 'cancel':
        this.kvSet(`wiz:${msg.from.id}`, null);
        this.kvSet(`edit:${msg.from.id}`, null);
        return this.tg.send(chat, 'تمام، لغيت 👍');
      case 'queue':
        return this.showQueue(chat);
      case 'plan':
        if (arg === 'off' || arg === 'on') {
          this.kvSet('autoplan', arg === 'on');
          return this.tg.send(chat, arg === 'on' ? '🗓 رح اقترح خطة كل أحد مسا.' : '🗓 وقفت الاقتراح الأسبوعي التلقائي. (/plan on لترجعه)');
        }
        return this.planWeek(chat, Number(arg) || 3);
      case 'inbox':
        return this.showInbox(chat);
      case 'report':
        return this.sendReport(chat);
      case 'mode':
        return this.tg.send(chat, this.modeText(), {
          buttons: [[['🤖 تلقائي', 'mode:auto'], ['👀 مراجعة', 'mode:review']]],
        });
      case 'brief':
        return this.showNotes(chat);
      case 'status':
        return this.showStatus(chat);
      case 'invite':
        return this.invite(msg);
      default:
        return this.onChat(msg, text);
    }
  }

  modeText() {
    return this.kvGet('mode', 'review') === 'auto'
      ? 'الوضع الحالي: 🤖 <b>تلقائي</b> — برد لحالي عالأسئلة السهلة والمديح، وبخفي السبام، وببعتلك الشكاوى والحساس.'
      : 'الوضع الحالي: 👀 <b>مراجعة</b> — كل رد عالتعليقات والرسائل بينتظر موافقتك.';
  }

  // ---------- محادثة المالك ----------
  buildContext(uid) {
    const now = Date.now();
    const acc = this.accounts();
    const lines = [`## الوضع الحالي`, `الوقت الآن بدمشق: ${humanTime(now)} (${localStamp(now)})`];
    lines.push(
      acc.length
        ? `الصفحات: ${acc.map((a) => `فيسبوك «${a.name}»` + (a.ig_username ? ` + انستغرام @${a.ig_username}` : ' (بلا انستغرام)')).join('، ')}`
        : 'الصفحات: ما في صفحة مربوطة بعد (لازم /connect قبل النشر؛ المسودات بتنحفظ).',
    );
    lines.push(`وضع الردود: ${this.kvGet('mode', 'review') === 'auto' ? 'تلقائي' : 'مراجعة'}`);
    const drafts = this.all("SELECT * FROM posts WHERE status IN ('draft','scheduled') ORDER BY id DESC LIMIT 5");
    if (drafts.length) {
      lines.push('المسودات والمجدول:');
      for (const p of drafts) {
        lines.push(`- #${p.id} [${p.status === 'draft' ? 'مسودة' : 'مجدول'}، ${targetsLabel(JSON.parse(p.targets))}، ${p.scheduled_at ? localStamp(p.scheduled_at) : 'بلا موعد'}${p.media_id ? '، مع صورة' : ''}] «${truncate(p.text, 350)}»`);
      }
    }
    const pending = this.one("SELECT COUNT(*) AS c FROM inbox WHERE status='pending'").c;
    lines.push(`تعليقات ورسائل بانتظار موافقة المالك: ${pending}`);
    const edit = this.kvGet(`edit:${uid}`);
    if (edit?.type === 'reply') {
      const it = this.one('SELECT * FROM inbox WHERE n=?', edit.n);
      if (it) lines.push(`⚠️ المالك عم يعدّل الرد (ref "c:${it.n}"): ${it.kind === 'dm' ? 'رسالة' : 'تعليق'} ${it.author}: «${truncate(it.text, 300)}» — الرد الحالي: «${it.reply}». إذا كتب المالك الرد نفسه استعمله حرفياً بـ revise_reply، وإذا كتب تعليمات طبّقها.`);
    }
    if (edit?.type === 'post') lines.push(`⚠️ المالك عم يعدّل المسودة #${edit.id}: استعمل revise_post.`);
    const wiz = this.kvGet(`wiz:${uid}`);
    if (wiz) lines.push(`المالك بنص خطوات ربط فيسبوك (المرحلة: ${wiz.step}). إذا بعت صورة شاشة من لوحة Meta، اشرحله شو يكبس بالضبط ليوصل للخطوة الجاية (الخطوات: إنشاء تطبيق بـ Use case «Manage everything on your Page»، App settings ← Basic لنسخ App ID و App secret وحط رابط الخصوصية وتحويل App Mode لـ Live، ثم Graph API Explorer لتوليد User Token بالصلاحيات وإرساله للبوت). action=null.`);
    const photo = this.kvGet(`last_photo:${uid}`);
    if (photo && now - photo.at < 30 * 60 * 1000) lines.push('في صورة بعتها المالك من شوي (بتنفع image="attached").');
    return lines.join('\n');
  }

  history() {
    return this.all('SELECT role,text FROM chat ORDER BY id DESC LIMIT 8')
      .reverse()
      .map((r) => `${r.role === 'owner' ? 'المالك' : 'الأيجنت'}: ${r.text}`)
      .join('\n');
  }

  async onChat(msg, text) {
    const chat = msg.chat.id;
    const uid = msg.from.id;
    await this.tg.typing(chat).catch(() => {});

    let image = null;
    let mediaId = null;
    if (msg.photo?.length) {
      const ph = msg.photo[msg.photo.length - 1];
      const bytes = await this.tg.fileBytes(ph.file_id);
      mediaId = this.saveMedia(bytes, 'image/jpeg', ph.width, ph.height);
      image = { mime: 'image/jpeg', bytes };
      this.kvSet(`last_photo:${uid}`, { id: mediaId, at: Date.now() });
    } else if (msg.document || msg.video || msg.voice || msg.sticker) {
      return this.tg.send(chat, 'حالياً بفهم النص والصور بس 🙏 (الصورة ابعتها كصورة مو كملف).');
    }
    if (!text && !image) return;

    const context = this.buildContext(uid);
    const history = this.history();
    this.addChat('owner', text || '[صورة]');
    this.kvSet(`edit:${uid}`, null);

    let turn;
    try {
      turn = await ownerTurn(this.env, { notes: this.notes(), context, history, message: text, image });
    } catch (e) {
      console.error('ownerTurn', e.message);
      return this.tg.send(chat, `ما قدرت فكّر هلق — مشكلة بالاتصال بالذكاء الاصطناعي. جرب كمان شوي.\n<i>${escapeHtml(truncate(e.message, 300))}</i>`);
    }
    if (turn.reply) {
      await this.tg.send(chat, escapeHtml(turn.reply));
      this.addChat('agent', turn.reply);
    }
    if (turn.action) {
      const lastPhoto = this.kvGet(`last_photo:${uid}`);
      const photoId = mediaId || (lastPhoto && Date.now() - lastPhoto.at < 30 * 60 * 1000 ? lastPhoto.id : null);
      try {
        await this.doAction(msg, turn.action, photoId);
      } catch (e) {
        console.error('action', turn.action.type, e?.stack || e);
        await this.tg.send(chat, `⚠️ ما زبط: ${escapeHtml(truncate(explainMetaError(e), 500))}`);
      }
    }
  }

  async doAction(msg, a, photoId) {
    const chat = msg.chat.id;
    switch (a.type) {
      case 'draft_post':
        return this.createDraft(chat, a, photoId);
      case 'revise_post':
        return this.revisePost(chat, a, photoId);
      case 'publish_post': {
        const p = this.post(a.post_id);
        if (!p || !['draft', 'scheduled'].includes(p.status)) return this.tg.send(chat, 'ما لقيت هالمسودة 🤔 (/queue)');
        return this.publishPost(p.id);
      }
      case 'cancel_post':
        return this.cancelPost(chat, a.post_id);
      case 'revise_reply': {
        const n = Number(String(a.ref || '').replace(/^c:/, ''));
        const it = this.one('SELECT * FROM inbox WHERE n=?', n);
        if (!it || !a.text) return this.tg.send(chat, 'ما لقيت التعليق 🤔');
        this.run("UPDATE inbox SET reply=?, status='pending' WHERE n=?", String(a.text), n);
        return this.sendCard(this.one('SELECT * FROM inbox WHERE n=?', n), [chat]);
      }
      case 'add_note': {
        if (!a.text) return;
        const notes = this.notes();
        notes.push(`${truncate(a.text, 500)} (${localStamp(Date.now()).slice(0, 10)})`);
        this.kvSet('notes', notes.slice(-40));
        return this.tg.send(chat, `📝 حفظتها: «${escapeHtml(truncate(a.text, 300))}»\nكل ملاحظاتي: /brief`);
      }
      case 'set_mode':
        this.kvSet('mode', a.mode === 'auto' ? 'auto' : 'review');
        return this.tg.send(chat, this.modeText());
      case 'plan_week':
        return this.planWeek(chat, Number(a.count) || 3);
      case 'report':
        return this.sendReport(chat);
      case 'show_queue':
        return this.showQueue(chat);
      case 'show_inbox':
        return this.showInbox(chat);
      case 'connect':
        return this.startConnect(msg);
      case 'help':
        return this.tg.send(chat, HELP);
    }
  }

  // ---------- المنشورات ----------
  async makeImage(prompt) {
    const b64 = await generateImage(this.env, prompt || 'A modern, well organized pharmacy in Syria, warm light');
    return this.saveMedia(fromBase64(b64), 'image/jpeg', 1024, 1024);
  }

  // يرجع [targets, notes] بعد التأكد أن انستغرام عنده صورة مناسبة.
  checkIg(targets, mediaId) {
    const notes = [];
    if (!targets.includes('ig')) return [targets, notes];
    const acc = this.accounts();
    if (acc.length && !acc.some((a) => a.ig_id)) {
      notes.push('⚠️ ما في حساب انستغرام مربوط بالصفحة، فرح ينزل عالفيسبوك بس. (اربطه وابعت /connect)');
      return [targets.filter((t) => t !== 'ig'), notes];
    }
    const m = this.media(mediaId);
    if (!m) {
      notes.push('⚠️ انستغرام بدو صورة، فهالمنشور رح ينزل عالفيسبوك بس. ابعتلي صورة إذا بدك ياه عالانستا.');
      return [targets.filter((t) => t !== 'ig'), notes];
    }
    if (m.width && m.height) {
      const r = m.width / m.height;
      if (r < 0.8 || r > 1.91) {
        notes.push('⚠️ الصورة طويلة/عريضة كتير لانستغرام (المسموح بين 4:5 و 1.91:1)، فرح تنزل عالفيسبوك بس. ابعت صورة مربعة إذا بدك انستغرام.');
        return [targets.filter((t) => t !== 'ig'), notes];
      }
    }
    if (m.mime !== 'image/jpeg') {
      notes.push('⚠️ انستغرام بيقبل JPEG بس، فرح ينزل عالفيسبوك بس.');
      return [targets.filter((t) => t !== 'ig'), notes];
    }
    return [targets, notes];
  }

  async createDraft(chat, a, photoId, source = 'chat') {
    const text = String(a.text || '').trim();
    if (!text) return this.tg.send(chat, 'ما طلع معي نص للمنشور 🤔 جرّب تحكيلي عن شو.');
    let targets = normTargets(a.targets);
    const now = Date.now();
    const when = parseLocal(a.when, now);
    const scheduledAt = when && when > now + 60_000 ? when : null;
    const notes = [];
    let mediaId = null;
    if (a.image === 'attached' && photoId) mediaId = photoId;
    else if (a.image === 'generate' || (targets.includes('ig') && a.image !== 'none')) {
      try {
        mediaId = await this.makeImage(a.image_prompt);
      } catch (e) {
        notes.push(`⚠️ ما قدرت ولّد صورة (${escapeHtml(truncate(e.message, 120))}).`);
      }
    }
    let igNotes;
    [targets, igNotes] = this.checkIg(targets, mediaId);
    notes.push(...igNotes);
    const row = this.one(
      "INSERT INTO posts (status,text,targets,media_id,image_prompt,scheduled_at,created_at,source) VALUES ('draft',?,?,?,?,?,?,?) RETURNING id",
      text, JSON.stringify(targets), mediaId, a.image_prompt || null, scheduledAt, now, source,
    );
    if (chat != null) await this.sendPreview(chat, row.id, notes);
    return row.id;
  }

  async revisePost(chat, a, photoId) {
    const p = this.post(a.post_id) || this.one("SELECT * FROM posts WHERE status IN ('draft','scheduled') ORDER BY id DESC LIMIT 1");
    if (!p || !['draft', 'scheduled'].includes(p.status)) return this.tg.send(chat, 'ما لقيت مسودة لعدّلها 🤔 (/queue)');
    let text = a.text ? String(a.text).trim() : p.text;
    let targets = a.targets ? normTargets(a.targets) : JSON.parse(p.targets);
    let scheduledAt = p.scheduled_at;
    if (a.when) {
      const w = parseLocal(a.when);
      if (w) scheduledAt = w > Date.now() + 60_000 ? w : null;
    }
    let mediaId = p.media_id;
    let prompt = p.image_prompt;
    const notes = [];
    if (a.image === 'none') mediaId = null;
    else if (a.image === 'attached' && photoId) mediaId = photoId;
    else if (a.image === 'generate' || (targets.includes('ig') && !mediaId)) {
      prompt = a.image_prompt || prompt;
      try {
        mediaId = await this.makeImage(prompt);
      } catch (e) {
        notes.push(`⚠️ ما قدرت ولّد صورة (${escapeHtml(truncate(e.message, 120))}).`);
      }
    }
    let igNotes;
    [targets, igNotes] = this.checkIg(targets, mediaId);
    notes.push(...igNotes);
    this.run(
      "UPDATE posts SET text=?, targets=?, scheduled_at=?, media_id=?, image_prompt=?, status='draft' WHERE id=?",
      text, JSON.stringify(targets), scheduledAt, mediaId, prompt, p.id,
    );
    return this.sendPreview(chat, p.id, notes);
  }

  async sendPreview(chat, id, notes = []) {
    const p = this.post(id);
    const targets = JSON.parse(p.targets);
    const future = p.scheduled_at && p.scheduled_at > Date.now();
    const header = `📝 <b>مسودة #${p.id}</b> — ${targetsLabel(targets)}\n🕐 ${future ? humanTime(p.scheduled_at) : 'بتنزل أول ما توافق'}`;
    const buttons = [
      future ? [['✅ اعتمد الموعد', `pa:${p.id}`], ['🚀 انشر هلق', `pp:${p.id}`]] : [['🚀 انشر هلق', `pp:${p.id}`]],
      [['✏️ عدّل', `pe:${p.id}`], ...(p.image_prompt ? [['🖼 صورة تانية', `pi:${p.id}`]] : []), ['❌ إلغاء', `px:${p.id}`]],
    ];
    const body = `${header}\n\n${escapeHtml(p.text)}${notes.length ? `\n\n${notes.join('\n')}` : ''}`;
    const m = this.media(p.media_id);
    if (m) {
      if (body.length <= 1024) return this.tg.sendPhotoBytes(chat, new Uint8Array(m.data), m.mime, body, { buttons });
      await this.tg.sendPhotoBytes(chat, new Uint8Array(m.data), m.mime, header);
    }
    return this.tg.send(chat, body, { buttons });
  }

  async cancelPost(chat, id) {
    const p = this.post(id);
    if (!p || !['draft', 'scheduled'].includes(p.status)) return this.tg.send(chat, 'ما لقيت هالمسودة 🤔 (/queue)');
    this.run("UPDATE posts SET status='cancelled' WHERE id=?", p.id);
    return this.tg.send(chat, `❌ لغيت المسودة #${p.id}.`);
  }

  async approvePost(chat, id) {
    const p = this.post(id);
    if (!p || !['draft', 'scheduled'].includes(p.status)) return this.tg.send(chat, 'هالمسودة ما عادت متاحة.');
    if (p.scheduled_at && p.scheduled_at > Date.now()) {
      this.run("UPDATE posts SET status='scheduled' WHERE id=?", p.id);
      return this.tg.send(chat, `✅ #${p.id} مجدول: ${humanTime(p.scheduled_at)}`);
    }
    return this.publishPost(p.id);
  }

  async waitIgContainer(id, token) {
    for (let i = 0; i < 10; i++) {
      const s = await this.graph.igStatus(id, token);
      if (s.status_code === 'FINISHED') return;
      if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`انستغرام رفض الصورة: ${s.status || s.status_code}`);
      await sleep(this.env.IG_POLL_MS ? Number(this.env.IG_POLL_MS) : 3000);
    }
    throw new Error('انستغرام تأخر بتجهيز الصورة، جرّب مرة تانية.');
  }

  async publishPost(id) {
    const p = this.post(id);
    if (!p || ['published', 'publishing', 'cancelled'].includes(p.status)) return;
    const acc = this.accounts()[0];
    if (!acc) {
      this.run("UPDATE posts SET status='draft' WHERE id=?", p.id);
      return this.notify(`⚠️ ما قدرت انشر #${p.id}: لازم نربط الصفحة أول. ابعت /connect`);
    }
    this.run("UPDATE posts SET status='publishing' WHERE id=?", p.id);
    const targets = JSON.parse(p.targets);
    const url = p.media_id ? this.mediaUrl(p.media_id) : null;
    const links = JSON.parse(p.links || '{}');
    const errors = {};
    let fbId = p.fb_id;
    let igId = p.ig_id;

    if (targets.includes('fb') && !fbId) {
      try {
        const r = url ? await this.graph.fbPostPhoto(acc.page_id, acc.page_token, url, p.text) : await this.graph.fbPostText(acc.page_id, acc.page_token, p.text);
        fbId = r.post_id || r.id;
        links.fb = `https://www.facebook.com/${fbId}`;
      } catch (e) {
        errors.fb = explainMetaError(e);
      }
    }
    if (targets.includes('ig') && !igId) {
      if (!acc.ig_id) errors.ig = 'ما في حساب انستغرام مربوط بالصفحة.';
      else if (!url) errors.ig = 'انستغرام بدو صورة.';
      else {
        try {
          const c = await this.graph.igCreateImage(acc.ig_id, acc.page_token, url, p.text);
          await this.waitIgContainer(c.id, acc.page_token);
          const r = await this.graph.igPublish(acc.ig_id, acc.page_token, c.id);
          igId = r.id;
          links.ig = (await this.graph.igPermalink(igId, acc.page_token).catch(() => ({}))).permalink || 'https://www.instagram.com/';
        } catch (e) {
          errors.ig = explainMetaError(e);
        }
      }
    }

    const failed = Object.keys(errors);
    const ok = targets.filter((t) => !failed.includes(t));
    const status = !failed.length ? 'published' : ok.length ? 'partial' : 'failed';
    this.run(
      'UPDATE posts SET status=?, fb_id=?, ig_id=?, links=?, error=?, published_at=? WHERE id=?',
      status, fbId, igId, JSON.stringify(links), failed.length ? JSON.stringify(errors) : null, ok.length ? Date.now() : null, p.id,
    );
    const lines = [status === 'published' ? `✅ نزل المنشور #${p.id}` : status === 'partial' ? `⚠️ المنشور #${p.id} نزل جزئياً` : `❌ ما نزل المنشور #${p.id}`];
    if (links.fb) lines.push(`📘 فيسبوك: ${links.fb}`);
    if (links.ig) lines.push(`📸 انستغرام: ${links.ig}`);
    for (const [t, err] of Object.entries(errors)) lines.push(`⚠️ ${PLATFORM[t]}: ${escapeHtml(truncate(err, 400))}`);
    return this.notify(lines.join('\n'), failed.length ? { buttons: [[['🔁 جرّب مرة تانية', `pr:${p.id}`]]] } : undefined);
  }

  async showQueue(chat) {
    const rows = this.all("SELECT * FROM posts WHERE status IN ('draft','scheduled') ORDER BY COALESCE(scheduled_at, created_at) LIMIT 15");
    if (!rows.length) return this.tg.send(chat, 'ما في مسودات ولا منشورات مجدولة. قلّي عن شو بدك نكتب ✍️');
    const lines = rows.map((p) => `${p.status === 'scheduled' ? '🕐' : '📝'} <b>#${p.id}</b> ${p.status === 'scheduled' ? humanTime(p.scheduled_at) : 'مسودة'} — ${targetsLabel(JSON.parse(p.targets))}\n«${escapeHtml(truncate(p.text, 90))}»`);
    return this.tg.send(chat, `${lines.join('\n\n')}\n\nلتعدّل أو تلغي قلّي مثلاً «الغي #${rows[0].id}» أو «أجّل #${rows[0].id} لبكرا».`);
  }

  // ---------- الخطة الأسبوعية ----------
  async planWeek(chat, count = 3) {
    count = Math.max(1, Math.min(7, count));
    if (chat) await this.tg.typing(chat).catch(() => {});
    const recent = this.all("SELECT text FROM posts WHERE status IN ('published','partial','scheduled') ORDER BY id DESC LIMIT 8")
      .map((r) => `- ${truncate(r.text, 150)}`).join('\n');
    const posts = await weeklyPlan(this.env, { notes: this.notes(), count, nowText: `${humanTime(Date.now())} (${localStamp(Date.now())})`, recent });
    const batch = randomId(4);
    const ids = [];
    for (const item of posts.slice(0, count)) {
      const when = parseLocal(item.when);
      if (!when || when < Date.now() + 10 * 60 * 1000 || !item.text) continue;
      ids.push(await this.createDraft(null, { ...item, when: localStamp(when), image: 'generate' }, null, `plan:${batch}`));
    }
    if (!ids.length) return chat ? this.tg.send(chat, 'ما طلعت خطة مناسبة هالمرة، جرّب /plan كمان شوي.') : undefined;
    const summary = ids.map((id, i) => {
      const p = this.post(id);
      return `${i + 1}) ${humanTime(p.scheduled_at)} — «${escapeHtml(truncate(p.text, 70))}»`;
    });
    const targetsChats = chat ? [chat] : this.users().map((u) => u.tg_id);
    for (const c of targetsChats) {
      await this.tg.send(c, `🗓 <b>اقتراح خطة الأسبوع</b> (${ids.length} منشورات):\n${summary.join('\n')}\n\nرح ابعتلك كل واحد لتشوفه. إذا عجبوك كلهم:`, {
        buttons: [[['✅ اعتمد الكل', `pl:${batch}`]]],
      });
      for (const id of ids) await this.sendPreview(c, id);
    }
  }

  // ---------- التعليقات والرسائل ----------
  collectFb(acc, posts, out) {
    for (const post of posts) {
      for (const c of post.comments?.data || []) {
        if (!c.message || c.from?.id === acc.page_id) continue;
        out.push({
          ext_id: `fb:${c.id}`, kind: 'comment', platform: 'fb', page_id: acc.page_id,
          thread_id: c.parent?.id || c.id, author: c.from?.name || 'مستخدم فيسبوك', author_id: c.from?.id || null,
          text: c.message, context: truncate(post.message || '', 400), created_at: Date.parse(c.created_time) || Date.now(),
        });
      }
    }
  }

  collectIg(acc, media, out) {
    const own = (acc.ig_username || '').toLowerCase();
    for (const m of media) {
      for (const c of m.comments?.data || []) {
        const add = (x, threadId) => {
          if (!x.text || (x.username || '').toLowerCase() === own) return;
          out.push({
            ext_id: `ig:${x.id}`, kind: 'comment', platform: 'ig', page_id: acc.page_id, thread_id: threadId,
            author: x.username || 'مستخدم انستغرام', author_id: null, text: x.text,
            context: truncate(m.caption || '', 400), created_at: Date.parse(x.timestamp) || Date.now(),
          });
        };
        add(c, c.id);
        for (const r of c.replies?.data || []) add(r, c.id);
      }
    }
  }

  collectDms(acc, platform, convs, out) {
    const ids = new Set([acc.page_id, acc.ig_id].filter(Boolean));
    const igName = (acc.ig_username || '').toLowerCase();
    const own = { has: (from) => ids.has(from?.id) || (!!igName && (from?.username || '').toLowerCase() === igName) };
    for (const conv of convs) {
      const msgs = conv.messages?.data || []; // الأحدث أولاً
      const unseen = [];
      for (const m of msgs) {
        if (own.has(m.from)) break;
        if (m.message) unseen.push(m);
      }
      if (!unseen.length) continue;
      const newest = unseen[0];
      const who = newest.from || {};
      out.push({
        ext_id: `dm:${newest.id}`, kind: 'dm', platform: platform === 'instagram' ? 'ig' : 'fb', page_id: acc.page_id,
        thread_id: who.id, author: who.name || who.username || 'زبون', author_id: who.id,
        text: unseen.slice().reverse().map((m) => m.message).join('\n'),
        context: truncate(msgs.slice().reverse().map((m) => `${own.has(m.from) ? 'فينيق' : 'الزبون'}: ${m.message || '[مرفق]'}`).join('\n'), 800),
        created_at: Date.parse(newest.created_time) || Date.now(),
      });
    }
  }

  async pollInbound() {
    const found = [];
    for (const acc of this.accounts()) {
      if (!acc.dm_send && Date.now() > this.kvGet(`dm_retry:${acc.page_id}`, 0)) {
        this.run('UPDATE accounts SET dm_send=1 WHERE page_id=?', acc.page_id); // يمكن Meta وافقت: نجرب من جديد
      }
      try {
        this.collectFb(acc, await this.graph.fbRecentComments(acc.page_id, acc.page_token), found);
      } catch (e) {
        await this.sourceError(acc, 'fb_comments', e);
      }
      if (acc.ig_id) {
        try {
          this.collectIg(acc, await this.graph.igRecentComments(acc.ig_id, acc.page_token), found);
        } catch (e) {
          await this.sourceError(acc, 'ig_comments', e);
        }
      }
      for (const platform of acc.ig_id ? ['messenger', 'instagram'] : ['messenger']) {
        const offKey = `dm_off:${acc.page_id}:${platform}`;
        if ((this.kvGet(offKey, 0) || 0) > Date.now()) continue;
        try {
          this.collectDms(acc, platform, await this.graph.conversations(acc.page_id, acc.page_token, platform), found);
        } catch (e) {
          // قراءة الرسائل تحتاج صلاحيات قد لا تكون متاحة بعد: نوقفها 12 ساعة بصمت بعد أول تنبيه.
          this.kvSet(offKey, Date.now() + 12 * 60 * 60 * 1000);
          if (!this.kvGet(`${offKey}:told`)) {
            this.kvSet(`${offKey}:told`, true);
            await this.notify(`ℹ️ ما قدرت اقرأ رسائل ${platform === 'instagram' ? 'انستغرام' : 'ماسنجر'} الخاصة: ${escapeHtml(truncate(explainMetaError(e), 300))}\nالتعليقات والنشر شغالين عادي. رح جرّب كمان مرة كل 12 ساعة.`);
          }
        }
      }
    }

    for (const it of found) {
      if (this.one('SELECT 1 FROM inbox WHERE ext_id=?', it.ext_id)) continue;
      // ردودنا نحنا (إذا فيسبوك ما رجّع اسم المرسل) ما منرد عليها.
      if (this.one('SELECT 1 FROM inbox WHERE reply_id=?', it.ext_id.slice(3))) continue;
      const baseline = this.kvGet(`baseline:${it.page_id}`, 0);
      const status = it.created_at < baseline ? 'seen' : 'new';
      this.run(
        'INSERT OR IGNORE INTO inbox (ext_id,kind,platform,page_id,thread_id,author,author_id,text,context,created_at,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        it.ext_id, it.kind, it.platform, it.page_id, it.thread_id, it.author, it.author_id, truncate(it.text, 2000), it.context, it.created_at, status,
      );
    }
    await this.triageNew();
  }

  async sourceError(acc, source, e) {
    const key = `srcerr:${acc.page_id}:${source}`;
    const last = this.kvGet(key, 0);
    if (Date.now() - last < 6 * 60 * 60 * 1000) return;
    this.kvSet(key, Date.now());
    await this.notify(`⚠️ مشكلة بقراءة ${source.startsWith('ig') ? 'تعليقات انستغرام' : 'تعليقات فيسبوك'}: ${escapeHtml(truncate(explainMetaError(e), 400))}`);
  }

  async triageNew() {
    const items = this.all("SELECT * FROM inbox WHERE status='new' ORDER BY n LIMIT ?", TRIAGE_BATCH);
    if (!items.length) return;
    const results = await triageInbound(this.env, {
      notes: this.notes(),
      items: items.map((i) => ({
        ref: String(i.n), kind: i.kind, platform: PLATFORM[i.platform], author: i.author, text: i.text,
        [i.kind === 'dm' ? 'conversation' : 'post']: i.context,
      })),
    });
    const auto = this.kvGet('mode', 'review') === 'auto';
    const done = [];
    for (const it of items) {
      const r = results.get(String(it.n)) || { category: 'other', needs_owner: true, reply: '', confidence: 0 };
      const category = CATEGORY[r.category] ? r.category : 'other';
      const reply = String(r.reply || '').trim();
      this.run('UPDATE inbox SET category=?, reply=? WHERE n=?', category, reply, it.n);
      const row = { ...it, category, reply };
      if (category === 'no_reply' || (!reply && !r.hide)) {
        this.run("UPDATE inbox SET status='ignored', handled_at=? WHERE n=?", Date.now(), it.n);
        continue;
      }
      if (auto && r.hide && (category === 'spam' || category === 'offensive') && it.kind === 'comment') {
        if (await this.hideItem(row, false)) {
          done.push(`🙈 أخفيت ${PLATFORM[it.platform]} — ${escapeHtml(it.author)}: «${escapeHtml(truncate(it.text, 80))}»`);
          continue;
        }
      }
      if (auto && !r.needs_owner && !r.hide && Number(r.confidence) >= 0.75 && AUTO_OK.has(category) && reply) {
        if (await this.sendReply(row, false)) {
          done.push(`💬 ${PLATFORM[it.platform]} — ${escapeHtml(it.author)}: «${escapeHtml(truncate(it.text, 80))}»\n   ↩️ «${escapeHtml(truncate(reply, 120))}»`);
          continue;
        }
      }
      this.run("UPDATE inbox SET status='pending' WHERE n=?", it.n);
      await this.sendCard(this.one('SELECT * FROM inbox WHERE n=?', it.n));
    }
    if (done.length) await this.notify(`🤖 تصرّفت لحالي (${done.length}):\n${done.join('\n')}`);
  }

  async sendCard(it, chats = null, manualReason = null) {
    const acc = this.account(it.page_id);
    const manualDm = it.kind === 'dm' && ((acc && !acc.dm_send) || !!manualReason);
    const lines = [
      `${it.kind === 'dm' ? '✉️ رسالة خاصة' : '💬 تعليق'} — ${PLATFORM[it.platform]} · ${CATEGORY[it.category] || ''}`,
      `👤 <b>${escapeHtml(it.author)}</b>: «${escapeHtml(truncate(it.text, 700))}»`,
    ];
    if (it.kind === 'comment' && it.context) lines.push(`📌 على منشور: «${escapeHtml(truncate(it.context, 120))}»`);
    if (it.reply) {
      lines.push('', '✍️ الرد المقترح:', manualDm ? `<code>${escapeHtml(it.reply)}</code>` : `<i>${escapeHtml(it.reply)}</i>`);
    }
    if (manualDm) lines.push('', `ℹ️ ${manualReason || 'Meta لسا ما سمحتلنا نبعت رسائل خاصة من الأيجنت.'} اضغط عالرد لتنسخه وابعته من Meta Business Suite.`);
    const buttons = manualDm
      ? [[['✅ بعته بإيدي', `ci:${it.n}`], ['✏️ عدّل', `ce:${it.n}`]]]
      : [
          [...(it.reply ? [['✅ ارسل الرد', `cs:${it.n}`]] : []), ['✏️ عدّل', `ce:${it.n}`]],
          [...(it.kind === 'comment' ? [['🙈 إخفاء', `ch:${it.n}`]] : []), ['تجاهل', `ci:${it.n}`]],
        ];
    const text = lines.join('\n');
    if (chats) for (const c of chats) await this.tg.send(c, text, { buttons });
    else await this.notify(text, { buttons });
  }

  async sendReply(it, report = true) {
    const acc = this.account(it.page_id);
    if (!acc || !it.reply) return false;
    try {
      let r;
      if (it.kind === 'dm') r = await this.graph.sendMessage(acc.page_id, acc.page_token, it.thread_id, it.reply);
      else if (it.platform === 'fb') r = await this.graph.fbReply(it.thread_id, acc.page_token, it.reply);
      else r = await this.graph.igReply(it.thread_id, acc.page_token, it.reply);
      this.run("UPDATE inbox SET status='replied', reply_id=?, handled_at=? WHERE n=?", r?.id || r?.message_id || null, Date.now(), it.n);
      return true;
    } catch (e) {
      if (it.kind === 'dm' && e.subcode === 2018278) {
        // مرّ أكتر من 24 ساعة على آخر رسالة من الزبون: Meta ما بتسمح بالرد من برا تطبيقها.
        if (report) await this.sendCard(this.one('SELECT * FROM inbox WHERE n=?', it.n), null, 'مرّ أكتر من 24 ساعة على رسالة الزبون، فMeta ما بتسمح نرد من الأيجنت.');
        return false;
      }
      if (it.kind === 'dm' && isAccessError(e)) {
        this.run('UPDATE accounts SET dm_send=0 WHERE page_id=?', acc.page_id);
        this.kvSet(`dm_retry:${acc.page_id}`, Date.now() + DAY_MS);
        if (report) await this.sendCard(this.one('SELECT * FROM inbox WHERE n=?', it.n));
        return false;
      }
      if (report) await this.notify(`⚠️ ما قدرت ابعت الرد لـ ${escapeHtml(it.author)}: ${escapeHtml(truncate(explainMetaError(e), 400))}`);
      return false;
    }
  }

  async hideItem(it, report = true) {
    const acc = this.account(it.page_id);
    if (!acc) return false;
    try {
      if (it.platform === 'fb') await this.graph.fbHide(it.ext_id.slice(3), acc.page_token);
      else await this.graph.igHide(it.ext_id.slice(3), acc.page_token);
      this.run("UPDATE inbox SET status='hidden', handled_at=? WHERE n=?", Date.now(), it.n);
      return true;
    } catch (e) {
      if (report) await this.notify(`⚠️ ما قدرت اخفي التعليق: ${escapeHtml(truncate(explainMetaError(e), 400))}`);
      return false;
    }
  }

  async showInbox(chat) {
    const rows = this.all("SELECT * FROM inbox WHERE status='pending' ORDER BY n LIMIT 10");
    if (!rows.length) {
      const fresh = this.one("SELECT COUNT(*) AS c FROM inbox WHERE status='new'").c;
      return this.tg.send(chat, fresh ? `في ${fresh} جديد عم رتّبهم، بيوصلوك خلال دقايق.` : 'ما في شي بانتظارك ✅');
    }
    for (const it of rows) await this.sendCard(it, [chat]);
  }

  // ---------- أزرار ----------
  async onCallback(q) {
    const uid = q.from.id;
    const chat = q.message?.chat?.id;
    const mid = q.message?.message_id;
    if (!this.user(uid) || !chat) return this.tg.answerCallback(q.id, 'مو مسموح').catch(() => {});
    await this.tg.answerCallback(q.id).catch(() => {});
    const data = String(q.data || '');
    const i = data.indexOf(':');
    const op = i < 0 ? data : data.slice(0, i);
    const arg = i < 0 ? '' : data.slice(i + 1);
    const clear = () => this.tg.editButtons(chat, mid, null).catch(() => {});

    try {
      switch (op) {
        case 'pp':
          await clear();
          return this.publishNow(chat, arg);
        case 'pa':
          await clear();
          return this.approvePost(chat, arg);
        case 'px':
          await clear();
          return this.cancelPost(chat, arg);
        case 'pr':
          await clear();
          return this.retryPost(chat, arg);
        case 'pe':
          this.kvSet(`edit:${uid}`, { type: 'post', id: Number(arg) });
          return this.tg.send(chat, `✏️ قلّي شو بدك غيّر بالمسودة #${escapeHtml(arg)}: النص، الموعد، المنصات، أو الصورة.`);
        case 'pi': {
          const p = this.post(arg);
          if (!p || !['draft', 'scheduled'].includes(p.status)) return this.tg.send(chat, 'هالمسودة ما عادت متاحة.');
          await clear();
          await this.tg.typing(chat, 'upload_photo').catch(() => {});
          return this.revisePost(chat, { post_id: p.id, image: 'generate' });
        }
        case 'pl': {
          await clear();
          const rows = this.all("SELECT id FROM posts WHERE source=? AND status='draft'", `plan:${arg}`);
          for (const r of rows) await this.approvePost(chat, r.id);
          return rows.length ? undefined : this.tg.send(chat, 'ما في مسودات باقية من هالخطة.');
        }
        case 'cs':
        case 'ch':
        case 'ci':
        case 'ce': {
          const it = this.one('SELECT * FROM inbox WHERE n=?', Number(arg));
          if (!it) return;
          if (!['pending', 'new', 'failed'].includes(it.status)) {
            await clear();
            return this.tg.send(chat, 'هاد انعالج من قبل ✅');
          }
          if (op === 'ce') {
            this.kvSet(`edit:${uid}`, { type: 'reply', n: it.n });
            return this.tg.send(chat, `✏️ اكتبلي الرد اللي بدك ياه لـ ${escapeHtml(it.author)}، أو قلّي شو عدّل.`);
          }
          await clear();
          if (op === 'ci') {
            this.run("UPDATE inbox SET status='ignored', handled_at=? WHERE n=?", Date.now(), it.n);
            return this.tg.send(chat, '👌 تمام.');
          }
          if (op === 'ch') return (await this.hideItem(it)) ? this.tg.send(chat, '🙈 أخفيت التعليق.') : undefined;
          return (await this.sendReply(it)) ? this.tg.send(chat, `✅ ردّيت على ${escapeHtml(it.author)}.`) : undefined;
        }
        case 'pg':
          return this.togglePage(chat, mid, arg);
        case 'pgd':
          await clear();
          return this.finishConnect(chat);
        case 'mode':
          this.kvSet('mode', arg === 'auto' ? 'auto' : 'review');
          await clear();
          return this.tg.send(chat, this.modeText());
        case 'nd': {
          const notes = this.notes();
          const idx = Number(arg);
          if (notes[idx] == null) return;
          const [removed] = notes.splice(idx, 1);
          this.kvSet('notes', notes);
          await clear();
          return this.tg.send(chat, `🗑 شلت: «${escapeHtml(truncate(removed, 200))}»`);
        }
      }
    } catch (e) {
      console.error('callback', op, e?.stack || e);
      return this.tg.send(chat, `⚠️ ما زبط: ${escapeHtml(truncate(explainMetaError(e), 400))}`);
    }
  }

  async publishNow(chat, id) {
    const p = this.post(id);
    if (!p || !['draft', 'scheduled'].includes(p.status)) return this.tg.send(chat, 'هالمسودة ما عادت متاحة.');
    await this.tg.send(chat, `⏳ عم انشر #${p.id}...`);
    return this.publishPost(p.id);
  }

  async retryPost(chat, id) {
    const p = this.post(id);
    if (!p || !['failed', 'partial'].includes(p.status)) return this.tg.send(chat, 'ما في شي لعيده.');
    this.run("UPDATE posts SET status='draft' WHERE id=?", p.id);
    return this.publishNow(chat, p.id);
  }

  // ---------- الربط مع فيسبوك ----------
  async startConnect(msg) {
    const chat = msg.chat.id;
    if (this.user(msg.from.id)?.role !== 'owner') return this.tg.send(chat, 'الربط بيعمله المالك بس.');
    const origin = this.origin() || '(رابط الأيجنت)';
    const app = this.kvGet('meta_app');
    if (app?.id && app?.secret) {
      this.kvSet(`wiz:${msg.from.id}`, { step: 'token' });
      return this.tg.send(chat, this.tokenSteps(app.id));
    }
    this.kvSet(`wiz:${msg.from.id}`, { step: 'app_id' });
    return this.tg.send(
      chat,
      `🔗 <b>ربط فيسبوك وانستغرام</b> (مرة وحدة، 5 دقايق)

<b>1)</b> افتح developers.facebook.com/apps ← <b>Create app</b>
• الاسم: Feniq Social
• الاستخدام (Use case): <b>Manage everything on your Page</b>
• كمّل لآخر خطوة ← Create app

<b>2)</b> من القائمة: <b>App settings ← Basic</b>
• Privacy Policy URL: <code>${origin}/privacy</code>
• User data deletion ← Data deletion instructions URL: <code>${origin}/data-deletion</code>
• App icon (إذا طلبها): نزّل هالصورة وارفعها: <code>${origin}/icon.jpg</code>
• Category: Business ← <b>Save changes</b>
• فوق الصفحة حوّل <b>App Mode</b> لـ <b>Live</b> (بدونها المنشورات بتنشاف إلك بس)

<b>3)</b> بنفس الصفحة انسخ <b>App ID</b> وابعتلي ياه هون 👇

(إذا علقت بأي خطوة ابعتلي صورة الشاشة وبقلك شو تكبس. للإلغاء: /cancel)`,
    );
  }

  tokenSteps(appId) {
    return `<b>آخر خطوة</b> 👇
1) افتح developers.facebook.com/tools/explorer
2) يمين الصفحة: <b>Meta App</b> ← Feniq Social${appId ? ` (${appId})` : ''}، و <b>User or Page</b> ← User Token
3) من <b>Permissions</b> ضيف هدول (اكتب أول حروف كل اسم واختاره):
<code>${PERMISSIONS.map(([p]) => p).join(', ')}</code>
4) اضغط <b>Generate Access Token</b> ← كمّل كـ... ← اختار صفحة فينيق وحساب انستغرام ← Save
5) انسخ التوكن (بيبلش بـ EAA) وابعتلي ياه هون — رح امسح رسالتك فوراً.

(إذا في صلاحية ما بتطلع بالقائمة: من لوحة التطبيق ← Use cases ← Customize ← اضغط Add جنبها.)`;
  }

  async onWizard(msg, wiz, text) {
    const chat = msg.chat.id;
    const uid = msg.from.id;
    if (wiz.step === 'app_id') {
      if (!/^\d{10,20}$/.test(text)) return this.tg.send(chat, 'الـ App ID أرقام بس (15-16 رقم تقريباً). انسخه من App settings ← Basic وابعته، أو /cancel');
      this.kvSet('meta_app', { id: text });
      this.kvSet(`wiz:${uid}`, { step: 'app_secret' });
      return this.tg.send(chat, '✅ تمام. هلق بنفس الصفحة جنب <b>App secret</b> اضغط <b>Show</b> (رح يطلب كلمة سر فيسبوك)، انسخه وابعتلي ياه. رح امسح رسالتك فوراً.');
    }
    if (wiz.step === 'app_secret') {
      if (!/^[a-f0-9]{32}$/i.test(text)) return this.tg.send(chat, 'الـ App secret بيكون 32 حرف ورقم إنكليزي. جرّب مرة تانية، أو /cancel');
      await this.tg.deleteMessage(chat, msg.message_id).catch(() => {});
      const app = this.kvGet('meta_app', {});
      this.kvSet('meta_app', { ...app, secret: text.toLowerCase() });
      this.kvSet(`wiz:${uid}`, { step: 'token' });
      return this.tg.send(chat, '🔒 حفظته ومسحت رسالتك.\n\n' + this.tokenSteps(app.id));
    }
    if (wiz.step === 'token') return this.tg.send(chat, 'بستنى التوكن (بيبلش بـ EAA). إذا بدك تلغي: /cancel');
    if (wiz.step === 'pick') return this.tg.send(chat, 'اختار الصفحات من الأزرار فوق ثم اضغط «تم».');
    this.kvSet(`wiz:${uid}`, null);
    return this.onChat(msg, text);
  }

  async onToken(msg, token) {
    const chat = msg.chat.id;
    const uid = msg.from.id;
    await this.tg.deleteMessage(chat, msg.message_id).catch(() => {});
    if (this.user(uid)?.role !== 'owner') return this.tg.send(chat, 'الربط بيعمله المالك بس.');
    const app = this.kvGet('meta_app');
    if (!app?.id || !app?.secret) return this.tg.send(chat, 'قبل التوكن لازم App ID و App secret. ابعت /connect');
    await this.tg.send(chat, '🔒 مسحت رسالة التوكن. ⏳ عم اربط...');

    let long;
    try {
      long = (await this.graph.exchangeToken(app.id, app.secret, token)).access_token;
    } catch (e) {
      return this.tg.send(chat, `❌ فيسبوك رفض التوكن: ${escapeHtml(explainMetaError(e))}\nتأكد إنه من نفس التطبيق (Feniq Social) وإنه جديد (بينتهي بعد ساعة)، وابعته مرة تانية.`);
    }
    let granted;
    let pages;
    try {
      granted = await this.graph.permissions(long);
      pages = await this.graph.pages(long);
    } catch (e) {
      return this.tg.send(chat, `❌ ما قدرت اقرأ صفحاتك من فيسبوك: ${escapeHtml(explainMetaError(e))}\nولّد توكن جديد وابعته.`);
    }
    const missingReq = REQUIRED.filter((p) => !granted.includes(p));
    if (missingReq.length) {
      return this.tg.send(chat, `❌ ناقص صلاحيات أساسية: <code>${missingReq.join(', ')}</code>\nرجاع عـ Graph API Explorer، ضيفها، ولّد توكن جديد وابعته.`);
    }
    if (!pages.length) {
      return this.tg.send(chat, '❌ ما لقيت ولا صفحة. وقت الموافقة لازم تختار صفحة فينيق. وإذا الصفحة تابعة لحساب أعمال (Business) تأكد إنك ضفت <code>business_management</code>. ولّد توكن جديد وابعته.');
    }
    this.kvSet('connect_pending', { granted, pages, selected: pages.length === 1 ? [pages[0].id] : [] });
    if (pages.length === 1) return this.finishConnect(chat);
    this.kvSet(`wiz:${uid}`, { step: 'pick' });
    return this.tg.send(chat, 'لقيت أكتر من صفحة. اختار الصفحات اللي بدي ديرها ثم «تم»:', { buttons: this.pageButtons() });
  }

  pageButtons() {
    const pend = this.kvGet('connect_pending');
    return [
      ...pend.pages.map((p) => [[`${pend.selected.includes(p.id) ? '✅' : '⬜️'} ${p.name}`, `pg:${p.id}`]]),
      [['تم ✔️', 'pgd']],
    ];
  }

  async togglePage(chat, mid, pageId) {
    const pend = this.kvGet('connect_pending');
    if (!pend) return;
    pend.selected = pend.selected.includes(pageId) ? pend.selected.filter((x) => x !== pageId) : [...pend.selected, pageId];
    this.kvSet('connect_pending', pend);
    return this.tg.editButtons(chat, mid, this.pageButtons()).catch(() => {});
  }

  async finishConnect(chat) {
    const pend = this.kvGet('connect_pending');
    if (!pend) return;
    if (!pend.selected.length) return this.tg.send(chat, 'ما اخترت ولا صفحة. ابعت التوكن من جديد لنعيد.');
    const now = Date.now();
    this.run('UPDATE accounts SET enabled=0');
    const lines = ['✅ <b>تم الربط!</b>'];
    for (const p of pend.pages.filter((x) => pend.selected.includes(x.id))) {
      const ig = p.instagram_business_account;
      this.run(
        `INSERT INTO accounts (page_id,name,page_token,ig_id,ig_username,enabled,dm_send,added_at) VALUES (?,?,?,?,?,1,1,?)
         ON CONFLICT(page_id) DO UPDATE SET name=excluded.name, page_token=excluded.page_token, ig_id=excluded.ig_id,
         ig_username=excluded.ig_username, enabled=1, dm_send=1`,
        p.id, p.name, p.access_token, ig?.id || null, ig?.username || null, now,
      );
      // أول فحص يتعامل فقط مع آخر 24 ساعة، ولا يرد على تعليقات قديمة.
      if (!this.kvGet(`baseline:${p.id}`)) this.kvSet(`baseline:${p.id}`, now - DAY_MS);
      lines.push(`📘 فيسبوك: ${escapeHtml(p.name)}`);
      lines.push(ig ? `📸 انستغرام: @${escapeHtml(ig.username)}` : '⚠️ ما في حساب انستغرام مربوط بهالصفحة. اربطه من إعدادات الصفحة ← Linked accounts ← Instagram (لازم يكون حساب Professional)، وبعدها ابعت /connect.');
    }
    const missing = PERMISSIONS.filter(([p]) => !pend.granted.includes(p));
    if (missing.length) lines.push('', 'صلاحيات ناقصة (الباقي شغال):', ...missing.map(([p, what]) => `• <code>${p}</code> ← ${what}`));
    lines.push('', 'تذكير: لازم يكون التطبيق <b>Live</b> بلوحة Meta حتى تبين المنشورات للناس.', '', 'جرّب هلق: «اعمل بوست ترحيبي بفينيق» 🚀');
    this.kvSet('connect_pending', null);
    for (const u of this.users()) this.kvSet(`wiz:${u.tg_id}`, null);
    return this.tg.send(chat, lines.join('\n'));
  }

  // ---------- أوامر متفرقة ----------
  async showNotes(chat) {
    const notes = this.notes();
    if (!notes.length) {
      return this.tg.send(chat, 'بعرف عن فينيق كل شي مكتوب بالموقع والعرض التقديمي. إذا في معلومة جديدة (عرض، مستودع انضم، قاعدة) قلّي «تذكّر إنه...» وبحفظها 📝');
    }
    return this.tg.send(chat, `📝 <b>ملاحظاتك</b> (بستعملها بالمنشورات والردود):\n${notes.map((n, i) => `${i + 1}. ${escapeHtml(n)}`).join('\n')}`, {
      buttons: notes.map((n, i) => [[`🗑 ${i + 1}. ${truncate(n, 30)}`, `nd:${i}`]]).slice(0, 20),
    });
  }

  async showStatus(chat) {
    const acc = this.accounts();
    const c = (q) => this.one(q).c;
    const ai = [this.env.GEMINI_API_KEY && 'Gemini', this.env.OPENAI_API_KEY && 'OpenAI', this.env.AI && 'Workers AI'].filter(Boolean);
    const last = this.kvGet('last_tick');
    return this.tg.send(
      chat,
      [
        '🟢 <b>الأيجنت شغّال</b>',
        acc.length ? acc.map((a) => `📘 ${escapeHtml(a.name)}${a.ig_username ? ` · 📸 @${escapeHtml(a.ig_username)}` : ''}${a.dm_send ? '' : ' · ✉️ الرسائل يدوية'}`).join('\n') : '⚪️ ما في صفحة مربوطة (/connect)',
        this.modeText(),
        `📝 مسودات: ${c("SELECT COUNT(*) AS c FROM posts WHERE status='draft'")} · 🕐 مجدول: ${c("SELECT COUNT(*) AS c FROM posts WHERE status='scheduled'")} · ✅ منشور: ${c("SELECT COUNT(*) AS c FROM posts WHERE status IN ('published','partial')")}`,
        `💬 بانتظارك: ${c("SELECT COUNT(*) AS c FROM inbox WHERE status='pending'")} · ردود هالأسبوع: ${this.one("SELECT COUNT(*) AS c FROM inbox WHERE status='replied' AND handled_at > ?", Date.now() - 7 * DAY_MS).c}`,
        `🧠 الذكاء الاصطناعي: ${ai.join(' ← ') || 'ما في'}`,
        `⏱ آخر فحص: ${last ? humanTime(last) : 'لسا'}`,
      ].join('\n'),
    );
  }

  async invite(msg) {
    const chat = msg.chat.id;
    if (this.user(msg.from.id)?.role !== 'owner') return this.tg.send(chat, 'الدعوات من المالك بس.');
    const code = randomId(8);
    this.kvSet(`invite:${code}`, { exp: Date.now() + DAY_MS });
    const bot = this.kvGet('bot_username') || (await this.tg.getMe()).username;
    return this.tg.send(chat, `ابعت هالرابط للشخص (صالح 24 ساعة ولمرة وحدة):\nhttps://t.me/${bot}?start=${code}`);
  }

  // ---------- التقرير ----------
  async sendReport(chat) {
    const acc = this.accounts()[0];
    if (!acc) return chat ? this.tg.send(chat, 'لازم نربط الصفحة أول (/connect).') : undefined;
    if (chat) await this.tg.typing(chat).catch(() => {});
    const since = Date.now() - 7 * DAY_MS;
    const stats = { الفترة: 'آخر 7 أيام' };
    try {
      const info = await this.graph.pageInfo(acc.page_id, acc.page_token);
      stats.فيسبوك = { الصفحة: info.name, المتابعين: info.followers_count ?? info.fan_count };
      const posts = await this.graph.fbPostsStats(acc.page_id, acc.page_token, Math.floor(since / 1000));
      stats.فيسبوك.المنشورات = posts.map((p) => ({
        نص: truncate(p.message || '', 80), تفاعلات: p.reactions?.summary?.total_count ?? 0,
        تعليقات: p.comments?.summary?.total_count ?? 0, مشاركات: p.shares?.count ?? 0,
      }));
    } catch (e) {
      stats.فيسبوك = { خطأ: explainMetaError(e) };
    }
    if (acc.ig_id) {
      try {
        const info = await this.graph.igInfo(acc.ig_id, acc.page_token);
        const media = (await this.graph.igMediaStats(acc.ig_id, acc.page_token)).filter((m) => Date.parse(m.timestamp) >= since);
        stats.انستغرام = {
          الحساب: info.username, المتابعين: info.followers_count, المنشورات: media.map((m) => ({ نص: truncate(m.caption || '', 80), لايكات: m.like_count ?? 0, تعليقات: m.comments_count ?? 0 })),
        };
      } catch (e) {
        stats.انستغرام = { خطأ: explainMetaError(e) };
      }
    }
    const byStatus = this.all('SELECT status, COUNT(*) AS c FROM inbox WHERE created_at > ? GROUP BY status', since);
    stats.التعليقات_والرسائل = Object.fromEntries(byStatus.map((r) => [r.status, r.c]));
    stats.منشورات_الأيجنت = this.one("SELECT COUNT(*) AS c FROM posts WHERE status IN ('published','partial') AND published_at > ?", since).c;

    let text;
    try {
      text = escapeHtml(await writeReport(this.env, { notes: this.notes(), stats }));
    } catch {
      text = `<pre>${escapeHtml(JSON.stringify(stats, null, 1)).slice(0, 3500)}</pre>`;
    }
    const msg = `📊 <b>تقرير الأسبوع</b>\n\n${text}`;
    return chat ? this.tg.send(chat, msg) : this.notify(msg);
  }

  // ---------- كل 5 دقائق ----------
  async runTick() {
    const now = Date.now();
    this.kvSet('last_tick', now);

    for (const p of this.all("SELECT id FROM posts WHERE status='scheduled' AND scheduled_at <= ? ORDER BY scheduled_at", now)) {
      await this.publishPost(p.id);
    }
    // منشور علق بحالة "publishing" (انقطع التنفيذ): يرجع مسودة ويتبلّغ المالك.
    for (const p of this.all("SELECT id FROM posts WHERE status='publishing' AND COALESCE(scheduled_at, created_at) < ?", now - 30 * 60 * 1000)) {
      this.run("UPDATE posts SET status='failed', error='انقطع النشر' WHERE id=?", p.id);
      await this.notify(`⚠️ النشر #${p.id} انقطع بالنص. تأكد من الصفحة، وإذا ما نزل اضغط:`, { buttons: [[['🔁 جرّب مرة تانية', `pr:${p.id}`]]] });
    }

    if (this.accounts().length) {
      try {
        await this.pollInbound();
      } catch (e) {
        await this.reportError('فحص التعليقات', e);
      }
    }

    if (!this.users().length) return;
    const week = weekKey(now);
    const day = localDayIndex(now);
    const hour = localHour(now);
    if (day === 0 && hour >= 18 && this.kvGet('autoplan', true) && this.kvGet('plan_week') !== week) {
      this.kvSet('plan_week', week);
      await this.planWeek(null, 3).catch((e) => this.reportError('الخطة الأسبوعية', e));
    }
    if (day === 4 && hour >= 20 && this.accounts().length && this.kvGet('report_week') !== week) {
      this.kvSet('report_week', week);
      await this.sendReport(null).catch((e) => this.reportError('التقرير', e));
    }

    // تنظيف يومي: سياسة الخصوصية تعد بحذف البيانات بعد 90 يوماً.
    if (now - this.kvGet('last_cleanup', 0) > DAY_MS) {
      this.kvSet('last_cleanup', now);
      const old = now - 90 * DAY_MS;
      this.run('DELETE FROM jobs WHERE done=1 AND created_at < ?', now - 2 * DAY_MS);
      this.run('DELETE FROM inbox WHERE created_at < ?', old);
      this.run('DELETE FROM chat WHERE id NOT IN (SELECT id FROM chat ORDER BY id DESC LIMIT 200)');
      this.run("DELETE FROM media WHERE created_at < ? AND id NOT IN (SELECT media_id FROM posts WHERE media_id IS NOT NULL AND status IN ('draft','scheduled'))", old);
      this.run("DELETE FROM media WHERE created_at < ? AND id NOT IN (SELECT media_id FROM posts WHERE media_id IS NOT NULL)", now - 3 * DAY_MS);
    }
  }
}
