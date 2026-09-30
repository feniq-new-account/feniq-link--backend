// عميل Telegram Bot API: لوحة تحكم المالك.

export class TelegramError extends Error {
  constructor(method, description, code) {
    super(`Telegram ${method}: ${description}`);
    this.code = code;
    this.description = description;
  }
}

// صف أزرار: [[text, data], ...] أو {text, url}.
function keyboard(rows) {
  if (!rows || !rows.length) return undefined;
  return {
    inline_keyboard: rows.map((row) =>
      row.map((b) => (Array.isArray(b) ? { text: b[0], callback_data: b[1] } : b)),
    ),
  };
}

export class Telegram {
  constructor(token) {
    this.token = token;
    this.base = `https://api.telegram.org/bot${token}`;
  }

  async call(method, params = {}) {
    const res = await fetch(`${this.base}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(params),
    });
    let data;
    try {
      data = await res.json();
    } catch {
      throw new TelegramError(method, `HTTP ${res.status}`, res.status);
    }
    if (!data.ok) throw new TelegramError(method, data.description || 'unknown', data.error_code);
    return data.result;
  }

  send(chatId, text, { buttons, replyTo } = {}) {
    return this.call('sendMessage', {
      chat_id: chatId,
      text: text.slice(0, 4096),
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: keyboard(buttons),
      reply_parameters: replyTo ? { message_id: replyTo, allow_sending_without_reply: true } : undefined,
    });
  }

  // photo: رابط عام أو file_id. التسمية التوضيحية حدها 1024 حرفاً.
  sendPhoto(chatId, photo, caption, { buttons } = {}) {
    return this.call('sendPhoto', {
      chat_id: chatId,
      photo,
      caption: caption?.slice(0, 1024),
      parse_mode: 'HTML',
      reply_markup: keyboard(buttons),
    });
  }

  // صورة من بايتات (صور مولّدة قبل أن يكون للعامل رابط عام معروف).
  async sendPhotoBytes(chatId, bytes, mime, caption, { buttons } = {}) {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('photo', new Blob([bytes], { type: mime }), 'image.jpg');
    if (caption) {
      form.append('caption', caption.slice(0, 1024));
      form.append('parse_mode', 'HTML');
    }
    if (buttons) form.append('reply_markup', JSON.stringify(keyboard(buttons)));
    const res = await fetch(`${this.base}/sendPhoto`, { method: 'POST', body: form });
    const data = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
    if (!data.ok) throw new TelegramError('sendPhoto', data.description, data.error_code);
    return data.result;
  }

  editText(chatId, messageId, text, { buttons } = {}) {
    return this.call('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: text.slice(0, 4096),
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: keyboard(buttons),
    });
  }

  editButtons(chatId, messageId, buttons) {
    return this.call('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: keyboard(buttons) || { inline_keyboard: [] },
    });
  }

  answerCallback(id, text) {
    return this.call('answerCallbackQuery', { callback_query_id: id, text: text?.slice(0, 200) });
  }

  deleteMessage(chatId, messageId) {
    return this.call('deleteMessage', { chat_id: chatId, message_id: messageId });
  }

  typing(chatId, action = 'typing') {
    return this.call('sendChatAction', { chat_id: chatId, action });
  }

  async fileBytes(fileId) {
    const file = await this.call('getFile', { file_id: fileId });
    const res = await fetch(`https://api.telegram.org/file/bot${this.token}/${file.file_path}`);
    if (!res.ok) throw new TelegramError('getFile', `download HTTP ${res.status}`, res.status);
    return new Uint8Array(await res.arrayBuffer());
  }

  getMe() {
    return this.call('getMe');
  }

  setWebhook(url, secret) {
    return this.call('setWebhook', {
      url,
      secret_token: secret,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false,
    });
  }

  setCommands(commands) {
    return this.call('setMyCommands', { commands });
  }
}
