// عميل Meta Graph API: صفحة فيسبوك + حساب انستغرام المربوط بها.

export class MetaError extends Error {
  constructor(err, status) {
    super(err?.message || `Graph HTTP ${status}`);
    this.code = err?.code;
    this.subcode = err?.error_subcode;
    this.type = err?.type;
    this.userMsg = err?.error_user_msg;
    this.status = status;
  }
}

// الصلاحيات المطلوبة وما تفتحه كل واحدة (تُعرض للمالك إن نقص شيء).
export const PERMISSIONS = [
  ['pages_show_list', 'رؤية صفحاتك'],
  ['pages_read_engagement', 'قراءة المنشورات والإحصاءات'],
  ['pages_manage_posts', 'النشر على فيسبوك'],
  ['pages_read_user_content', 'قراءة التعليقات'],
  ['pages_manage_engagement', 'الرد على التعليقات وإخفاؤها'],
  ['business_management', 'الوصول للصفحات التابعة لحساب أعمال'],
  ['instagram_basic', 'ربط انستغرام'],
  ['instagram_content_publish', 'النشر على انستغرام'],
  ['instagram_manage_comments', 'تعليقات انستغرام'],
  ['pages_messaging', 'رسائل ماسنجر'],
  ['instagram_manage_messages', 'رسائل انستغرام الخاصة'],
];
export const REQUIRED = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'];

// ترجمة أخطاء Meta الشائعة لجملة مفهومة.
export function explainMetaError(e) {
  if (!(e instanceof MetaError)) return e?.message || String(e);
  const raw = e.userMsg || e.message;
  if (e.code === 190) return `انتهت صلاحية الربط مع فيسبوك — ابعت /connect لنعيد الربط. (${raw})`;
  if (e.code === 10 || e.code === 200 || (e.code >= 200 && e.code < 300))
    return `ناقصة صلاحية من فيسبوك. (${raw})`;
  if (e.code === 368) return `فيسبوك حاجب هالعملية مؤقتاً (سياسة المحتوى أو السبام). (${raw})`;
  if (e.code === 4 || e.code === 17 || e.code === 32 || e.code === 613)
    return `وصلنا لحد الطلبات عند فيسبوك، رح نرجع نجرب بعدين. (${raw})`;
  if (e.code === 36003 || e.subcode === 2207009) return `أبعاد الصورة مو مقبولة بانستغرام (لازم بين 4:5 و 1.91:1). (${raw})`;
  if (e.code === 9004 || e.subcode === 2207052) return `انستغرام ما قدر يحمّل الصورة. (${raw})`;
  return raw;
}

// أخطاء تعني "ممنوع بهالمستوى من الوصول" (مثلاً الرسائل الخاصة قبل موافقة Meta).
export function isAccessError(e) {
  return e instanceof MetaError && (e.code === 10 || e.code === 3 || (e.code >= 200 && e.code < 300) || e.code === 551);
}

export class Graph {
  constructor(version = 'v25.0') {
    this.base = `https://graph.facebook.com/${version}`;
  }

  async req(method, path, params = {}, token) {
    const url = new URL(`${this.base}/${path}`);
    const all = { ...params };
    if (token) all.access_token = token;
    let init = { method };
    if (method === 'GET') {
      for (const [k, v] of Object.entries(all)) if (v != null) url.searchParams.set(k, String(v));
    } else {
      const body = new URLSearchParams();
      for (const [k, v] of Object.entries(all)) {
        if (v != null) body.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
      }
      init = { method, headers: { 'content-type': 'application/x-www-form-urlencoded' }, body };
    }
    const res = await fetch(url, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new MetaError(data.error, res.status);
    return data;
  }

  get(path, params, token) {
    return this.req('GET', path, params, token);
  }
  post(path, params, token) {
    return this.req('POST', path, params, token);
  }

  // ---- الربط ----
  exchangeToken(appId, appSecret, shortToken) {
    return this.get('oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortToken,
    });
  }
  me(token) {
    return this.get('me', { fields: 'id,name' }, token);
  }
  async permissions(token) {
    const r = await this.get('me/permissions', {}, token);
    return (r.data || []).filter((p) => p.status === 'granted').map((p) => p.permission);
  }
  async pages(userToken) {
    const r = await this.get(
      'me/accounts',
      { fields: 'id,name,access_token,instagram_business_account{id,username}', limit: 100 },
      userToken,
    );
    return r.data || [];
  }

  // ---- فيسبوك ----
  fbPostText(pageId, token, message) {
    return this.post(`${pageId}/feed`, { message }, token);
  }
  fbPostPhoto(pageId, token, url, caption) {
    return this.post(`${pageId}/photos`, { url, caption }, token);
  }
  async fbRecentComments(pageId, token) {
    const r = await this.get(
      `${pageId}/posts`,
      {
        fields:
          'id,message,created_time,permalink_url,comments.filter(stream).order(reverse_chronological).limit(25){id,message,created_time,from{id,name},parent{id}}',
        limit: 8,
      },
      token,
    );
    return r.data || [];
  }
  fbReply(commentId, token, message) {
    return this.post(`${commentId}/comments`, { message }, token);
  }
  fbHide(commentId, token) {
    return this.post(commentId, { is_hidden: true }, token);
  }

  // ---- انستغرام ----
  igCreateImage(igId, token, imageUrl, caption) {
    return this.post(`${igId}/media`, { image_url: imageUrl, caption }, token);
  }
  igStatus(containerId, token) {
    return this.get(containerId, { fields: 'status_code,status' }, token);
  }
  igPublish(igId, token, creationId) {
    return this.post(`${igId}/media_publish`, { creation_id: creationId }, token);
  }
  igPermalink(mediaId, token) {
    return this.get(mediaId, { fields: 'permalink' }, token);
  }
  async igRecentComments(igId, token) {
    const r = await this.get(
      `${igId}/media`,
      {
        fields:
          'id,caption,timestamp,permalink,comments.limit(25){id,text,timestamp,username,replies.limit(10){id,text,timestamp,username}}',
        limit: 8,
      },
      token,
    );
    return r.data || [];
  }
  igReply(commentId, token, message) {
    return this.post(`${commentId}/replies`, { message }, token);
  }
  igHide(commentId, token) {
    return this.post(commentId, { hide: true }, token);
  }

  // ---- الرسائل الخاصة (ماسنجر + انستغرام) ----
  async conversations(pageId, token, platform) {
    const r = await this.get(
      `${pageId}/conversations`,
      { platform, fields: 'id,updated_time,messages.limit(6){id,message,from,created_time}', limit: 10 },
      token,
    );
    return r.data || [];
  }
  sendMessage(pageId, token, recipientId, text) {
    return this.post(
      `${pageId}/messages`,
      { recipient: { id: recipientId }, messaging_type: 'RESPONSE', message: { text } },
      token,
    );
  }

  // ---- أرقام للتقرير ----
  pageInfo(pageId, token) {
    return this.get(pageId, { fields: 'name,fan_count,followers_count' }, token);
  }
  igInfo(igId, token) {
    return this.get(igId, { fields: 'username,followers_count,media_count' }, token);
  }
  async fbPostsStats(pageId, token, sinceSec) {
    const r = await this.get(
      `${pageId}/posts`,
      {
        fields: 'id,message,created_time,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)',
        since: sinceSec,
        limit: 25,
      },
      token,
    );
    return r.data || [];
  }
  async igMediaStats(igId, token) {
    const r = await this.get(`${igId}/media`, { fields: 'id,caption,timestamp,like_count,comments_count', limit: 25 }, token);
    return r.data || [];
  }
}
