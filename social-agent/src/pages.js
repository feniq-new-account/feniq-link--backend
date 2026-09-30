// صفحتا سياسة الخصوصية وحذف البيانات: تطلبهما Meta لتفعيل التطبيق (Live).

const shell = (title, body) => `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{font-family:system-ui,Tahoma,sans-serif;max-width:720px;margin:0 auto;padding:24px 16px;line-height:1.9;color:#16283F;background:#F7F7F8}
h1{color:#F2760A;font-size:1.5rem}h2{font-size:1.1rem;margin-top:1.6em}.en{direction:ltr;text-align:left;border-top:1px solid #E4E7EB;margin-top:2em;padding-top:1em}</style>
</head><body>${body}</body></html>`;

export function privacyPage() {
  return shell(
    'سياسة الخصوصية — فينيق',
    `<h1>سياسة الخصوصية — أداة إدارة صفحات فينيق</h1>
<p>هذه الأداة خاصة بشركة فينيق، وتستعملها لإدارة صفحاتها هي فقط على فيسبوك وانستغرام: نشر المنشورات، والرد على التعليقات والرسائل التي تصل إلى هذه الصفحات.</p>
<h2>البيانات التي نعالجها</h2>
<p>نص التعليقات والرسائل المرسلة إلى صفحات فينيق، واسم المرسل الظاهر، ومعرّفات المنشورات. نستعملها فقط لكتابة الرد عليها وعرضها على فريق فينيق.</p>
<h2>المشاركة</h2>
<p>لا نبيع البيانات ولا نشاركها مع أي جهة. قد يُرسل نص التعليق إلى مزوّد ذكاء اصطناعي لصياغة الرد فقط.</p>
<h2>الحذف</h2>
<p>تُحذف البيانات تلقائياً بعد 90 يوماً، ويمكن طلب الحذف فوراً عبر <a href="/data-deletion">صفحة حذف البيانات</a>.</p>
<h2>التواصل</h2>
<p>هاتف وواتساب: <span dir="ltr">0982-001415</span> — <span dir="ltr">0956-634694</span></p>
<div class="en"><h2>Privacy Policy (English)</h2>
<p>This tool is used only by Feniq to manage Feniq's own Facebook Page and Instagram account: publishing posts and replying to comments and messages sent to them. We process the text of those comments/messages, the sender's public name and post IDs solely to draft and send replies. We do not sell or share data; text may be sent to an AI provider only to draft a reply. Data is deleted automatically after 90 days, or on request via the data deletion page. Contact: +963 982 001 415.</p></div>`,
  );
}

export function dataDeletionPage() {
  return shell(
    'حذف البيانات — فينيق',
    `<h1>طلب حذف البيانات</h1>
<p>لحذف أي تعليق أو رسالة أو بيانات تخصك من سجلات أداة فينيق، راسلنا واتساب على <span dir="ltr">0982-001415</span> أو أرسل رسالة خاصة لصفحة فينيق تكتب فيها "احذف بياناتي". نحذفها خلال 7 أيام ونؤكد لك.</p>
<div class="en"><h2>Data deletion</h2><p>To delete any data about you held by Feniq's page tool, message us on WhatsApp at +963 982 001 415 or send a private message to the Feniq Page saying "delete my data". We delete it within 7 days and confirm.</p></div>`,
  );
}
