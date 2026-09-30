// واتساب ويب: زر «لقط الطلبية» يظهر فوق أي رسالة عند تمرير الماوس عليها،
// ويجمع الرسالة مع الرسائل المتتالية من نفس المرسل (الصيدليات تبعت الطلبية
// على عدة رسائل). لا نعدّل عناصر واتساب نفسها: الزر عنصر مستقل فوق الصفحة،
// كي لا نكسر واجهتها حين تتغيّر.
(function () {
  'use strict';
  if (window.__feniqWA) return;

  const MSG = '[data-pre-plain-text]';

  const chip = document.createElement('feniq-chip');
  chip.setAttribute('style', 'all: initial; position: fixed; z-index: 2147483645; display: none;');
  const shadow = chip.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
<style>
button{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px 0 10px;border-radius:15px;
  background:#16283F;color:#fff;font:600 12.5px "Segoe UI",Tahoma,sans-serif;direction:rtl;box-shadow:0 6px 18px -6px rgba(14,26,44,.55);
  transition:transform .18s cubic-bezier(.16,1,.3,1)}
button:hover{background:#1D3452;transform:translateY(-1px)}
button:focus-visible{outline:2px solid #F2760A;outline-offset:2px}
i{width:8px;height:8px;border-radius:2px;background:#F2760A;transform:rotate(45deg)}
</style>
<button type="button" title="حوّل الرسالة (والرسائل المتتالية من نفس المرسل) لطلبية"><i></i>لقط الطلبية</button>`;
  const button = shadow.querySelector('button');
  document.documentElement.appendChild(chip);

  let current = null;
  let hideTimer = null;

  function senderOf(el) {
    const meta = el.getAttribute('data-pre-plain-text') || '';
    const m = meta.match(/\]\s*(.*?):\s*$/);
    return m ? m[1].trim() : '';
  }

  // innerText يحفظ الإيموجي (صور بنص بديل) لكنه يفقد أسطر الرسالة إذا تغيّر
  // تنسيق واتساب، فنأخذ النسخة التي فيها أسطر أكثر.
  function textOf(el) {
    const t = el.querySelector('.selectable-text') || el;
    const a = (t.innerText || '').trim();
    const b = (t.textContent || '').trim();
    const lines = (s) => s.split('\n').length;
    return lines(b) > lines(a) ? b : a;
  }

  function collect(start) {
    const all = Array.from(document.querySelectorAll('#main ' + MSG + ', ' + MSG)).filter((el, i, arr) => arr.indexOf(el) === i);
    const i = all.indexOf(start);
    const who = senderOf(start);
    const parts = [];
    for (let k = i; k >= 0 && k < all.length && parts.length < 15; k++) {
      if (senderOf(all[k]) !== who) break;
      const t = textOf(all[k]);
      if (t) parts.push(t);
    }
    return { text: parts.join('\n'), sender: who };
  }

  function chatTitle() {
    const h = document.querySelector('#main header span[title], #main header [title]');
    return h ? h.getAttribute('title') : '';
  }

  function place(el) {
    const r = el.getBoundingClientRect();
    chip.style.display = 'block';
    chip.style.top = Math.max(8, r.top - 34) + 'px';
    chip.style.left = Math.max(8, Math.min(window.innerWidth - 140, r.left)) + 'px';
  }

  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest && e.target.closest(MSG);
    if (el) {
      clearTimeout(hideTimer);
      current = el;
      place(el);
    } else if (e.target !== chip) {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => { chip.style.display = 'none'; }, 700);
    }
  }, true);
  chip.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  document.addEventListener('scroll', () => { if (current && chip.style.display !== 'none') place(current); }, true);

  button.addEventListener('click', () => {
    if (!current || !window.__feniqCatch) return;
    const { text, sender } = collect(current);
    const name = /^[+\d\s()-]+$/.test(sender) ? chatTitle() || sender : sender || chatTitle();
    window.__feniqCatch.open({ text, pharmacy: name });
    chip.style.display = 'none';
  });

  // يضع الرد في خانة الكتابة دون إرساله: الإرسال قرار المستخدم دائماً.
  function insert(text) {
    const box = document.querySelector('#main footer div[contenteditable="true"]');
    if (!box) return false;
    box.focus();
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      box.dispatchEvent(ev);
      if ((box.innerText || '').trim()) return true;
    } catch (_) { /* نجرب الطريقة التالية */ }
    try { return document.execCommand('insertText', false, text); } catch (_) { return false; }
  }

  window.__feniqWA = { insert };
})();
