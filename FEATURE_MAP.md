# خريطة الميزات — كل ميزة بكل طبقاتها

هذا الملف يربط كل ميزة من شاشتها إلى قاعدة البيانات، حتى يُعرف أي تغيير أين يلمس
قبل البدء. **أي تغيير يضيف أو ينقل أو يحذف ملفاً أو نقطة API أو حقلاً في ميزة، يحدّث
سطرها هنا في نفس الـcommit** (قاعدة في CLAUDE.md).

الخريطة الآلية (graphify) تكمّل هذا الملف ولا تغني عنه: هي تعرف من يستدعي من داخل
كل طبقة، لكنها لا ترى الجسر بين التطبيق والسيرفر (طلبات HTTP) — وهذا الجسر هو ما
يوثّقه هذا الملف. للاستعلام: `graphify query "..."` بعد `python3 tools/graph/build.py`
(ملخّصها في `graphify-out/GRAPH_REPORT.md`).

الاختصارات: `app/` = `phoenix/lib/features/`، `api/` = `backend/src/`،
`web/` = `web/src/`، `E.` = `phoenix/lib/core/network/endpoints.dart`.

## تطبيق الصيدليات (Flutter)

| الميزة | الشاشات (`app/…/presentation/views`) | النقاط (`E.`) | السيرفر: route → controller → service | الموديلات (`api/models`) | لوحة المستودع/الأدمن (`web/pages`) |
|---|---|---|---|---|---|
| الدخول والتسجيل | `auth/`: splash, password_login, registration, otp_verification, approval_pending | sendOtp, register, loginPassword, me, deviceToken, deleteAccount | `auth.routes` → `auth.controller` → `auth.service`, `otp.service` | user, pharmacy, refreshToken, otp | AccountsPage (الموافقة على الحسابات) |
| اختيار المستودع | `warehouse_selection/`: warehouse_selection, warehouse_profile | warehouses, warehouseProfile | `warehouse.routes` → `warehouse.controller` → `warehouse.service` | warehouse | WarehouseSettingsPage |
| الكتالوج وبطاقة المادة | `catalog/`: manufacturers, catalog (+ `widgets/product_card.dart`) | warehouseProducts, warehouseManufacturers, categories | `warehouse.routes` → `product.routes` → `product.controller` → `product.service` → `viewmodels/product.viewmodel.js` | product (نسخة المستودع), productCatalog (المرجع العام), manufacturer, category, offer, manufacturerDiscount | WarehouseProductsPage, `components/ProductFormModal`, AdminCatalogPage, AdminProductsPage |
| البونص (عرض دائم 10+1) | يظهر في product_card و cart | ضمن warehouseProducts و orders | `utils/bonus.js` (التحليل والحساب)، يُطبّق في `order.service` | `product.bonuses` | ProductFormModal، الاستيراد (`config/importSynonyms.js`: عمود «العرض») |
| السلة والطلب | `cart/`: cart | cartQuote, orders | `order.routes` → `order.controller` → `order.service`؛ quote عبر `discountCode.routes` | order, orderItem, offer, discountCode, counter | WarehouseOrdersPage, WarehouseOrderDetailPage |
| طلباتي وتتبّع الطلب | `my_orders/`: my_orders، `order_tracking/`: order_tracking | orders, orderDetail, cancelOrder, confirmDelivery, reorder | `order.routes` → `order.controller` → `order.service` | order, orderItem | WarehouseOrderDetailPage (`orderStatusFlow.js`) |
| المرتجعات | `returns/`: my_returns | returns, returnDetail, returnableOrders | `return.routes` → `return.controller` → `return.service`, `returnCredit.service` | return, order, orderItem | WarehouseReturnsPage, WarehouseReturnDetailPage |
| الديون | `debts/`: my_debts, debt_detail | debts, debtDetail | `pharmacyDebt.routes` → `pharmacyDebt.controller` → `accountStatement.service`, `orderLedger.service` | ledgerAccount, ledgerEntry, payment | WarehouseDebtsPage, WarehouseSettlementPage |
| سجل الحساب (التوفير) | `account_history/`: account_history | savingsSummary | `order.routes` → `order.controller` | order | — |
| العروض والإعلانات | `promotions/`: promotions, warehouse_offers؛ `offers/`، `advertisements/`، `banners/` | activeOffers, activeAdvertisements, advertisementCart, activeBanners | `offer.routes`، `advertisement.routes`، `banner.routes` → controllers/services بنفس الاسم | offer, advertisement, banner | WarehouseOffersPage, WarehouseAdvertisementsPage, WarehouseBannersPage, AdminOffersPage, AdminAdvertisementsPage, AdminBannersPage |
| أكواد الحسم | حقل في cart (`cart/presentation/widgets/discount_code_field.dart`) | cartQuote | `discountCode.routes` → `order.controller` → `discountCode.service` | discountCode, discountCodePharmacyUsage | WarehouseDiscountCodesPage, AdminDiscountCodesPage |
| الشكاوى | `complaints/`: my_complaints, submit_complaint, complaint_detail | complaints, complaintDetail | `complaint.routes` → `complaint.controller` → `complaint.service` | complaint | WarehouseComplaintsPage, AdminComplaintsPage |
| التقييمات | `reviews/`: pharmacy_reviews | reviews | `review.routes` → `review.controller` → `review.service` | review | WarehouseReviewsPage |
| سعر الصرف | (`exchange_rate/` cubit، يغذّي كل الأسعار) | exchangeRate | `exchangeRate.routes` → `exchangeRate.service` | exchangeRate, exchangeRateHistory | AdminExchangeRatePage |
| الإشعارات | `notifications/`: notification_center | (FCM: `core/services/fcm_service.dart`) | `services/notification.service.js`، البث الحي `api/realtime/` | notification | AdminNotificationsPage |
| الملف الشخصي والسياسة | `profile/`: profile، `legal/`: privacy_policy | me, deleteAccount | `auth.*` | user, pharmacy | — |

