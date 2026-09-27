# تسليم: نشر فينيق على حسابات المالك

آخر تحديث: 27 أيلول 2026. اقرأ `CLAUDE.md` أولاً (قاعدة العمل: كل ما تقدر عليه اعمله بنفسك).

## الوضع الحالي

- الكود الكامل في هذا الريبو (Private)، فرع `main`: السيرفر `backend/`، تطبيق الصيدليات `phoenix/` (Flutter)، لوحة الويب `web/`.
- المطوّر السابق (يزن) كان ينشر كل شيء على حساباته هو: سيرفر `phoenix-1-p2qi.onrender.com`، مشروع Firebase `phoenix-pharmacy-e54d2`. **لا شيء منها يُستعمل بعد الآن.** لا يوجد مستخدمون حقيقيون ولا بيانات يلزم نقلها.
- الاختبارات: السيرفر 1163/1163، لوحة الويب 354/354.
- `render.yaml` جاهز (Blueprint): خدمتان `feniq-api` (Node، `backend/`) و `feniq-web` (static، `web/`)، منطقة frankfurt، الخطة المجانية.
- تطبيق الموبايل يشير إلى `https://feniq-api.onrender.com/api` (`phoenix/lib/config/app_config.dart`).
- GitHub Actions:
  - `android-apk.yml` يبني APK مع كل تعديل على `phoenix/` (يعمل ✅).
  - `create-admin.yml` ينشئ أول أدمن (يدوي، يحتاج سرّين، انظر الخطوة 4).
- المالك أنشأ: حساب **MongoDB Atlas** (Cluster0، FREE M0، AWS — المنطقة لم تُؤكَّد بعد) وحساب **Render**.

## ملاحظات مهمة

- المالك في سوريا ويستعمل VPN. **لا تختر منطقة تل أبيب** لأي خدمة. فرانكفورت أو أقرب منطقة أوروبية.
- **لا تكتب أي كلمة سر أو رابط قاعدة بيانات في المحادثة.** ضعها مباشرة في الحقول المخصّصة (Render، أسرار GitHub).
- الردود للمالك بالعربية (لهجة شامية)، بسيطة، بلا مصطلحات غير ضرورية.

## الخطوات

### 1. MongoDB Atlas
1. **Database & Network Access ← IP Access List:** أضف `0.0.0.0/0` (Render بلا عنوان ثابت). لا تضغط "Add Current IP Address".
2. **Database Users:** مستخدم `feniq`، كلمة سر مولَّدة (Autogenerate)، دور **Read and write to any database**.
3. **Clusters:** تأكّد أن منطقة Cluster0 أوروبية (يفضَّل Frankfurt / eu-central-1). إن كانت بعيدة أو تل أبيب: احذفه واعمل M0 جديداً في Frankfurt.
4. احذف قاعدة البيانات التجريبية `sample_mflix` (وأي `sample_*`) إن وُجدت — تأكل من الـ512 ميغا.
5. **Connect ← Drivers:** انسخ الرابط، ضع كلمة السر مكان `<db_password>`، وأضف `feniq` بعد الـ`/` الذي قبل `?`:
   `mongodb+srv://feniq:PASSWORD@cluster0.xxxxx.mongodb.net/feniq?retryWrites=true&w=majority`

### 2. Render
1. سجّل الدخول بحساب GitHub `phoenixxx-dev`.
2. **New ← Blueprint ←** الريبو `phoenixxx-dev/feniq-backend`، الفرع `main`.
3. عند طلب القيم: `MONGODB_URI` = رابط الخطوة 1. اترك Firebase و Cloudinary فارغة الآن.
4. **Apply**، وانتظر حتى تصير الخدمتان Live.
5. إن أعطى Render اسماً غير `feniq-api` / `feniq-web` (الاسم محجوز): سجّل الأسماء الفعلية — يجب تحديث `CORS_ORIGINS` في Render، و`VITE_API_BASE_URL` في `render.yaml`، و`phoenix/lib/config/app_config.dart`، و`API_BASE_URL` في `.github/workflows/android-apk.yml`.

### 3. التحقق
- افتح `https://feniq-api.onrender.com/api/health` ← يجب أن يظهر `"db":"connected"`.
- افتح `https://feniq-web.onrender.com` ← صفحة الدخول.
- اطلب من المالك فتح الرابطين **بدون VPN** من سوريا. إن لم يفتحا، سجّل ذلك — نحتاج بديلاً (دومين خاص عبر Cloudflare مثلاً).

### 4. أول حساب أدمن
1. GitHub ← الريبو ← **Settings ← Secrets and variables ← Actions ← New repository secret**:
   - `MONGODB_URI` = نفس رابط الخطوة 1.
   - `ADMIN_PASSWORD` = كلمة سر قوية (12 حرفاً على الأقل). المالك يختارها ويحفظها — لا تُكتب في المحادثة.
2. **Actions ← Create admin ← Run workflow**: الاسم ورقم هاتف المالك.
3. سجّل الدخول إلى `feniq-web.onrender.com` برقم الهاتف وكلمة السر.

### 5. بعد ذلك (بالترتيب)
1. **معرّف التطبيق:** غيّر `com.example.phoenix` إلى معرّف للمالك (مثلاً `com.feniq.app`) في `phoenix/android/app/build.gradle.kts` (`namespace` و `applicationId`) ومسار `MainActivity.kt`، و `PRODUCT_BUNDLE_IDENTIFIER` في iOS.
2. **Firebase** (الإشعارات): مشروع جديد على حساب المالك، تطبيق Android بالمعرّف الجديد، نزّل `google-services.json` الجديد مكان `phoenix/android/app/google-services.json`، وحدّث `phoenix/lib/firebase_options.dart`. للسيرفر: Service account ← Generate key ← ضع `FIREBASE_PROJECT_ID` و `FIREBASE_CLIENT_EMAIL` و `FIREBASE_PRIVATE_KEY` في Render.
3. **مفتاح التوقيع الدائم:** `keytool -genkey -v -keystore upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload`، ثم أسرار GitHub: `ANDROID_KEYSTORE_BASE64` (الملف بـ base64) و `ANDROID_KEYSTORE_PASSWORD` و `ANDROID_KEY_ALIAS` و `ANDROID_KEY_PASSWORD`. **سلّم الملف وكلماته للمالك ليحفظه في مكانين** — بدونه لا تحديثات للتطبيق أبداً.
4. **Cloudinary** (الصور): حساب مجاني، ضع `CLOUDINARY_CLOUD_NAME` و `CLOUDINARY_API_KEY` و `CLOUDINARY_API_SECRET` في Render.
5. **SMS:** `SMS_PROVIDER=console` حالياً (رمز التحقق يظهر في سجلات Render). يلزم مزوّد يرسل لأرقام سورية لاحقاً.
6. نسخ احتياطي يومي لقاعدة البيانات (Atlas المجاني بلا نسخ احتياطية).
