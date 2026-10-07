# تطبيق فينيق على أندرويد — الهوية والتوقيع و Firebase

## 1. معرّف التطبيق (applicationId)

القيمة الحالية: **`com.feniq.link`**.

مكانها الوحيد: أول سطور `phoenix/android/app/build.gradle.kts`:

```kotlin
val feniqApplicationId = "com.feniq.link"
```

- غيّرها هناك فقط، و**قبل** أول توزيع حقيقي للصيادلة. بعد ذلك تغييرها = تطبيق جديد لا يحدّث القديم.
- `namespace` (اسم حزمة الكود `com.feniq.link`) لا يلزم تغييره مع المعرّف.
- إذا غيّرت المعرّف: تطبيق Android في Firebase يجب أن يكون بنفس المعرّف الجديد (الخطوة 3).

## 2. مفتاح التوقيع الدائم (keystore)

أندرويد لا يقبل تحديث تطبيق إلا إذا كانت النسخة الجديدة **بنفس المعرّف وبنفس مفتاح التوقيع**.
إذا ضاع المفتاح: لا تحديثات أبداً — كل صيدلاني يجب أن يحذف التطبيق ويثبّت من جديد.

### أ) إنشاء المفتاح (مرة واحدة في عمر التطبيق)

على أي جهاز عليه Java (أو Android Studio):

```bash
keytool -genkeypair -v \
  -keystore feniq-upload.jks \
  -storetype JKS \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias feniq
```

- سيطلب **كلمة سر للملف**، ثم معلومات (الاسم، المدينة، البلد `SY`…)، ثم كلمة سر للمفتاح (اضغط Enter لتكون نفس كلمة سر الملف).
- استعمل كلمة سر قوية (16 حرفاً فأكثر) واكتبها في مدير كلمات سر.

### ب) احفظه في مكانين (إلزامي)

احفظ **الملف `feniq-upload.jks` + كلمة السر + الاسم المستعار `feniq`** معاً في مكانين منفصلين، مثلاً:

1. مدير كلمات سر (Bitwarden / 1Password / Google Password Manager كملاحظة آمنة مع إرفاق الملف)، **و**
2. نسخة غير متصلة: فلاشة USB محفوظة في مكان آمن، أو Google Drive شخصي في مجلد خاص.

لا ترفعه إلى الريبو أبداً (`*.jks` و `key.properties` مستثناة في `.gitignore`).

### ج) ضعه في أسرار GitHub

حوّل الملف إلى نص base64:

```bash
# Linux
base64 -w0 feniq-upload.jks > feniq-upload.b64
# macOS
base64 -i feniq-upload.jks -o feniq-upload.b64
# Windows (PowerShell)
[Convert]::ToBase64String([IO.File]::ReadAllBytes("feniq-upload.jks")) | Out-File feniq-upload.b64
```

ثم في GitHub: الريبو ← **Settings ← Secrets and variables ← Actions ← New repository secret**:

| السر | القيمة |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | محتوى `feniq-upload.b64` كاملاً |
| `ANDROID_KEYSTORE_PASSWORD` | كلمة سر الملف |
| `ANDROID_KEY_ALIAS` | `feniq` |
| `ANDROID_KEY_PASSWORD` | كلمة سر المفتاح (نفس كلمة سر الملف إن ضغطت Enter) |

احذف `feniq-upload.b64` بعدها (الأصل محفوظ في المكانين).

بعد ذلك كل بناء في **Actions ← Build Android APK** يوقَّع بالمفتاح الدائم ويُرفع باسم `feniq-apk`.
بدون الأسرار يُبنى APK تجريبي باسم `feniq-apk-TEST-ONLY` بمفتاح مؤقت، ولا يُنشر على الموقع.

للبناء المحلي بدل GitHub: ملف `phoenix/android/key.properties` (غير مرفوع):

```properties
storeFile=/المسار/الكامل/feniq-upload.jks
storePassword=...
keyAlias=feniq
keyPassword=...
```

أو متغيرات البيئة `ANDROID_KEYSTORE_PATH` و `ANDROID_KEYSTORE_PASSWORD` و `ANDROID_KEY_ALIAS` و `ANDROID_KEY_PASSWORD`.

### د) كيف تتأكد أن التحديث سيتركّب فوق النسخة السابقة

1. افتح آخر تشغيل لـ **Build Android APK** ← صفحة **Summary**: تظهر
   `applicationId` و **بصمة SHA-256 لشهادة التوقيع**.
2. انسخ البصمة من أول بناء موقّع وضعها في **Settings ← Secrets and variables ← Actions ← Variables ← New repository variable** باسم
   `ANDROID_CERT_SHA256`. من الآن، أي بناء بمفتاح مختلف **يفشل** بدل أن يُنشر.
