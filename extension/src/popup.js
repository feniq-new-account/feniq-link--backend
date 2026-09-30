const ext = globalThis.browser || globalThis.chrome;
const $ = (id) => document.getElementById(id);

(async () => {
  const { catalog, orders = [] } = await ext.storage.local.get(['catalog', 'orders']);
  $('cat').textContent = catalog && catalog.items && catalog.items.length
    ? `${catalog.items.length.toLocaleString('en-US')} صنف · ${catalog.source === 'feniq' ? 'مربوط بفينيق' : catalog.source === 'demo' ? 'كتالوج تجريبي' : 'من ملف المستودع'}`
    : 'ما في كتالوج بعد، افتح الإعدادات';

  const weekAgo = Date.now() - 7 * 864e5;
  const week = orders.filter((o) => Date.parse(o.at) >= weekAgo);
  $('w-orders').textContent = week.length;
  $('w-pharm').textContent = new Set(week.map((o) => o.pharmacy)).size;
  const sum = week.reduce((s, o) => s + (o.total || 0), 0);
  $('w-total').textContent = sum >= 1e6 ? (sum / 1e6).toFixed(1) + 'M' : Math.round(sum).toLocaleString('en-US');
})();

$('open').addEventListener('click', async () => {
  $('open').disabled = true;
  const res = await ext.runtime.sendMessage({ type: 'feniq:openActive' }).catch((e) => ({ ok: false, error: String(e) }));
  if (res && res.ok) { window.close(); return; }
  $('open').disabled = false;
  $('msg').className = 'msg err';
  $('msg').textContent = 'هالصفحة ما بتسمح بالإضافات (متل صفحات المتصفح نفسه). جرّبها على واتساب ويب أو من صفحة الإعدادات.';
});

$('settings').addEventListener('click', (e) => {
  e.preventDefault();
  ext.runtime.openOptionsPage();
  window.close();
});