**مشترك في التطبيق:** الألوان `core/constants/app_colors.dart` (مطابقة يدوياً لـ
`web/src/index.css`)، الخطوط `core/theme/app_text_theme.dart` (Tajawal)، المسافات
`core/constants/app_sizes.dart` و`app_padding.dart` و`app_radius.dart`، المكوّنات
`core/widgets/`، المسارات `routes/`، النصوص `l10n/app_ar.arb` و`app_en.arb`.

## قوائم التغيير المتكرّر

### إضافة حقل لبطاقة المادة (مثل التركيبة أو تاريخ الانتهاء)
1. **القرار أولاً:** هل الحقل خاص بالمادة نفسها (يُخزَّن في `productCatalog`، مشترك
   لكل المستودعات — مثل التركيبة) أم خاص بمخزون المستودع (`product` — مثل تاريخ
   الانتهاء وسعره وبونصه)؟
2. `api/models/productCatalog.model.js` و/أو `api/models/product.model.js`.
3. الإخراج: `api/viewmodels/product.viewmodel.js` (+ `test/projection.select.test.js`
   إن كان الاستعلام يحدّد الحقول).
4. الإدخال: الاستيراد `api/services/warehouseImport.service.js` +
   `api/config/importSynonyms.js` (أسماء الأعمدة)، والإدخال اليدوي
   `web/components/ProductFormModal.jsx` و`api/services/warehouseProduct.service.js`.
5. التطبيق: `app/catalog/data/models/product_model.dart` →
   `app/catalog/presentation/widgets/product_card.dart` → النصوص في `l10n/*.arb`.
6. **توافق التطبيق القديم:** حقل جديد لا يكسر النسخ المنصّبة (تتجاهله)، لكن حذف
   أو تغيير حقل موجود يكسرها — `backend/test/compat.oldApp.test.js` و
   `phoenix/test/compat/`.
7. الاختبارات: backend (`test/`)، web (`vitest`)، التطبيق
   (`test/features/catalog/`).

### تغيير حساب السعر أو البونص
المصدر الوحيد للحساب هو السيرفر: `api/utils/bonus.js`، `api/services/order.service.js`،
`manufacturerDiscount.service.js` (`computeFinalPrice`). التطبيق يعرض ما يرسله السيرفر
(`app/cart/presentation/managers/cart_cubit.dart` يطبّق تغييرات السعر/البونص القادمة
من السيرفر). مرجع المال: `backend/docs/MONEY_FLOW.md`. اختبارات: `test/bonus.test.js`,
`test/order.bonus.test.js`, `test/pricing.shared.test.js`.

### تغيير في الهوية البصرية (ألوان/خطوط)
`phoenix/lib/core/constants/app_colors.dart` + `phoenix/lib/core/theme/*` + `web/src/index.css` معاً؛
الشعارات تُولَّد من `assets/branding/source/` بـ`assets/branding/generate_assets.py`
(لا تُعدَّل الصور الناتجة يدوياً).