3. التجربة العملية: ثبّت APK من بناء رقم N على هاتف، ثم نزّل APK من بناء أحدث وافتحه على نفس الهاتف:
   يجب أن يظهر **"تحديث"** (Update) لا "تثبيت"، وتبقى بيانات الدخول. إذا ظهر "التطبيق غير مثبّت / تعارض الحزمة"
   فالتوقيع مختلف.
4. (اختياري، على كمبيوتر) `keytool -printcert -jarfile app-release.apk` يطبع نفس البصمة.

## 3. Firebase (الإشعارات وفحص التحديثات)

`google-services.json` الموجود حالياً يعود لمشروع المطوّر السابق (`phoenix-pharmacy-e54d2`، معرّف `com.example.phoenix`).
البناء **يتجاهله تلقائياً** لأن معرّفه لا يطابق `com.feniq.link`: التطبيق يعمل بلا إشعارات حتى يُستبدل.

على أندرويد، الملف الوحيد المطلوب هو `google-services.json` (التطبيق يقرأ إعدادات Firebase منه مباشرة،
ولا حاجة لتعديل `firebase_options.dart`).

### خطوات المالك

1. <https://console.firebase.google.com> ← **Add project** ← الاسم `feniq` (Analytics: اختياري، يمكن تعطيله).
2. داخل المشروع ← أيقونة Android ← **Android package name**: `com.feniq.link` ← Register app.
3. **Download google-services.json**.
4. في GitHub: الريبو ← افتح المجلد `phoenix/android/app/` ← **Add file ← Upload files** ← ارفع الملف
   (بنفس الاسم `google-services.json`، يستبدل القديم) ← Commit (يفضّل "Create a new branch" ثم Pull request).
5. للسيرفر (إرسال الإشعارات): Firebase ← ⚙️ **Project settings ← Service accounts ← Generate new private key**.
   من ملف JSON الناتج ضع في Render (خدمة `feniq-connect-api` ← Environment):
   `FIREBASE_PROJECT_ID` = `project_id`، `FIREBASE_CLIENT_EMAIL` = `client_email`، `FIREBASE_PRIVATE_KEY` = `private_key` (كما هو، مع `\n`).
   لا تلصق هذا الملف في أي محادثة ولا ترفعه للريبو.

بعد الرفع، سجل بناء الـAPK لن يحوي التحذير
`building WITHOUT Firebase`، والإشعارات تعمل في النسخة التالية.

> iOS غير منشور حالياً؛ `lib/firebase_options.dart` (قسم iOS) ومعرّف iOS (`com.example.phoenix` في
> `ios/Runner.xcodeproj`) ما زالا على القديم. قبل أي نسخة iOS: `flutterfire configure` على مشروع المالك.

## 6. تطبيق المناديب «Feniq Rep» (تطبيق منفصل من نفس الكود)

تطبيق المندوب مو جزء من تطبيق الصيدليات: هو تطبيق تاني على الموبايل، يتثبّت جنبه.

| | تطبيق الصيدليات | تطبيق المناديب |
|---|---|---|
| الاسم تحت الأيقونة | Feniq | **Feniq Rep** |
| الأيقونة | الطائر على كحلي | نفسها + شريط برتقالي مكتوب عليه **REP** |
| `applicationId` | `com.feniq.link` | `com.feniq.link.rep` |
| الدخول | الصيدليات فقط (المندوب يُرفض برسالة تدله على تطبيقه) | المناديب فقط (أي حساب تاني يُرفض)، بلا تسجيل حساب جديد |
| الـworkflow | `android-apk.yml` | `android-rep-apk.yml` |
| الرابط الثابت (من `main`) | `releases/download/test-latest/feniq-test.apk` | `releases/download/rep-test-latest/feniq-rep-test.apk` |

كيف بيتفرّقوا بالكود:
- أندرويد: `FENIQ_APP=rep` بالبيئة (بيعيّن المعرّف والاسم والأيقونة في `app/build.gradle.kts` عبر `manifestPlaceholders`).
- دارت: `--dart-define=APP_EDITION=rep` (`lib/core/config/app_edition.dart`).
- محلياً: `FENIQ_APP=rep flutter build apk --release --dart-define=APP_EDITION=rep`.
- بدون هالمتغيرين كل شي متل ما كان: تطبيق الصيدليات.
- المعرّف مختلف فـ`google-services.json` الحالي (للصيدليات) ما بيطابقه، فتطبيق المناديب بيتبني بلا Firebase (بلا إشعارات push) لحد ما تضيف له تطبيق أندرويد بـFirebase (`com.feniq.link.rep`) وتحط الملف الجديد.
- نفس مفتاح التوقيع (الأسرار نفسها) لتطبيقي الصيدليات والمناديب.
