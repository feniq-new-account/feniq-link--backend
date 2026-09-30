// الخلفية: قائمة الكبسة اليمين، اختصار لوحة المفاتيح، وحقن اللوحة عند الطلب
// (بصلاحية activeTab فقط، بلا وصول دائم لكل المواقع).
const ext = globalThis.browser || globalThis.chrome;

async function createMenus() {
  await ext.contextMenus.removeAll();
  ext.contextMenus.create({ id: 'feniq-selection', title: 'حوّل لطلبية فينيق', contexts: ['selection'] });
  ext.contextMenus.create({ id: 'feniq-open', title: 'افتح لاقط الطلبيات', contexts: ['page'] });
}

ext.runtime.onInstalled.addListener((details) => {
  createMenus();
  if (details.reason === 'install') ext.runtime.openOptionsPage();
});
ext.runtime.onStartup.addListener(createMenus);

async function openInTab(tabId, text) {
  const msg = { type: 'feniq:open', text: text || '' };
  try {
    await ext.tabs.sendMessage(tabId, msg);
    return { ok: true };
  } catch (_) { /* اللوحة غير محقونة بعد */ }
  try {
    await ext.scripting.executeScript({ target: { tabId }, files: ['src/matcher.js', 'src/panel.js'] });
    await ext.tabs.sendMessage(tabId, msg);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

ext.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || tab.id == null) return;
  openInTab(tab.id, info.menuItemId === 'feniq-selection' ? info.selectionText : '');
});

ext.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'open-catcher') return;
  const t = tab || (await ext.tabs.query({ active: true, currentWindow: true }))[0];
  if (t) openInTab(t.id, '');
});

ext.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg) return false;
  if (msg.type === 'feniq:options') {
    ext.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }
  if (msg.type === 'feniq:openActive') {
    ext.tabs.query({ active: true, currentWindow: true })
      .then(([t]) => (t ? openInTab(t.id, '') : { ok: false, error: 'no tab' }))
      .then(sendResponse);
    return true;
  }
  return false;
});
