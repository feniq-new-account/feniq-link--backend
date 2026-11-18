// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Arabic (`ar`).
class AppLocalizationsAr extends AppLocalizations {
  AppLocalizationsAr([String locale = 'ar']) : super(locale);

  @override
  String get appName => 'فينيق';

  @override
  String get login => 'تسجيل الدخول';

  @override
  String get logout => 'تسجيل الخروج';

  @override
  String get email => 'البريد الإلكتروني';

  @override
  String get password => 'كلمة المرور';

  @override
  String get settings => 'الإعدادات';

  @override
  String get language => 'اللغة';

  @override
  String get theme => 'المظهر';

  @override
  String get light => 'فاتح';

  @override
  String get dark => 'داكن';

  @override
  String get system => 'النظام';

  @override
  String get save => 'حفظ';

  @override
  String get cancel => 'إلغاء';

  @override
  String get welcome => 'مرحباً';

  @override
  String get home => 'الرئيسية';

  @override
  String get profile => 'الملف الشخصي';

  @override
  String get registrationTitle => 'إنشاء حساب الصيدلية';

  @override
  String get registrationSubtitle =>
      'املأ بيانات صيدليتك لإنشاء الحساب. ستظهر حالة حسابك بعد التسجيل، بما فيها انتظار موافقة الإدارة إن كانت مطلوبة.';

  @override
  String get fullNameLabel => 'الاسم الكامل';

  @override
  String get fullNameHint => 'مثال: د. سامر الحلبي';

  @override
  String get pharmacyNameLabel => 'اسم الصيدلية';

  @override
  String get pharmacyNameHint => 'مثال: صيدلية النور';

  @override
  String get phoneLabel => 'رقم الهاتف';

  @override
  String get addressLabel => 'العنوان';

  @override
  String get confirmLocationButton => 'اختيار هذا الموقع';

  @override
  String get locationConfirmedText => 'تم اختيار الموقع';

  @override
  String get changeLocationButton => 'تغيير الموقع';

  @override
  String get confirmLocationRequiredError =>
      'اضغط على «اختيار هذا الموقع» لتأكيد موقع الصيدلية';

  @override
  String get pickLocationHint => 'حرّك الخريطة لضبط موضع المؤشر بدقة';

  @override
  String get resolvingAddressText => 'جارِ تحديد العنوان...';

  @override
  String get locationPermissionDeniedMessage =>
      'تعذّر الوصول لموقعك، يمكنك تحريك الخريطة يدوياً لتحديد الموقع.';

  @override
  String get addressNotResolvedYetMessage =>
      'يرجى الانتظار حتى يتم تحديد العنوان من الخريطة، أو حرّك الخريطة لضبط الموقع.';

  @override
  String get useCurrentLocationTooltip => 'موقعي الحالي';

  @override
  String get areaTypeLabel => 'نوع المنطقة';

  @override
  String get areaTypeCity => 'مدينة';

  @override
  String get areaTypeCityRing => 'طوق مدينة';

  @override
  String get areaTypeRural => 'ريف';

  @override
  String get confirmPasswordLabel => 'تأكيد كلمة المرور';

  @override
  String get confirmPasswordHint => 'أعد إدخال كلمة المرور';

  @override
  String passwordHint(String min) {
    return '$min أحرف على الأقل';
  }

  @override
  String get passwordTooShort =>
      'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.';

  @override
  String get passwordMismatch => 'كلمتا المرور غير متطابقتين.';

  @override
  String get alreadyHaveAccountLink => 'لديك حساب؟ سجّل الدخول بكلمة المرور';

  @override
  String get sendCodeButton => 'إرسال رمز التحقق';

  @override
  String get createAccountButton => 'إنشاء الحساب';

  @override
  String get termsAgreementLabel => 'أوافق على شروط الاستخدام وسياسة الخصوصية.';

  @override
  String get termsAgreementRequiredError =>
      'يجب الموافقة على الشروط والأحكام للمتابعة.';

  @override
  String get passwordsMustMatchHint => 'يجب أن تتطابق كلمتا المرور.';

  @override
  String get passwordLoginTitle => 'تسجيل الدخول بكلمة المرور';

  @override
  String get passwordLoginSubtitle => 'أدخل رقم هاتفك وكلمة المرور';

  @override
  String get backToRegistrationLink => 'مستخدم جديد؟ أنشئ حساباً';

  @override
  String get forgotPasswordSupportLink =>
      'نسيت كلمة المرور؟ تواصل مع الدعم عبر واتساب';

  @override
  String get forgotPasswordSupportMessage =>
      'مرحباً، أريد استعادة كلمة المرور لحسابي. اسم الصيدلية: ___ رقم الهاتف المسجّل: ___';

  @override
  String whatsAppUnavailable(String phone) {
    return 'تعذّر فتح واتساب. رقم الدعم: $phone';
  }

  @override
  String get copyAction => 'نسخ';

  @override
  String get phoneCopied => 'تم نسخ الرقم.';

  @override
  String get otpTitle => 'أدخل رمز التحقق';

  @override
  String get otpInstructionsPrefix =>
      'أدخل الرمز المكوّن من 6 أرقام المُرسل إلى';

  @override
  String get otpCodeLabel => 'رمز التحقق';

  @override
  String get verifyButton => 'تحقق';

  @override
  String get resendCodeButton => 'لم يصلك الرمز؟ إعادة الإرسال';

  @override
  String get codeResent => 'تم إرسال رمز جديد.';

  @override
  String get approvalPendingTitle => 'حسابك قيد المراجعة';

  @override
  String get approvalPendingMessage =>
      'حسابك بانتظار مراجعة الإدارة. يمكنك إرسال الطلبات بعد الموافقة على الحساب وبدء استقبال الطلبات.';

  @override
  String approvalPendingMessageWithName(String pharmacyName) {
    return 'حساب صيدلية $pharmacyName بانتظار مراجعة الإدارة. يمكنك إرسال الطلبات بعد الموافقة على الحساب وبدء استقبال الطلبات.';
  }

  @override
  String get approvalPendingBlockedTitle => 'الحساب محظور';

  @override
  String get approvalPendingBlockedMessage =>
      'تم حظر هذا الحساب. يرجى التواصل مع الدعم للمساعدة.';

  @override
  String get approvalChecklistReceived => 'تم استلام بيانات التسجيل';

  @override
  String get approvalChecklistReview => 'قيد مراجعة الإدارة';

  @override
  String get approvalChecklistActivate => 'تفعيل الحساب بعد الموافقة';

  @override
  String get refreshStatusButton => 'تحقق من الحالة';

  @override
  String get contactSupportButton => 'تواصل مع الدعم';

  @override
  String get contactSupportDialogTitle => 'تواصل مع الدعم';

  @override
  String get contactSupportDialogMessage =>
      'للمساعدة بخصوص حسابك، تواصل مع دعم الفينيق عبر واتساب على الرقم التالي. يمكنك نسخه بزر «نسخ».';

  @override
  String get fieldRequired => 'هذا الحقل مطلوب.';

  @override
  String get invalidPhoneNumber => 'يرجى إدخال رقم هاتف صحيح.';

  @override
  String get invalidOtpCode => 'يرجى إدخال الرمز المكون من 6 أرقام.';

  @override
  String get close => 'إغلاق';

  @override
  String get errorState => 'حدث خطأ ما.';

  @override
  String get errorNetwork =>
      'تعذر الاتصال بالإنترنت. تحقق من اتصالك وحاول مرة أخرى.';

  @override
  String get errorTimeout =>
      'استغرق الطلب وقتاً أطول من المتوقع. حاول مرة أخرى.';

  @override
  String get errorServer => 'حدث خطأ في الخادم. يرجى المحاولة مرة أخرى لاحقاً.';

  @override
  String get errorNotFound => 'تعذر العثور على البيانات المطلوبة.';

  @override
  String get errorSessionExpired =>
      'انتهت جلسة تسجيل الدخول. يرجى تسجيل الدخول مرة أخرى.';

  @override
  String get errorNoPermission => 'ليس لديك صلاحية لتنفيذ هذا الإجراء.';

  @override
  String get noMoreResultsText => 'لا توجد نتائج إضافية';

  @override
  String get retryButton => 'إعادة المحاولة';

  @override
  String get warehouseSelectionTitle => 'اختر المستودع';

  @override
  String get selectWarehouseButton => 'اختيار';

  @override
  String get noWarehousesAvailable => 'لا توجد مستودعات متاحة حالياً.';

  @override
  String warehouseSelectedMessage(String name) {
    return 'تم اختيار $name. كتالوج المنتجات قادم قريباً.';
  }

  @override
  String warehousesAvailableSubtitle(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count مستودع متاح لصيدليتك',
      many: '$count مستودعاً متاحاً لصيدليتك',
      few: '$count مستودعات متاحة لصيدليتك',
      two: 'مستودعان متاحان لصيدليتك',
      one: 'مستودع واحد متاح لصيدليتك',
      zero: 'لا توجد مستودعات متاحة لصيدليتك',
    );
    return '$_temp0';
  }

  @override
  String get searchWarehouseHint => 'ابحث عن مستودع أو مدينة';

  @override
  String get noSearchResultsFound => 'لا توجد نتائج مطابقة لبحثك.';

  @override
  String get warehouseProfileButtonLabel => 'الملف التعريفي';

  @override
  String get warehousesScopeMyCity => 'مدينتي';

  @override
  String get warehousesScopeAllCities => 'كل المدن';

  @override
  String get viewAllCitiesButton => 'عرض كل المدن';

  @override
  String get noWarehousesInYourCity => 'لا توجد مستودعات في مدينتك';

  @override
  String get noWarehousesInYourCitySubtitle =>
      'جرّب توسيع البحث ليشمل مدناً أخرى.';

  @override
  String get noManufacturersFound =>
      'لا توجد شركات مصنّعة متاحة بهذا المستودع.';

  @override
  String manufacturersCountSubtitle(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count شركة مصنّعة',
      many: '$count شركة مصنّعة',
      few: '$count شركات مصنّعة',
      two: 'شركتان مصنّعتان',
      one: 'شركة مصنّعة واحدة',
      zero: 'لا توجد شركات مصنّعة',
    );
    return '$_temp0';
  }

  @override
  String companyDiscountValue(String percent) {
    return 'خصم الشركة: $percent٪';
  }

  @override
  String get warehouseProfileTooltip => 'معلومات المستودع';

  @override
  String get deliveryInfoTitle => 'معلومات التوصيل';

  @override
  String deliveryHoursValue(String start, String end) {
    return 'من $start إلى $end';
  }

  @override
  String get deliveryHoursNotSet => 'غير محدّدة';

  @override
  String get deliveryTypeSelfLabel => 'توصيل خاص بالمستودع';

  @override
  String get deliveryTypeThirdPartyLabel => 'شركة توصيل خارجية';

  @override
  String get deliveryInfoDisclaimer =>
      'هذه المعلومات للعرض فقط، ولا تمنع تقديم الطلب.';

  @override
  String get warehouseReviewsTitle => 'التقييمات';

  @override
  String get noWarehouseReviewsYet => 'لا تقييمات بعد.';

  @override
  String get anonymousReviewerName => 'مستخدم';

  @override
  String get browseWarehouseProductsButton => 'تصفح منتجات هذا المستودع';

  @override
  String get searchProductsHint => 'ابحث بالاسم أو الشركة المصنعة';

  @override
  String get searchWarehouseProductsHint => 'ابحث في كل أصناف المستودع';

  @override
  String get addToCartButton => 'إضافة';

  @override
  String get unavailableLabel => 'غير متوفر';

  @override
  String offlineBannerMessage(String time) {
    return 'لا يوجد اتصال - تُعرض النسخة المحفوظة على هاتفك من $time. قد تكون الأسعار والتوفر تغيّرت، وإرسال الطلب يحتاج اتصالاً.';
  }

  @override
  String offlineToastMessage(String time) {
    return 'لا يوجد اتصال - تُعرض النسخة المحفوظة ($time)';
  }

  @override
  String productionDateShort(String date) {
    return 'إنتاج $date';
  }

  @override
  String expiryDateShort(String date) {
    return 'انتهاء $date';
  }

  @override
  String bonusInsteadOf(String tiers, String regular) {
    return 'بونص $tiers بدل $regular';
  }

  @override
  String get alternativesLink => 'البدائل';

  @override
  String get alternativesTitle => 'البدائل';

  @override
  String get alternativesSubtitle => 'نفس المادة الفعالة والعيار والشكل';

  @override
  String get alternativesEmpty => 'لا توجد بدائل في هذا المستودع.';

  @override
  String get alternativesHereTitle => 'في هذا المستودع';

  @override
  String get alternativesNoneEverywhere =>
      'لا توجد بدائل له في هذا المستودع ولا في غيره.';

  @override
  String get alternativesElsewhereTitle => 'في مستودعات أخرى';

  @override
  String get alternativesElsewhereHint =>
      'اضغط على أي منها للانتقال إلى مستودعه.';

  @override
  String get alternativesSameMedicine => 'نفس الدواء';

  @override
  String get alternativesGoToWarehouse => 'انتقل إلى المستودع';

  @override
  String get offerBadgeLabel => 'عرض';

  @override
  String get toggleDensityTooltip => 'تبديل طريقة العرض';

  @override
  String get noProductsFound => 'لم يتم العثور على منتجات.';

  @override
  String catalogItemsCountSubtitle(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count صنف',
      many: '$count صنفاً',
      few: '$count أصناف',
      two: 'صنفان',
      one: 'صنف واحد',
      zero: 'لا توجد أصناف',
    );
    return '$_temp0';
  }

  @override
  String get currencySuffix => 'ل.س';

  @override
  String addedToCartMessage(String name) {
    return 'تمت إضافة $name إلى السلة.';
  }

  @override
  String get cartTitle => 'السلة';

  @override
  String get cartEmptyMessage => 'سلتك فارغة.';

  @override
  String get cartEmptyHint => 'اختر مستودعاً وابدأ بإضافة الأدوية إلى سلتك.';

  @override
  String get browseCatalogButton => 'تصفّح المنتجات';

  @override
  String get quantityLabel => 'الكمية';

  @override
  String get decreaseQuantityLabel => 'إنقاص الكمية';

  @override
  String get increaseQuantityLabel => 'زيادة الكمية';

  @override
  String get notesLabel => 'ملاحظات (اختياري)';

  @override
  String get subtotalLabel => 'المجموع';

  @override
  String get submitOrderButton => 'إرسال الطلب';

  @override
  String get submitOrderTitle => 'إرسال الطلب؟';

  @override
  String submitOrderConfirmation(String warehouseName) {
    return 'إرسال هذا الطلب إلى $warehouseName؟';
  }

  @override
  String get orderSubmittedTitle => 'تم إرسال الطلب';

  @override
  String orderSubmittedMessage(String orderNumber) {
    return 'تم إرسال طلبك رقم $orderNumber.';
  }

  @override
  String get removeItemTitle => 'إزالة العنصر؟';

  @override
  String removeItemConfirmation(String name) {
    return 'إزالة $name من سلتك؟';
  }

  @override
  String get removeButton => 'إزالة';

  @override
  String get clearCartButton => 'مسح السلة';

  @override
  String get clearCartTitle => 'مسح السلة؟';

  @override
  String get clearCartConfirmation => 'هل أنت متأكد من مسح جميع محتويات السلة؟';

  @override
  String get cartIconTooltip => 'السلة';

  @override
  String get reorderButton => 'إعادة الطلب';

  @override
  String get addProductButton => 'إضافة منتج';

  @override
  String get reorderReplaceCartTitle => 'استبدال السلة؟';

  @override
  String get reorderReplaceCartMessage =>
      'سيتم استبدال سلتك الحالية بمنتجات هذا الطلب. لا يزال بإمكانك تعديل كل شيء قبل تأكيد الطلب.';

  @override
  String get reorderReplaceCartConfirm => 'استبدال السلة';

  @override
  String get reorderUnavailableTitle => 'بعض المنتجات غير متوفرة';

  @override
  String get reorderNoItemsMessage =>
      'لم يعد أي من منتجات هذا الطلب متوفراً لدى هذا المستودع.';

  @override
  String reorderSomeItemsUnavailable(String names) {
    return 'هذه المنتجات لم يعد المستودع يبيعها ولم تُضَف: $names';
  }

  @override
  String get advertisementsSectionTitle => 'سلات خاصة';

  @override
  String get advertisementPackageTotal => 'سعر السلة';

  @override
  String advertisementSavingPercent(int percent) {
    return 'توفير $percent٪';
  }

  @override
  String advertisementProductCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count منتج',
      few: '$count منتجات',
      two: 'منتجان',
      one: 'منتج واحد',
    );
    return '$_temp0';
  }

  @override
  String advertisementItemQuantity(int count) {
    return '× $count';
  }

  @override
  String get packageBadge => 'سلة';

  @override
  String get packageCopiesLabel => 'نسخة من السلة';

  @override
  String get advertisementDiscountLabel => 'حسم السلة';

  @override
  String get advertisementTotalToPay => 'المبلغ المطلوب';

  @override
  String get advertisementAddToCartButton => 'إضافة إلى السلة';

  @override
  String get advertisementReplaceCartTitle => 'استبدال السلة؟';

  @override
  String get advertisementReplaceCartMessage =>
      'سيتم استبدال محتوى سلتك الحالية بمحتوى هذه السلة الجاهزة. يمكنك تعديل كل شيء قبل إتمام الطلب.';

  @override
  String get advertisementReplaceCartConfirm => 'استبدال السلة';

  @override
  String get advertisementUnavailableTitle => 'السلة غير متاحة';

  @override
  String get advertisementUnavailableMessage =>
      'لم تعد هذه السلة متاحة. ربما انتهت مدتها أو تم سحبها.';

  @override
  String get packageUnavailableBanner =>
      'هذه السلة لم تعد متاحة، لن تتمكن من إتمام الطلب بها.';

  @override
  String packageUnavailableCheckoutMessage(String names) {
    return 'لم تعد متاحة: $names. لم يتم إرسال الطلب — احذفها من السلة للمتابعة.';
  }

  @override
  String get errorPackageUnavailable => 'هذه السلة لم تعد متاحة.';

  @override
  String get errorIdempotencyKeyReused =>
      'سُجّل طلب من هذه السلة في محاولة سابقة قبل أن تعدّلها. راجع طلباتي، ثم أعد الإرسال لتسجيل السلة المعدّلة كطلب جديد.';

  @override
  String get removeUnavailablePackagesButton => 'حذف من السلة';

  @override
  String advertisementIncompleteMessage(String names) {
    return 'بعض منتجات هذه السلة لم يعد المستودع يبيعها، لذلك لا يمكن إضافتها: $names';
  }

  @override
  String get advertisementPackageBrokenMessage =>
      'حذف منتج يُبطل سعر السلة. تُحتسب المنتجات المتبقية بسعرها العادي.';

  @override
  String get advertisementsLoading => 'جارٍ تحميل السلات...';

  @override
  String get advertisementsEmpty => 'لا توجد سلات متاحة حالياً.';

  @override
  String get advertisementsError => 'تعذّر تحميل السلات.';

  @override
  String get notificationsTitle => 'الإشعارات';

  @override
  String get noNotificationsYet => 'لا توجد إشعارات بعد';

  @override
  String get noNotificationsYetHint => 'ستظهر هنا تحديثات الطلبات والعروض.';

  @override
  String get markAllAsRead => 'تعليم الكل كمقروء';

  @override
  String get errorInvalidRequest =>
      'هناك خطأ في هذا الطلب. يرجى المحاولة مرة أخرى.';

  @override
  String get errorQuantityTooLarge =>
      'لا يمكن أن تتجاوز كمية الصنف الواحد 10,000 قطعة في الطلب. يرجى تقليل الكمية.';

  @override
  String get errorInvalidCredentials => 'رقم الهاتف أو كلمة المرور غير صحيحة.';

  @override
  String get errorAccountBlocked => 'تم حظر هذا الحساب. يرجى التواصل مع الدعم.';

  @override
  String get errorAccountNotFound =>
      'لا يوجد حساب مرتبط بهذا الرقم. يرجى إنشاء حساب أولاً.';

  @override
  String get errorPharmacyNotFound =>
      'لم نتمكن من العثور على ملف صيدليتك. يرجى التواصل مع الدعم.';

  @override
  String get errorWarehouseNotFound => 'هذا المستودع لم يعد متاحاً.';

  @override
  String get errorExchangeRateUnavailable =>
      'تعذّر تأكيد الأسعار حالياً. يرجى المحاولة بعد قليل.';

  @override
  String get errorStockCheckFailedGeneric =>
      'بعض العناصر في سلتك لم تعد متاحة كما طُلب.';

  @override
  String errorProductUnavailable(String name) {
    return '$name غير متوفر حالياً.';
  }

  @override
  String errorProductNotFound(String name) {
    return '$name لم يعد متوفراً.';
  }

  @override
  String get errorPriceChangedGeneric => 'تغيّرت بعض الأسعار في سلتك.';

  @override
  String get errorBonusChangedGeneric =>
      'تغيّر البونص على بعض الأصناف في سلتك.';

  @override
  String bonusValue(String tiers) {
    return 'بونص $tiers';
  }

  @override
  String freeUnits(int count) {
    return '+$count مجاناً';
  }

  @override
  String get noBonus => 'بدون بونص';

  @override
  String bonusChangedLine(String name, String bonus) {
    return '$name: $bonus';
  }

  @override
  String errorPriceChanged(String name, String newPrice, String oldPrice) {
    return 'أصبح سعر $name $newPrice (كان $oldPrice).';
  }

  @override
  String get priceChangedConfirmHint =>
      'أرسل الطلب مرة أخرى لتأكيده بالأسعار الجديدة.';

  @override
  String get errorRateChangedTitle => 'تغيّر سعر الصرف';

  @override
  String rateChangedTotals(String newTotal, String oldTotal) {
    return 'مجموع طلبك بالسعر الجديد $newTotal بدل $oldTotal.';
  }

  @override
  String get rateChangedConfirmHint =>
      'أرسل الطلب مرة أخرى لتأكيده بالسعر الجديد.';

  @override
  String get thisItemFallback => 'هذا العنصر';

  @override
  String get loading => 'جارِ التحميل...';

  @override
  String get orderTrackingTitle => 'تتبع الطلب';

  @override
  String orderNumberLabel(String number) {
    return 'الطلب رقم $number';
  }

  @override
  String get stageSent => 'تم الإرسال';

  @override
  String get stageUnderReview => 'بانتظار الموافقة';

  @override
  String get stagePreparing => 'قيد التحضير';

  @override
  String get stageOutForDelivery => 'في الطريق';

  @override
  String get stageDelivered => 'تم التسليم';

  @override
  String get stageCancelled => 'ملغى';

  @override
  String get stageModified => 'تم تعديل الطلب';

  @override
  String get stageUnderReviewDesc => 'وصل طلبك إلى المستودع';

  @override
  String get stagePreparingDesc => 'المستودع يجهّز طلبك';

  @override
  String get stageOutForDeliveryDesc => 'خرج طلبك من المستودع';

  @override
  String get stageDeliveredDesc => 'تم استلام الطلب';

  @override
  String get statusHistoryTitle => 'سجل الحالة';

  @override
  String lastUpdatedLabel(String time) {
    return 'آخر تحديث: $time';
  }

  @override
  String get cancelOrderTitle => 'إلغاء الطلب؟';

  @override
  String get cancelOrderConfirmation => 'هل أنت متأكد من إلغاء هذا الطلب؟';

  @override
  String get cancelOrderButton => 'إلغاء الطلب';

  @override
  String get orderCancelledMessage => 'تم إلغاء هذا الطلب.';

  @override
  String get contactWarehouseForChanges =>
      'لأي تغييرات الآن، يرجى التواصل مع المستودع مباشرة.';

  @override
  String get orderModifiedBannerTitle => 'تم تعديل هذا الطلب من قبل المستودع';

  @override
  String get errorOrderNotFound => 'تعذر العثور على هذا الطلب.';

  @override
  String get errorOrderNotCancellable =>
      'لم يعد بالإمكان إلغاء هذا الطلب من التطبيق.';

  @override
  String get myOrdersTitle => 'طلباتي';

  @override
  String myOrdersCountSubtitle(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count طلب · اسحب للأسفل للتحديث',
      many: '$count طلباً · اسحب للأسفل للتحديث',
      few: '$count طلبات · اسحب للأسفل للتحديث',
      two: 'طلبان · اسحب للأسفل للتحديث',
      one: 'طلب واحد · اسحب للأسفل للتحديث',
      zero: 'لا طلبات بعد',
    );
    return '$_temp0';
  }

  @override
  String get refreshTooltip => 'تحديث';

  @override
  String get noOrdersYet => 'لم تقم بأي طلبات بعد.';

  @override
  String get browseWarehousesButton => 'تصفّح المستودعات';

  @override
  String get invoiceTitle => 'أصناف الطلب';

  @override
  String get discountLabel => 'الخصم';

  @override
  String get invoiceTotalLabel => 'الإجمالي';

  @override
  String youSavedLabel(String amount) {
    return '💰 وفّرت $amount';
  }

  @override
  String totalSavingsLabel(String amount) {
    return '💰 إجمالي التوفير: $amount (شامل خصم العروض وحسم الشركة المصنّعة)';
  }

  @override
  String get returnsTitle => 'المرتجعات';

  @override
  String returnsCountSubtitle(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count طلب إرجاع',
      many: '$count طلب إرجاع',
      few: '$count طلبات إرجاع',
      two: 'طلبا إرجاع',
      one: 'طلب إرجاع واحد',
      zero: 'لا طلبات إرجاع',
    );
    return '$_temp0';
  }

  @override
  String get noReturnsYet => 'لم تقدّم أي طلب إرجاع بعد.';

  @override
  String get noReturnsYetHint =>
      'عند تقديم طلب إرجاع على طلب تم تسليمه، سيظهر هنا لتتابع حالته.';

  @override
  String get noReturnableOrdersTitle => 'لا توجد طلبات مؤهلة للإرجاع';

  @override
  String get myReturnsListSectionTitle => 'طلبات الإرجاع الخاصة بك';

  @override
  String get newReturnRequestButton => 'طلب مرتجع جديد';

  @override
  String get selectOrderForReturnTitle =>
      'اختر الطلب الذي تريد إرجاع أصناف منه';

  @override
  String get noEligibleOrdersForReturn =>
      'لا توجد طلبات مسلّمة حالياً يمكن طلب إرجاع لها.';

  @override
  String get requestReturnTitle => 'طلب إرجاع';

  @override
  String get requestReturnButton => 'إرسال طلب الإرجاع';

  @override
  String get requestReturnAction => 'طلب مرتجع';

  @override
  String get accountHistoryTitle => 'سجل الحسابات';

  @override
  String get moneySavedTitle => 'المبلغ الذي وفرته عبر تطبيقنا';

  @override
  String get fromDiscountsLabel => 'من الخصومات';

  @override
  String get debtsTitle => 'الديون';

  @override
  String get outstandingBalanceLabel => 'الرصيد المستحق';

  @override
  String get viewReturnsLabel => 'عرض المرتجعات';

  @override
  String returnsRequestsShort(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count طلب',
      many: '$count طلباً',
      few: '$count طلبات',
      two: 'طلبان',
      one: 'طلب واحد',
      zero: 'لا طلبات',
    );
    return '$_temp0';
  }

  @override
  String get returnQuantityLabel => 'الكمية';

  @override
  String get returnReasonLabel => 'السبب';

  @override
  String get reasonDamaged => 'تالف';

  @override
  String get reasonWrongItem => 'منتج خاطئ';

  @override
  String get reasonOther => 'سبب آخر';

  @override
  String get multipleReasonsLabel => 'أسباب متعددة';

  @override
  String get customReasonLabel => 'يرجى التوضيح';

  @override
  String get returnSubmittedTitle => 'تم إرسال الطلب';

  @override
  String get returnSubmittedMessage =>
      'تم إرسال طلب الإرجاع. سيقوم المستودع بمراجعته.';

  @override
  String get returnStatusPending => 'قيد المراجعة';

  @override
  String get returnStatusApproved => 'تمت الموافقة';

  @override
  String get returnStatusRejected => 'مرفوض';

  @override
  String get returnPickItemsLabel => 'اختر الأصناف التي تريد إرجاعها';

  @override
  String get returnRejectionNoteLabel => 'سبب الرفض';

  @override
  String returnCreditedLabel(String amount) {
    return 'تمت إضافته لحسابك: $amount';
  }

  @override
  String get editButton => 'تعديل';

  @override
  String get deleteReturnButton => 'حذف';

  @override
  String get deleteReturnConfirmTitle => 'حذف طلب الإرجاع؟';

  @override
  String get deleteReturnConfirmMessage => 'هل أنت متأكد من حذف طلب الإرجاع؟';

  @override
  String get returnApprovedBanner =>
      'تمت الموافقة على المرتجع — تمت إضافة المبلغ إلى حسابك';

  @override
  String get returnPendingReviewBanner =>
      'تم إرسال طلب الإرجاع، بانتظار مراجعة المستودع';

  @override
  String get returnRejectedBanner => 'تم رفض المرتجع';

  @override
  String get errorOrderNotDelivered => 'لم يتم تسليم هذا الطلب بعد.';

  @override
  String get errorOrderNotReorderable =>
      'يمكن إعادة طلب الطلبات المُسلَّمة فقط.';

  @override
  String get errorOrderItemNotFound => 'تعذر العثور على هذا الصنف ضمن الطلب.';

  @override
  String get errorReturnQuantityExceeded =>
      'كمية الإرجاع تتجاوز الكمية المتاحة لإرجاعها لهذا الصنف.';

  @override
  String get errorCustomReasonRequired => 'يرجى وصف سبب الإرجاع.';

  @override
  String get errorTooManyReturnPhotos => 'يمكنك إرفاق 5 صور كحد أقصى.';

  @override
  String get errorInvalidReturnPhoto => 'إحدى الصور المرفقة ليست صورة صالحة.';

  @override
  String get errorReturnAlreadyExists =>
      'تم إرسال طلب إرجاع لهذا الطلب من قبل.';

  @override
  String get errorReturnNotEditable =>
      'تم اتخاذ قرار بخصوص طلب الإرجاع هذا ولم يعد بالإمكان تعديله.';

  @override
  String get errorReturnItemsEmpty => 'يرجى اختيار صنف واحد على الأقل للإرجاع.';

  @override
  String get errorDuplicateReturnItem =>
      'يمكن أن يظهر كل صنف مرة واحدة فقط في طلب الإرجاع.';

  @override
  String get errorRejectionNoteRequired => 'يرجى توضيح سبب رفض هذا المرتجع.';

  @override
  String get returnPhotosLabel => 'صور (اختياري)';

  @override
  String get returnPhotosHint =>
      'يمكنك إرفاق صور للمنتج تساعد المستودع على التحقق من السبب';

  @override
  String get addPhotoButton => 'إضافة صورة';

  @override
  String get cameraOption => 'التقاط صورة';

  @override
  String get galleryOption => 'اختيار من المعرض';

  @override
  String get permissionRequiredTitle => 'الصلاحية مطلوبة';

  @override
  String get cameraPermissionDenied =>
      'نحتاج صلاحية الكاميرا لالتقاط صورة. يمكنك تفعيلها من الإعدادات.';

  @override
  String get openSettings => 'فتح الإعدادات';

  @override
  String get navWarehouses => 'المستودعات';

  @override
  String get navAccounts => 'الحسابات';

  @override
  String get showPassword => 'إظهار كلمة المرور';

  @override
  String get hidePassword => 'إخفاء كلمة المرور';

  @override
  String get increaseQuantity => 'زيادة الكمية';

  @override
  String get decreaseQuantity => 'إنقاص الكمية';

  @override
  String get navOrders => 'طلباتي';

  @override
  String get profileTitle => 'الملف الشخصي';

  @override
  String get personalInfoTitle => 'المعلومات الشخصية';

  @override
  String get cityLabel => 'المدينة';

  @override
  String get logoutConfirmTitle => 'تسجيل الخروج؟';

  @override
  String get logoutConfirmMessage => 'هل أنت متأكد من تسجيل الخروج؟';

  @override
  String get dangerZoneTitle => 'منطقة الخطر';

  @override
  String get deleteAccount => 'حذف الحساب';

  @override
  String get deleteAccountSubtitle => 'حذف حسابك نهائياً';

  @override
  String get deleteAccountConfirmTitle => 'حذف الحساب نهائياً؟';

  @override
  String get deleteAccountConfirmMessage =>
      'سيتم حذف حسابك نهائياً ولن تتمكن من تسجيل الدخول مرة أخرى، ولا يمكن التراجع عن هذه الخطوة.\n\nستبقى طلباتك وسجلاتك المالية السابقة ضمن سجلّات المستودعات التي تعاملت معها.\n\nأدخل كلمة المرور للتأكيد.';

  @override
  String get deleteAccountPasswordLabel => 'كلمة المرور';

  @override
  String get deleteAccountPasswordRequired => 'أدخل كلمة المرور للمتابعة.';

  @override
  String get deleteAccountConfirmAction => 'حذف نهائي';

  @override
  String get deleteAccountSuccess => 'تم حذف حسابك.';

  @override
  String get errorPhoneAlreadyRegistered =>
      'يوجد حساب مسجّل بهذا الرقم. سجّل الدخول بدل إنشاء حساب جديد.';

  @override
  String get errorInvalidCurrentPassword => 'كلمة المرور غير صحيحة.';

  @override
  String get yourRatingTitle => 'تقييمك';

  @override
  String get ratingsTitle => 'التقييمات';

  @override
  String get viewRatingsLabel => 'عرض التقييمات';

  @override
  String get noRatingsYet => 'لم يقيّمك أي مستودع حتى الآن.';

  @override
  String ratingSummary(String average, String count) {
    return '$average بالمعدل ($count تقييم)';
  }

  @override
  String get myDebtsTitle => 'ديوني';

  @override
  String get noDebtsYet => 'لا توجد ديون حالياً.';

  @override
  String get totalDebtsLabel => 'إجمالي الديون';

  @override
  String get totalOrdersLabel => 'إجمالي الطلبات';

  @override
  String get totalPaidLabel => 'إجمالي المدفوع';

  @override
  String get currentBalanceLabel => 'الدين الحالي';

  @override
  String get creditBalanceLabel => 'رصيد لصالحك';

  @override
  String get deliveredOrdersTitle => 'الطلبات المسلّمة';

  @override
  String get paymentsTitle => 'الدفعات';

  @override
  String get noPaymentsYet => 'لا توجد دفعات مسجّلة.';

  @override
  String get rateWarehouseTitle => 'قيّم المستودع';

  @override
  String get rateWarehouseCommentLabel => 'تعليق (اختياري)';

  @override
  String get submitReviewButton => 'إرسال التقييم';

  @override
  String get submitReviewConfirmTitle => 'إرسال التقييم؟';

  @override
  String get submitReviewConfirmMessage =>
      'لن تتمكن من تعديل هذا التقييم بعد إرساله. متابعة؟';

  @override
  String reviewThankYouTitle(String rating) {
    return 'شكراً — قيّمت هذا الطلب بـ $rating نجوم';
  }

  @override
  String get errorAlreadyReviewed => 'تم تقييم هذا الطلب من قبل.';

  @override
  String minOrderLabel(String amount) {
    return 'الحد الأدنى للطلب: $amount';
  }

  @override
  String maxOrderLabel(String amount) {
    return 'الحد الأقصى للطلب: $amount';
  }

  @override
  String addMoreToReachMinimum(String amount) {
    return 'أضف $amount للوصول إلى الحد الأدنى';
  }

  @override
  String removeToMeetMaximum(String amount) {
    return 'تجاوزت الحد الأقصى $amount، احذف بعض الأصناف';
  }

  @override
  String orderBelowMinimum(String amount) {
    return 'الحد الأدنى للطلب من هذا المستودع هو $amount.';
  }

  @override
  String orderAboveMaximum(String amount) {
    return 'الحد الأقصى للطلب من هذا المستودع هو $amount.';
  }

  @override
  String get loadingOrderLimits => 'جارٍ تحديث حدود الطلب';

  @override
  String get returnableSectionTitle => 'طلبات مؤهلة للإرجاع';

  @override
  String get returnableSectionSubtitle =>
      'يمكنك تقديم طلب إرجاع خلال 24 ساعة من التسليم';

  @override
  String returnableDeliveredOnLabel(String date) {
    return 'سُلّم بتاريخ $date';
  }

  @override
  String returnableOrderNumber(String number) {
    return 'طلب رقم $number';
  }

  @override
  String returnableHoursLeft(String hours) {
    return 'المتبقي $hours ساعة';
  }

  @override
  String get returnableEndingSoon => 'ينتهي قريباً';

  @override
  String get returnableRequestButton => 'طلب إرجاع';

  @override
  String returnableMoreItems(String count) {
    return '+$count أصناف أخرى';
  }

  @override
  String get returnWindowExpired =>
      'يجب تقديم طلب الإرجاع خلال 24 ساعة من التسليم.';

  @override
  String get privacyPolicy => 'سياسة الخصوصية';

  @override
  String privacyPolicyLastUpdated(String date) {
    return 'آخر تحديث: $date';
  }

  @override
  String get complaintsTitle => 'الشكاوى';

  @override
  String get complaintsProfileSubtitle =>
      'قدّم شكوى بخصوص أحد المستودعات وتابع حالتها';

  @override
  String complaintsCountSubtitle(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count شكوى',
      many: '$count شكوى',
      few: '$count شكاوى',
      two: 'شكويان',
      one: 'شكوى واحدة',
      zero: 'لا توجد شكاوى بعد',
    );
    return '$_temp0';
  }

  @override
  String get noComplaintsYet => 'لم تقدّم أي شكوى بعد.';

  @override
  String get noComplaintsYetHint =>
      'إذا واجهت مشكلة مع أحد المستودعات، يمكنك تقديم شكوى لتقوم الإدارة بمراجعتها.';

  @override
  String get submitComplaintCta => 'تقديم شكوى';

  @override
  String get submitComplaintTitle => 'تقديم شكوى';

  @override
  String get submitComplaintButton => 'إرسال الشكوى';

  @override
  String get complaintSubmittedMessage =>
      'تم تقديم شكواك بنجاح. ستقوم الإدارة بمراجعتها.';

  @override
  String get complaintWarehouseLabel => 'المستودع';

  @override
  String get complaintWarehouseHint => 'اختر المستودع المعني بالشكوى';

  @override
  String get complaintSubjectLabel => 'عنوان الشكوى';

  @override
  String get complaintSubjectHint => 'لخّص المشكلة بجملة قصيرة';

  @override
  String get complaintDescriptionLabel => 'تفاصيل الشكوى';

  @override
  String get complaintDescriptionHint => 'اشرح المشكلة بالتفصيل';

  @override
  String get complaintOrderNumberLabel => 'رقم الطلب المرتبط (اختياري)';

  @override
  String get complaintOrderNumberHint =>
      'أدخل رقم الطلب إذا كانت الشكوى تتعلق بطلب معيّن';

  @override
  String get complaintExtraDetailsLabel => 'تفاصيل إضافية (اختياري)';

  @override
  String get complaintExtraDetailsHint =>
      'أي معلومات أخرى قد تساعد في حل الشكوى';

  @override
  String get complaintFormFooterHint =>
      'تُرفق معلومات المستودع بشكواك تلقائياً.';

  @override
  String get complaintDetailTitle => 'تفاصيل الشكوى';

  @override
  String get complaintYourComplaintTitle => 'نص شكواك';

  @override
  String get complaintResponseTitle => 'الرد';

  @override
  String complaintNumberLabel(String number) {
    return 'شكوى رقم $number';
  }

  @override
  String complaintFiledOnLabel(String date) {
    return 'قُدِّمت بتاريخ $date';
  }

  @override
  String complaintRelatedOrderLabel(String number) {
    return 'الطلب المرتبط: رقم $number';
  }

  @override
  String get complaintAboutWarehouseLabel => 'بخصوص هذا المستودع';

  @override
  String get complaintHasResponseHint => 'تم الرد';

  @override
  String get complaintNoResponseYet =>
      'لم تردّ الإدارة بعد. سيصلك إشعار فور توفّر الرد.';

  @override
  String get complaintAdminResponseLabel => 'رد الإدارة';

  @override
  String complaintRespondedOnLabel(String date) {
    return 'تم الرد بتاريخ $date';
  }

  @override
  String complaintRespondedByLabel(String name) {
    return 'بواسطة $name';
  }

  @override
  String get complaintStatusPending => 'قيد الانتظار';

  @override
  String get complaintStatusInReview => 'قيد المراجعة';

  @override
  String get complaintStatusResolved => 'تم الحل';

  @override
  String get complaintStatusClosed => 'مغلقة';

  @override
  String get errorComplaintWarehouseRequired =>
      'يرجى اختيار المستودع المعني بالشكوى.';

  @override
  String get errorComplaintSubjectRequired => 'يرجى إدخال عنوان للشكوى.';

  @override
  String get errorComplaintDescriptionRequired => 'يرجى كتابة تفاصيل الشكوى.';

  @override
  String get errorComplaintOrderNotFound =>
      'لا يوجد طلب بهذا الرقم لدى هذا المستودع.';

  @override
  String get errorComplaintTooLong =>
      'أحد الحقول أطول من المسموح. يرجى اختصاره.';

  @override
  String get errorComplaintNotFound => 'تعذّر العثور على هذه الشكوى.';

  @override
  String get errorComplaintContextMismatch =>
      'لا يمكن ربط هذه الشكوى بذلك المستودع.';

  @override
  String get submitComplaintOnWarehouseTitle => 'شكوى على المستودع';

  @override
  String get submitComplaintAboutOrderTitle => 'شكوى حول الطلب';

  @override
  String get complaintContextGeneral => 'شكوى عامة';

  @override
  String get complaintGeneralContextNote =>
      'هذه الشكوى لا ترتبط بمستودع أو طلب محدّد.';

  @override
  String get complaintOnWarehouseLabel => 'الشكوى على';

  @override
  String get complaintAboutOrderLabel => 'الشكوى حول الطلب';

  @override
  String complaintOrderWarehouseLine(String name) {
    return 'المستودع: $name';
  }

  @override
  String get submitComplaintOnWarehouseCta => 'تقديم شكوى على هذا المستودع';

  @override
  String get submitComplaintAboutOrderCta => 'تقديم شكوى حول هذا الطلب';

  @override
  String get orderComplaintsSectionTitle => 'الشكاوى المتعلقة بهذا الطلب';

  @override
  String get orderComplaintsEmptyPrompt =>
      'لديك مشكلة بهذا الطلب؟ يمكنك تقديم شكوى وستراجعها الإدارة.';

  @override
  String get updateAvailable => 'يتوفر تحديث جديد';

  @override
  String get updateAvailableMessage =>
      'يتوفر إصدار جديد من Feniq. قم بالتحديث للحصول على أحدث الميزات والتحسينات.';

  @override
  String get updateRequired => 'تحديث إجباري';

  @override
  String get updateRequiredMessage =>
      'إصدار التطبيق الحالي لم يعد مدعوماً. يرجى تحديث التطبيق للمتابعة.';

  @override
  String get updateNow => 'تحديث الآن';

  @override
  String get later => 'لاحقاً';

  @override
  String get updateOpenStoreFailed =>
      'تعذر تنزيل التحديث أو فتح مثبت أندرويد. تحقق من الاتصال والمساحة المتاحة وأعد المحاولة.';

  @override
  String get deliverySealRequiredTitle => 'تأكيد التسليم';

  @override
  String get deliverySealRequiredMessage =>
      'يطلب هذا المستودع صورة لختم الشحنة قبل إتمام الطلب. التقط صورة واضحة للختم على الطرد.';

  @override
  String get takeSealPhoto => 'إضافة صورة الختم';

  @override
  String get retakeSealPhoto => 'إعادة التقاط الصورة';

  @override
  String get confirmDeliveryButton => 'تأكيد التسليم';

  @override
  String get sealPhotoLabel => 'صورة ختم التسليم';

  @override
  String deliverySealConfirmedOn(String date) {
    return 'تم تأكيد التسليم بتاريخ $date';
  }

  @override
  String get errorDeliverySealPhotoRequired =>
      'يلزم إرفاق صورة الختم لتأكيد التسليم.';

  @override
  String get errorInvalidDeliverySealPhoto =>
      'هذا الملف ليس صورة صالحة. الرجاء اختيار صورة أخرى.';

  @override
  String get errorOrderNotAwaitingDelivery =>
      'هذا الطلب ليس بانتظار تأكيد التسليم حالياً.';

  @override
  String get statementTitle => 'كشف الحساب';

  @override
  String get statementEmpty => 'لا توجد حركات بعد.';

  @override
  String get statementOpening => 'الرصيد الافتتاحي';

  @override
  String get statementCharges => 'إجمالي المطالبات';

  @override
  String get statementPayments => 'المدفوع';

  @override
  String get statementReturnCredits => 'المرتجعات';

  @override
  String get statementReturnCreditApplications =>
      'استخدام رصيد مرتجع (غير نقدي)';

  @override
  String get statementKindCharge => 'تسليم طلب';

  @override
  String get statementKindChargeReversal => 'إلغاء تسليم';

  @override
  String get statementKindPayment => 'دفعة مستلمة';

  @override
  String get statementKindPaymentReversal => 'عكس دفعة';

  @override
  String get statementKindReturnCredit => 'رصيد مرتجع';

  @override
  String get statementKindReturnCreditReversal => 'عكس رصيد مرتجع';

  @override
  String get statementKindReturnCreditApplication =>
      'استخدام رصيد مرتجع (غير نقدي)';

  @override
  String get statementKindReturnCreditApplicationReversal =>
      'عكس استخدام رصيد مرتجع';

  @override
  String get statementKindManualCredit => 'إضافة رصيد';

  @override
  String get statementKindManualDebit => 'إضافة مطالبة';

  @override
  String get statementKindOther => 'تسوية';

  @override
  String statementInvoiceRef(String number) {
    return 'فاتورة INV-$number';
  }

  @override
  String statementPaymentRef(String number) {
    return 'دفعة PAY-$number';
  }

  @override
  String creditBalanceShort(String amount) {
    return 'رصيد لك: $amount';
  }

  @override
  String get navOffers => 'العروض';

  @override
  String get offersAndAdsTitle => 'العروض الاستثنائية والإعلانات';

  @override
  String promotionsCountSubtitle(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count عرض حالياً',
      many: '$count عرضاً حالياً',
      few: '$count عروض حالياً',
      two: 'عرضان حالياً',
      one: 'عرض واحد حالياً',
      zero: 'لا يوجد شيء حالياً',
    );
    return '$_temp0';
  }

  @override
  String get promotionsAllTitle => 'كل العروض الاستثنائية والسلات';

  @override
  String get promotionsFilterAllTypes => 'الكل';

  @override
  String get promotionsFilterOffers => 'عروض استثنائية';

  @override
  String get promotionsFilterPackages => 'السلات';

  @override
  String get promotionsAllWarehouses => 'كل المستودعات';

  @override
  String get promotionsWarehouseFilterTitle => 'تصفية حسب المستودع';

  @override
  String get promotionsPackageBadge => 'سلة';

  @override
  String get promotionsEmptyTitle => 'لا توجد عروض استثنائية حالياً';

  @override
  String get promotionsEmptyMessage =>
      'ستظهر هنا العروض والسلات من المستودعات.';

  @override
  String get promotionsNoFilterResults => 'لا يوجد شيء يطابق هذه التصفية.';

  @override
  String get promotionsClearFilters => 'إزالة التصفية';

  @override
  String get promotionsError => 'تعذّر تحميل العروض.';

  @override
  String offerDiscountPercent(int percent) {
    return 'خصم $percent٪';
  }

  @override
  String offerEndsOn(String date) {
    return 'حتى $date';
  }

  @override
  String get offerPermanent => 'عرض دائم';

  @override
  String get addToCartFullButton => 'إضافة إلى السلة';

  @override
  String get warehouseOffersTitle => 'العروض الاستثنائية للمستودع';

  @override
  String get discountCodeFieldLabel => 'كود الخصم';

  @override
  String get discountCodeHint => 'أدخل كود الخصم';

  @override
  String get discountCodeApply => 'تطبيق';

  @override
  String get discountCodeRemove => 'إزالة';

  @override
  String discountCodeApplied(String code) {
    return 'تم تطبيق الكود $code';
  }

  @override
  String discountCodeLine(String code) {
    return 'كود الخصم ($code)';
  }

  @override
  String get loyaltyDiscountLine => 'حسم الولاء من المستودع';

  @override
  String get creditUsedLine => 'من رصيدك عند المستودع';

  @override
  String get discountCodeUpdating => 'جارٍ تحديث الخصم';

  @override
  String get discountCodeChangedTitle => 'تغيّر كود الخصم';

  @override
  String discountCodeRemovedMessage(String reason) {
    return '$reason تمت إزالة الكود من السلة، راجع الإجمالي ثم أرسل الطلب من جديد.';
  }

  @override
  String discountCodeEditedMessage(String code, String discount, String total) {
    return 'تغيّرت قيمة كود الخصم $code. الخصم الآن $discount والإجمالي $total.';
  }

  @override
  String get errorDiscountCodeInvalid => 'كود الخصم غير صحيح.';

  @override
  String get errorDiscountCodeNotStarted => 'كود الخصم لم يبدأ بعد.';

  @override
  String get errorDiscountCodeExpired => 'انتهت صلاحية كود الخصم.';

  @override
  String get errorDiscountCodeLimitReached =>
      'وصل كود الخصم إلى الحد الأقصى من الاستخدامات.';

  @override
  String get errorDiscountCodePharmacyLimitReached =>
      'استخدمت هذا الكود العدد الأقصى المسموح لصيدليتك.';

  @override
  String get errorDiscountCodeNotForPharmacy => 'هذا الكود غير مخصص لصيدليتك.';

  @override
  String get errorDiscountCodeNotForWarehouse =>
      'هذا الكود لا يعمل على طلبات هذا المستودع.';

  @override
  String get errorDiscountCodePendingApproval =>
      'كود الخصم بانتظار موافقة الإدارة.';

  @override
  String get errorDiscountCodeStopped => 'تم إيقاف كود الخصم.';

  @override
  String get errorDiscountCodeEdited => 'تغيّرت قيمة كود الخصم.';

  @override
  String get cartQuoteUnavailable => 'تعذّر حساب الإجمالي.';

  @override
  String get changePasswordTitle => 'تغيير كلمة السر';

  @override
  String get changePasswordSubtitle => 'اختر كلمة سر جديدة لا يعرفها أحد غيرك.';

  @override
  String get changePasswordForcedMessage =>
      'تمت إعادة تعيين كلمة السر من قبل الدعم. اختر كلمة سر جديدة للمتابعة.';

  @override
  String get currentPasswordLabel => 'كلمة السر الحالية';

  @override
  String get currentPasswordForcedLabel => 'كلمة السر المؤقتة';

  @override
  String get newPasswordLabel => 'كلمة السر الجديدة';

  @override
  String get confirmNewPasswordLabel => 'تأكيد كلمة السر الجديدة';

  @override
  String get changePasswordAction => 'حفظ كلمة السر الجديدة';

  @override
  String get changePasswordSuccess =>
      'تم تغيير كلمة السر، وتم تسجيل الخروج من الأجهزة الأخرى.';

  @override
  String get newPasswordSameAsCurrent =>
      'يجب أن تختلف كلمة السر الجديدة عن الحالية.';

  @override
  String get errorPasswordUnchanged =>
      'يجب أن تختلف كلمة السر الجديدة عن الحالية.';

  @override
  String get errorPasswordMismatch => 'كلمتا المرور غير متطابقتين.';

  @override
  String get errorInvalidPassword => 'كلمة السر لا تحقق الشروط المطلوبة.';

  @override
  String get cartOtherWarehousesHint =>
      'لديك سلة لدى كل مستودع من هذه المستودعات، وتُرسل كل سلة كطلب منفصل بفاتورة خاصة:';

  @override
  String submitAllButton(int count) {
    return 'إرسال كل الطلبات ($count)';
  }

  @override
  String get submitAllTitle => 'إرسال كل الطلبات؟';

  @override
  String submitAllConfirmation(String names) {
    return 'سيُرسل طلب منفصل لكل مستودع، ولكل طلب فاتورته:\n$names';
  }

  @override
  String submitAllDone(int count) {
    return 'أُرسلت كل الطلبات ($count).';
  }

  @override
  String submitAllPartial(int sent, int total) {
    return 'أُرسل $sent من $total. بقيت الطلبات التي لم تُرسل في السلة مع بيان السبب.';
  }

  @override
  String get submitThisWarehouseOnly => 'إرسال طلب هذا المستودع فقط';

  @override
  String get exceptionalOfferBadge => 'عرض استثنائي';

  @override
  String get packageContentsTitle => 'محتوى السلة';

  @override
  String get packageFixedNote =>
      'السلة ثابتة: تُطلب كاملة كما حدّدها المستودع، ويمكنك اختيار عدد النسخ فقط.';

  @override
  String get packageShowContents => 'عرض محتوى السلة';

  @override
  String get packageAddToCart => 'إضافة إلى السلة';

  @override
  String get repNavPharmacies => 'صيدلياتي';

  @override
  String get repNavVisits => 'زياراتي';

  @override
  String get repSearchHint => 'ابحث عن صيدلية';

  @override
  String get repScanAction => 'مسح رمز الزيارة';

  @override
  String get repNoPharmaciesTitle => 'لا توجد صيدليات معيّنة لك بعد';

  @override
  String get repNoPharmaciesSubtitle =>
      'المستودع هو من يسند لك الصيدليات، وتظهر هنا فور إسنادها.';

  @override
  String get repNoSearchResults => 'لا توجد صيدلية مطابقة لبحثك';

  @override
  String get repNeverVisited => 'لم تُزَر بعد';

  @override
  String repLastVisitAgo(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: 'آخر زيارة: منذ $days يوم',
      many: 'آخر زيارة: منذ $days يوماً',
      few: 'آخر زيارة: منذ $days أيام',
      two: 'آخر زيارة: منذ يومين',
      one: 'آخر زيارة: أمس',
      zero: 'آخر زيارة: اليوم',
    );
    return '$_temp0';
  }

  @override
  String repMonthOrdersCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count طلب هذا الشهر',
      many: '$count طلباً هذا الشهر',
      few: '$count طلبات هذا الشهر',
      two: 'طلبان هذا الشهر',
      one: 'طلب واحد هذا الشهر',
      zero: 'لا طلبات هذا الشهر',
    );
    return '$_temp0';
  }

  @override
  String get repStatPharmacies => 'الصيدليات';

  @override
  String get repStatVisitsWeek => 'زيارات 7 أيام';

  @override
  String get repStatOrdersMonth => 'طلبات الشهر';

  @override
  String get repStatSalesMonth => 'قيمتها';

  @override
  String get repStatCommissionMonth => 'عمولتك هذا الشهر';

  @override
  String repCommissionHint(String rate) {
    return 'عمولتك $rate من قيمة الطلبات المسلَّمة لصيدلياتك عبر فينيق.';
  }

  @override
  String get repOwnerLabel => 'المسؤول';

  @override
  String get repCallAction => 'اتصال';

  @override
  String get repLogVisitAction => 'سجّل زيارة';

  @override
  String get repNoLocationWarning =>
      'هذه الصيدلية لم تحدد موقعها على الخريطة بعد، فلا يمكن توثيق الزيارة عندها.';

  @override
  String get repRecentOrders => 'آخر الطلبات';

  @override
  String get repNoOrdersYet => 'لا طلبات من هذه الصيدلية بعد';

  @override
  String get repRecentVisits => 'آخر زياراتك هنا';

  @override
  String get repNoVisitsHere => 'لم تزر هذه الصيدلية بعد';

  @override
  String get repVisitsTitle => 'زياراتي';

  @override
  String get repNoVisitsTitle => 'لم تسجّل أي زيارة بعد';

  @override
  String get repNoVisitsSubtitle =>
      'امسح رمز الصيدلية عند زيارتها لتسجيل الزيارة.';

  @override
  String get repVisitVerified => 'موثّقة';

  @override
  String get repVisitOutOfRange => 'خارج النطاق';

  @override
  String get repVisitMockLocation => 'موقع مزيّف';

  @override
  String get repVisitNoPharmacyLocation => 'الصيدلية دون موقع';

  @override
  String repDistanceMeters(int meters) {
    return 'على بعد $meters متر';
  }

  @override
  String get repScanTitle => 'مسح رمز الزيارة';

  @override
  String get repScanHint => 'وجّه الكاميرا نحو رمز فينيق الموجود عند الصيدلية.';

  @override
  String get repScanNotFeniq => 'هذا ليس رمز زيارة من فينيق.';

  @override
  String get repScanLocating => 'جارٍ تحديد موقعك...';

  @override
  String get repScanSubmitting => 'جارٍ تسجيل الزيارة...';

  @override
  String get repScanVerifiedTitle => 'تم توثيق الزيارة';

  @override
  String get repScanDuplicateTitle => 'سُجّلت هذه الزيارة قبل قليل';

  @override
  String get repScanUnverifiedTitle => 'سُجّلت الزيارة وهي غير موثّقة';

  @override
  String repScanOutOfRangeMessage(int meters) {
    return 'هاتفك على بعد $meters متر من الصيدلية. توجّه إلى الصيدلية وامسح الرمز مجدداً ليُوثَّق.';
  }

  @override
  String get repScanMockMessage =>
      'هاتفك يُبلّغ عن موقع مزيّف، لذلك لا يمكن توثيق الزيارة.';

  @override
  String get repScanNoLocationMessage =>
      'الصيدلية لم تحدد موقعها بعد، لذلك لا يمكن توثيق الزيارة.';

  @override
  String get repScanAnother => 'مسح رمز آخر';

  @override
  String get repScanTryAgain => 'حاول مرة أخرى';

  @override
  String get repLocationServiceOff =>
      'فعّل خدمة الموقع (GPS) في هاتفك ثم حاول مرة أخرى.';

  @override
  String get repLocationDenied => 'نحتاج إذن الموقع لتوثيق الزيارة.';

  @override
  String get repLocationDeniedForever =>
      'إذن الموقع محظور. اسمح به من إعدادات التطبيق.';

  @override
  String get repLocationUnavailable =>
      'تعذّر تحديد موقعك. تأكد أن GPS يعمل وحاول مرة أخرى.';

  @override
  String get repOpenSettings => 'فتح الإعدادات';

  @override
  String get repCameraDenied =>
      'نحتاج إذن الكاميرا لمسح الرمز. اسمح به من إعدادات التطبيق.';

  @override
  String get repCameraUnavailable => 'تعذّر تشغيل الكاميرا.';

  @override
  String get repWarehouseLabel => 'المستودع';

  @override
  String get repProfileHint =>
      'أنت مسجّل الدخول كمندوب. المستودع هو من يدير صيدلياتك.';

  @override
  String get errorRepPharmacyNotAssigned => 'هذه الصيدلية غير معيّنة لك.';

  @override
  String get errorRepVisitCodeUnknown => 'لا توجد صيدلية بهذا الرمز.';

  @override
  String get errorRepVisitCodeInvalid => 'هذا ليس رمز زيارة من فينيق.';

  @override
  String get errorRepInactive => 'أوقف المستودع حساب المندوب الخاص بك.';

  @override
  String get errorRepInvalidLocation => 'تعذّرت قراءة موقعك. حاول مرة أخرى.';

  @override
  String get pharmacyVisitCodeTitle => 'رمز الزيارة';

  @override
  String get pharmacyVisitCodeSubtitle => 'للمناديب الذين يزورونك';

  @override
  String get pharmacyVisitCodeIntro =>
      'اعرض هذا الرمز لمندوب المستودع ليمسحه عند زيارتك. تُوثَّق الزيارة فقط إذا كان هاتفه عند صيدليتك.';

  @override
  String get panelHomeTitle => 'لوحة التحكم';

  @override
  String panelHomeGreeting(String name) {
    return 'أهلاً $name';
  }

  @override
  String get panelHomeBody =>
      'افتح لوحة التحكم لإدارة العمل. ستظهر الأدوات والبيانات المتاحة حسب دور حسابك وصلاحياته.';

  @override
  String get panelHomeOpenPanel => 'افتح لوحة التحكم';

  @override
  String panelHomeOpenFailed(String url) {
    return 'تعذّر فتح اللوحة. افتح $url من المتصفح.';
  }

  @override
  String get warehouseNavOrders => 'الطلبات';

  @override
  String get warehouseNavAccount => 'الحساب';

  @override
  String get warehouseFilterAll => 'الكل';

  @override
  String get warehouseMarkDelivered => 'تم التسليم';

  @override
  String get warehouseConfirmApproveTitle => 'هل خرج الطلب للتوصيل؟';

  @override
  String warehouseConfirmApproveBody(int number) {
    return 'سيخرج الطلب رقم $number إلى الصيدلية، ولن تتمكن بعدها من تعديل أصنافه.';
  }

  @override
  String warehouseOrderTitle(int number) {
    return 'طلب رقم $number';
  }

  @override
  String warehouseOrderItemsCount(int count) {
    return 'الأصناف: $count';
  }

  @override
  String warehouseNewOrdersArrived(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'وصل $count طلب جديد',
      one: 'وصل طلب جديد',
    );
    return '$_temp0';
  }

  @override
  String get warehouseNewOrdersSeen => 'حسناً';

  @override
  String get warehouseOrderNewBadge => 'جديد';

  @override
  String get warehouseNoOrdersTitle => 'لا توجد طلبات هنا';

  @override
  String get warehouseNoOrdersSubtitle =>
      'تظهر الطلبات الجديدة هنا فور وصولها، ويصلك إشعار بها.';

  @override
  String get warehouseSectionPharmacy => 'الصيدلية';

  @override
  String get warehouseSectionItems => 'الأصناف';

  @override
  String get warehouseSectionMoney => 'المبالغ';

  @override
  String get warehouseSectionHistory => 'مراحل الطلب';

  @override
  String get warehouseSectionNotes => 'ملاحظات الصيدلية';

  @override
  String get warehouseCall => 'اتصال';

  @override
  String warehouseFreeUnits(int count) {
    return '+$count مجاناً';
  }

  @override
  String get warehousePackageLine => 'ضمن عرض';

  @override
  String get warehouseSubtotal => 'المجموع';

  @override
  String get warehouseDiscounts => 'الحسومات';

  @override
  String get warehousePharmacyPays => 'تدفع الصيدلية';

  @override
  String get warehouseFeniqShare => 'حصة فينيق';

  @override
  String get warehouseYouKeep => 'الصافي لك';

  @override
  String warehouseRepCommissionTitle(String rate) {
    return 'عمولة المندوب ($rate%)';
  }

  @override
  String get warehouseRepShare => 'للمندوب';

  @override
  String get warehouseRepSaving => 'توفير لك';

  @override
  String get warehouseEditItems => 'تعديل الأصناف';

  @override
  String get warehouseSaveEdits => 'حفظ التعديلات';

  @override
  String get warehouseRemoveLine => 'حذف';

  @override
  String get warehouseRestoreLine => 'استرجاع';

  @override
  String get warehouseEditHint =>
      'يتم تعديل العروض (الباقات) من لوحة المستودع.';

  @override
  String get warehouseAddItem => 'إضافة صنف';

  @override
  String get warehouseAddItemTitle => 'إضافة صنف إلى الطلب';

  @override
  String get warehouseAddItemSearchHint => 'ابحث باسم الصنف أو الشركة';

  @override
  String get warehouseAddItemEmpty => 'لا يوجد صنف متوفر بهذا الاسم.';

  @override
  String get warehouseAddItemFailed => 'تعذّر جلب الأصناف. حاول مرة أخرى.';

  @override
  String get warehouseAddItemOnOrder =>
      'موجود في الطلب، عدّل كميته من القائمة.';

  @override
  String get warehouseAddItemPriceNote =>
      'السعر قبل العروض. يُحسب السعر النهائي عند الحفظ.';

  @override
  String get warehouseAddItemConfirm => 'إضافة';

  @override
  String get warehouseAddItemBack => 'رجوع';

  @override
  String get warehouseAddedLine => 'جديد';

  @override
  String get warehouseAddedLinePriceNote => 'قبل العروض';

  @override
  String get warehouseAddItemAlreadyOnOrder =>
      'هذا الصنف موجود في الطلب أصلاً. الطلب كما هو الآن.';

  @override
  String get warehouseAddItemUnavailable =>
      'هذا الصنف لم يعد متوفراً. اختر غيره.';

  @override
  String get warehouseConfirmSaveTitle => 'حفظ التعديلات؟';

  @override
  String get warehouseConfirmSaveBody =>
      'سيُعاد حساب سعر الطلب، وسيصل إلى الصيدلية إشعار بالتعديل.';

  @override
  String get warehouseCannotEmpty =>
      'لا يمكنك حذف كل الأصناف. إذا تعذّر تنفيذ الطلب، تواصل مع الصيدلية.';

  @override
  String get warehouseWaitingSeal =>
      'بانتظار صورة الختم من الصيدلية قبل التسليم.';

  @override
  String get warehouseHasReturn => 'يوجد مرتجع';

  @override
  String warehouseCancelReason(String reason) {
    return 'سبب الإلغاء: $reason';
  }

  @override
  String get warehouseAccountPanelHint =>
      'الأصناف والعروض والمناديب والتقارير في لوحة المستودع.';

  @override
  String warehouseOrderAdvanced(int number, String status) {
    return 'أصبح الطلب رقم $number: $status';
  }

  @override
  String get errorCannotRemoveLastItem => 'لا يمكنك إزالة آخر صنف من الطلب.';

  @override
  String get errorOrderAlreadyAdvanced =>
      'انتقل الطلب إلى مرحلة أخرى. حدّث الصفحة.';

  @override
  String get errorOrderNotAdvanceable =>
      'لا يمكن نقل هذا الطلب إلى مرحلة أخرى.';

  @override
  String get errorOrderNotEditable =>
      'أُرسل الطلب ولم يعد بإمكانك تعديل أصنافه.';

  @override
  String get errorPackageItemsLocked => 'تُعدَّل أصناف العرض من لوحة المستودع.';

  @override
  String get warehouseNavReturns => 'المرتجعات';

  @override
  String get warehouseNavAccounts => 'الحسابات';

  @override
  String get warehouseNavReps => 'المناديب';

  @override
  String warehouseReturnTitle(int number) {
    return 'مرتجع على الطلب رقم $number';
  }

  @override
  String get warehouseReturnNoOrder => 'مرتجع';

  @override
  String warehouseReturnUnits(int count) {
    return '$count قطعة';
  }

  @override
  String get warehouseNoReturnsTitle => 'لا توجد مرتجعات هنا';

  @override
  String get warehouseNoReturnsSubtitle =>
      'تظهر طلبات الإرجاع من الصيدليات هنا.';

  @override
  String get warehouseReturnPhotos => 'الصور';

  @override
  String get warehouseReturnPharmacyNotes => 'ملاحظات الصيدلية';

  @override
  String warehouseReturnCreditPreview(String amount) {
    return 'عند الموافقة، يُضاف إلى حساب الصيدلية: $amount';
  }

  @override
  String warehouseReturnCredited(String amount) {
    return 'أُضيف إلى حساب الصيدلية: $amount';
  }

  @override
  String get warehouseReturnApprove => 'موافقة';

  @override
  String get warehouseReturnReject => 'رفض';

  @override
  String get warehouseReturnApproveTitle => 'الموافقة على المرتجع؟';

  @override
  String get warehouseReturnApproveBody =>
      'سيُضاف المبلغ إلى حساب الصيدلية، ولا يمكن عكسه من التطبيق.';

  @override
  String get warehouseReturnRejectTitle => 'رفض المرتجع';

  @override
  String get warehouseReturnRejectHint => 'اكتب سبب الرفض، وسيصل إلى الصيدلية.';

  @override
  String warehouseReturnResolved(String status) {
    return 'أصبح المرتجع: $status';
  }

  @override
  String get warehouseNoAccountsTitle => 'لا توجد حسابات بعد';

  @override
  String get warehouseNoAccountsSubtitle =>
      'فور تسليم طلب إلى صيدلية، يظهر حسابها هنا.';

  @override
  String get warehouseAccountsSearch => 'ابحث باسم الصيدلية أو الرقم';

  @override
  String warehouseAccountOwes(String amount) {
    return 'عليها $amount';
  }

  @override
  String warehouseAccountInCredit(String amount) {
    return 'لها $amount';
  }

  @override
  String get warehouseAccountSettled => 'الحساب مسوّى';

  @override
  String get warehouseRecordPayment => 'سجّل دفعة';

  @override
  String get warehouseRecordPaymentTitle => 'دفعة من الصيدلية';

  @override
  String warehousePaymentAmount(String currency) {
    return 'المبلغ ($currency)';
  }

  @override
  String get warehousePaymentMethod => 'طريقة الدفع';

  @override
  String get warehousePaymentMethodCash => 'نقداً';

  @override
  String get warehousePaymentMethodBank => 'تحويل';

  @override
  String get warehousePaymentMethodCheque => 'شيك';

  @override
  String get warehousePaymentMethodOther => 'أخرى';

  @override
  String get warehousePaymentNote => 'ملاحظة (اختياري)';

  @override
  String warehousePaymentConfirm(String amount, String pharmacy) {
    return 'تسجيل $amount من $pharmacy؟';
  }

  @override
  String get warehousePaymentRecorded => 'تم تسجيل الدفعة.';

  @override
  String get warehousePaymentReverseHint =>
      'لعكس دفعة سُجّلت بالخطأ، استخدم لوحة المستودع.';

  @override
  String get warehouseNoRepsTitle => 'لا يوجد مندوبون بعد';

  @override
  String get warehouseNoRepsSubtitle =>
      'أضف مندوباً ليدخل إلى تطبيق Feniq برقم هاتفه وكلمة السر.';

  @override
  String get warehouseAddRep => 'إضافة مندوب';

  @override
  String get warehouseRepName => 'الاسم';

  @override
  String get warehouseRepPhone => 'رقم الهاتف';

  @override
  String get warehouseRepPassword => 'كلمة السر (8 أحرف أو أكثر)';

  @override
  String get warehouseRepRate => 'نسبة العمولة (%)';

  @override
  String get warehouseRepRateHint =>
      'نصفها للمندوب، وربعها لفينيق، والباقي توفير لك. بين 0 و10.';

  @override
  String get warehouseRepInactive => 'موقوف';

  @override
  String warehouseRepStats(int pharmacies, int visits) {
    return '$pharmacies صيدلية · $visits زيارة في آخر 30 يوماً';
  }

  @override
  String warehouseRepMonth(int orders, String amount) {
    return 'هذا الشهر: $orders طلب · عمولته $amount';
  }

  @override
  String get warehouseRepEditRate => 'تعديل العمولة';

  @override
  String get warehouseRepEditRateHint => 'تنطبق على الطلبات الجديدة فقط.';

  @override
  String get warehouseRepDeactivate => 'إيقاف المندوب';

  @override
  String get warehouseRepActivate => 'تفعيل المندوب';

  @override
  String get warehouseRepResetPassword => 'كلمة سر جديدة';

  @override
  String get warehouseRepPasswordReset =>
      'تم تغيير كلمة السر. أبلغ المندوب بها.';

  @override
  String get warehouseRepSaved => 'تم الحفظ.';

  @override
  String get warehouseRepPharmacies => 'صيدلياته';

  @override
  String get warehouseRepNoPharmacies =>
      'لا توجد صيدليات معه. يتم توزيع الصيدليات من لوحة المستودع.';

  @override
  String get warehouseRepVisits => 'زياراته';

  @override
  String get warehouseRepNoVisits => 'لم يسجّل زيارات بعد.';

  @override
  String warehouseRepLastVisit(String date) {
    return 'آخر زيارة: $date';
  }

  @override
  String get warehouseRepNeverVisited => 'لم تتم زيارتها';

  @override
  String get warehouseFieldRequired => 'هذا الحقل مطلوب';

  @override
  String get warehouseInvalidNumber => 'اكتب رقماً صحيحاً';

  @override
  String get errorInvalidCommissionRate =>
      'يجب أن تكون نسبة العمولة بين 0 و10.';

  @override
  String get errorInvalidPaymentAmount => 'المبلغ غير صحيح.';

  @override
  String get errorInvalidPhoneFormat => 'رقم الهاتف غير صحيح.';

  @override
  String get errorInvalidRepName => 'أدخل اسم المندوب.';

  @override
  String get errorNoTradingRelationship =>
      'لا يوجد تعامل بينك وبين هذه الصيدلية حتى الآن.';

  @override
  String get errorRepNotFound => 'تعذّر العثور على المندوب.';

  @override
  String get errorReturnAlreadyResolved =>
      'سبق البتّ في هذا المرتجع. حدّث الصفحة.';

  @override
  String get warehouseLoyaltyTitle => 'حسم الولاء';

  @override
  String get warehouseLoyaltyIntro =>
      'حسم ثابت تمنحه للصيدلية على الطلب بحسب قيمته. أنت تحدد الشرائح وأنت من يدفعه، وتأخذ فينيق حصتها من الباقي بعد الحسم.';

  @override
  String get warehouseLoyaltyEnabled => 'تفعيل حسم الولاء';

  @override
  String get warehouseLoyaltyMin => 'إذا كان الطلب من';

  @override
  String get warehouseLoyaltyDiscount => 'الحسم';

  @override
  String get warehouseLoyaltyAddTier => 'إضافة شريحة';

  @override
  String get warehouseLoyaltySave => 'حفظ حسم الولاء';

  @override
  String get warehouseLoyaltySaved => 'تم حفظ حسم الولاء.';

  @override
  String get warehouseLoyaltyExample =>
      'مثال: طلب بقيمة 100,000 أو أكثر ← حسم 2,000.';

  @override
  String get warehouseLoyaltyTierError =>
      'يجب أن تكون قيمة الطلب في كل شريحة أكبر من صفر والحسم أصغر منها.';

  @override
  String get warehouseLoyaltyOff => 'متوقف';

  @override
  String warehouseLoyaltyOnTiers(int count) {
    return 'مفعّل · $count شرائح';
  }

  @override
  String get warehouseLoyaltyLine => 'حسم الولاء';

  @override
  String get warehouseCreditUsedLine => 'من رصيد الصيدلية';

  @override
  String get warehouseRepPharmacyShare => 'رصيد للصيدلية';

  @override
  String get warehouseRepWarehouseShare => 'ربع المستودع';

  @override
  String get warehouseRepWarehouseShareToRep => 'ربع المستودع (للمندوب)';

  @override
  String get warehouseRepShareToRep => 'أعطِ ربعي للمندوب';

  @override
  String get warehouseRepShareToRepOn =>
      'أصبح ربعك للمندوب في الطلبات الجديدة.';

  @override
  String get warehouseRepShareToRepOff => 'عاد ربعك إليك في الطلبات الجديدة.';

  @override
  String get warehouseRepShareGiven => 'ربعك للمندوب';

  @override
  String get warehouseRepQuartersHint =>
      'ربع لفينيق، وربع رصيد للصيدلية، وربع للمندوب، والربع الأخير لك أو للمندوب. بين 0 و10.';

  @override
  String get errorInvalidLoyaltyTiers =>
      'يجب أن تحتوي كل شريحة على قيمة طلب أكبر من صفر وحسم أقل منها، ولا يجوز تكرار القيمة نفسها في شريحتين.';

  @override
  String get errorLoyaltyTiersRequired =>
      'أضف شريحة واحدة على الأقل قبل تفعيل حسم الولاء.';

  @override
  String get stageAccepted => 'تم القبول';

  @override
  String get stageAcceptedDesc => 'قبل المستودع طلبك';

  @override
  String get warehouseAccept => 'قبول';

  @override
  String get warehouseSendOnWay => 'خرج للتوصيل';

  @override
  String warehouseCollectTitle(int number) {
    return 'تسليم الطلب رقم $number: هل تم تحصيل المبلغ؟';
  }

  @override
  String warehouseCollectTotal(String amount) {
    return 'المبلغ: $amount';
  }

  @override
  String get warehouseCollectFull => 'تم استلام المبلغ كاملاً';

  @override
  String get warehouseCollectPartial => 'دفعة جزئية';

  @override
  String get warehouseCollectLater => 'الدفع لاحقاً';

  @override
  String get warehouseCollectRepCollected => 'تم التحصيل عن طريق المندوب';

  @override
  String get warehouseCollectCashOnlyHint =>
      'يتعامل هذا المستودع نقداً فقط. عند التحصيل عن طريق المندوب يبقى المبلغ ديناً على الصيدلية إلى أن تُسجَّل الدفعة.';

  @override
  String warehouseCollectPaidLabel(String currency) {
    return 'المبلغ المدفوع الآن ($currency)';
  }

  @override
  String warehouseCollectLeft(String amount) {
    return 'المتبقي: $amount';
  }

  @override
  String get warehouseCollectSave => 'تأكيد التسليم وحفظ الدفعة';

  @override
  String get warehouseCollectPartialInvalid =>
      'أدخل مبلغاً أكبر من صفر وأقل من المبلغ الكامل.';

  @override
  String warehouseCollectRecorded(String amount) {
    return 'تم التسليم وتسجيل دفعة بقيمة $amount';
  }

  @override
  String get warehouseCollectFailed =>
      'تم التسليم، لكن لم نتأكد من تسجيل المقبوض. أعد تأكيد الدفعة من التنبيه في لوحة المستودع.';

  @override
  String warehouseCollectNote(int number) {
    return 'دفعة عند تسليم الطلب رقم $number';
  }

  @override
  String warehouseAccountPurchases(String amount) {
    return 'اشترت $amount';
  }

  @override
  String warehouseAccountPaid(String amount) {
    return 'دفعت $amount';
  }

  @override
  String warehouseAccountLastPayment(String date) {
    return 'آخر دفعة $date';
  }

  @override
  String get warehouseAccountNoPayment => 'لم تدفع بعد';

  @override
  String get warehouseAccountPayFull => 'دفع كامل';

  @override
  String get warehouseAccountPayPartial => 'دفعة جزئية';

  @override
  String warehouseAccountPayFullConfirm(String amount) {
    return 'تسجيل دفعة نقدية $amount؟';
  }

  @override
  String warehouseAccountPayOwes(String amount) {
    return 'عليها: $amount';
  }

  @override
  String get warehouseAccountPaySave => 'سجّل الدفعة';

  @override
  String get warehouseAccountPayInvalid =>
      'اكتب مبلغاً أكبر من صفر وأقل من المبلغ المطلوب.';

  @override
  String warehouseAccountPayRecorded(String amount) {
    return 'تم تسجيل دفعة $amount';
  }

  @override
  String get warehouseAccountPayFailed =>
      'لم نتأكد من تسجيل الدفعة. أعد المحاولة لتأكيد نفس الدفعة بأمان.';

  @override
  String get warehouseVoiceTitle => 'تسجيل دفعة بالصوت';

  @override
  String get warehouseVoiceHint =>
      'قل مثلاً: «صيدلية النور دفعت خمسين ألف» أو «صيدلية الأمل دفعت المبلغ كامل».';

  @override
  String get warehouseVoiceSpeak => 'اضغط وتحدّث';

  @override
  String get warehouseVoiceStop => 'إيقاف';

  @override
  String get warehouseVoiceHeard => 'ما تم سماعه (يمكنك تعديله)';

  @override
  String get warehouseVoiceNoMic =>
      'الصوت غير متاح على هذا الهاتف. اكتب الجملة في الخانة.';

  @override
  String get warehouseVoiceNotUnderstood =>
      'لم نفهم الجملة. جرّب: اسم الصيدلية + دفعت + المبلغ.';

  @override
  String get warehouseVoiceNoPharmacy => 'لم نجد هذه الصيدلية. عدّل الاسم.';

  @override
  String warehouseVoiceOwes(String amount) {
    return 'عليها $amount';
  }

  @override
  String warehouseVoiceWillRecord(String amount) {
    return 'ستُسجَّل دفعة $amount';
  }

  @override
  String warehouseVoiceLeftAfter(String amount) {
    return 'سيبقى عليها $amount';
  }

  @override
  String get warehouseVoiceCannotRecord =>
      'المبلغ لا يتوافق مع حساب هذه الصيدلية (إما صفر وإما أكبر من المطلوب).';

  @override
  String get warehouseVoiceConfirm => 'تأكيد وتسجيل';

  @override
  String get warehouseSummaryTitle => 'ملخص المستودع';

  @override
  String get warehouseSummaryToday => 'اليوم';

  @override
  String get warehouseSummaryWeek => 'آخر 7 أيام';

  @override
  String get warehouseSummaryMonth => 'هذا الشهر';

  @override
  String get warehouseSummarySales => 'المبيعات';

  @override
  String get warehouseSummaryCollections => 'التحصيل';

  @override
  String get warehouseSummaryReturns => 'المرتجعات';

  @override
  String get warehouseSummaryTotalDebts => 'إجمالي الديون';

  @override
  String warehouseSummaryInvoices(int count) {
    return '$count فاتورة';
  }

  @override
  String warehouseSummaryPayments(int count) {
    return '$count دفعة';
  }

  @override
  String warehouseSummaryDebtors(int count) {
    return '$count صيدلية عليها دين';
  }

  @override
  String warehouseSummaryCreditHeld(String amount) {
    return 'رصيد الصيدليات لديك: $amount';
  }

  @override
  String warehouseSummaryChangeUp(int percent) {
    return 'زيادة $percent% عن الفترة السابقة';
  }

  @override
  String warehouseSummaryChangeDown(int percent) {
    return 'نقصان $percent% عن الفترة السابقة';
  }

  @override
  String get warehouseSummaryChangeFlat => 'مثل الفترة السابقة';

  @override
  String get warehouseSummaryChangeNew => 'لم يكن هناك شيء في الفترة السابقة';

  @override
  String get warehouseSummaryTopBuyers => 'أكثر الصيدليات شراءً';

  @override
  String get warehouseSummaryTopDebtors => 'أكبر الديون';

  @override
  String get warehouseSummaryNoBuyers => 'لا توجد مبيعات في هذه الفترة.';

  @override
  String get warehouseSummaryNoDebtors => 'لا توجد ديون.';

  @override
  String get warehouseSummaryDeliveredNote =>
      'تُحتسب في المبيعات الطلبات المسلَّمة فقط.';

  @override
  String get paymentUnconfirmed =>
      'لم نتأكد من تسجيل الدفعة. أعد المحاولة لتأكيد نفس الدفعة بأمان.';

  @override
  String dataLastUpdated(String time) {
    return 'آخر تحديث: $time';
  }

  @override
  String get dataCached => 'البيانات المعروضة من آخر تحديث ناجح.';

  @override
  String get updateDownloading => 'جارٍ تنزيل التحديث';

  @override
  String get updateInstallPermission =>
      'اسمح لفينيق بتثبيت التطبيقات من شاشة إعدادات أندرويد، ثم ارجع واضغط «تحديث الآن». لن تحتاج لتنزيل الملف مرة أخرى.';

  @override
  String get updateCancelDownload => 'إلغاء التنزيل';

  @override
  String offlineCatalogsReady(String ready, String total) {
    return 'محفوظ للتصفح بلا إنترنت: $ready/$total';
  }

  @override
  String get offlineCatalogsSaving => 'جارٍ حفظ الكتالوجات على هذا الجهاز…';

  @override
  String get offlineCatalogsRetry =>
      'لم يكتمل الحفظ. تحتاج إنترنت ومساحة كافية؛ النسخة السابقة محفوظة.';

  @override
  String offlineCatalogsLastSync(String time) {
    return 'آخر مزامنة: $time';
  }

  @override
  String get locationPermissionPurpose =>
      'السماح بالموقع يساعدنا على تحديد موقع الصيدلية والتحقق من الزيارة عند مسح رمزها. يمكنك التصفح دون منحه؛ لا نتتبع تحركاتك في الخلفية.';

  @override
  String get locationPermissionPermanent =>
      'إذن الموقع موقوف. افتح إعدادات التطبيق واسمح بالموقع أثناء الاستخدام لتتمكن من إثبات الزيارة.';

  @override
  String get locationServiceDisabled =>
      'خدمة الموقع غير مفعّلة. فعّل GPS قبل تسجيل الزيارة.';

  @override
  String get locationOpenSettings => 'فتح الإعدادات';

  @override
  String get locationAllow => 'السماح بالموقع';

  @override
  String get repVisitLocationUnapproved => 'موقع الصيدلية بانتظار الاعتماد';

  @override
  String get repVisitPoorAccuracy => 'دقة الموقع غير كافية';

  @override
  String get repVisitStaleLocation => 'قراءة الموقع قديمة';

  @override
  String get repScanLocationUnapprovedMessage =>
      'لم يُعتمد موقع هذه الصيدلية بعد. تواصل مع إدارة فينيق لتثبيته؛ هذه المحاولة لا تُحتسب زيارة مؤكدة.';

  @override
  String get repScanPoorAccuracyMessage =>
      'دقة GPS غير كافية. اقترب من مدخل الصيدلية أو مكان مفتوح ثم أعد المسح.';

  @override
  String get repScanStaleLocationMessage =>
      'انتهت صلاحية قراءة الموقع. فعّل الوقت التلقائي والموقع في الهاتف ثم أعد المسح للحصول على قراءة جديدة.';

  @override
  String get warehouseLoyaltyMode => 'طريقة الولاء';

  @override
  String get warehouseLoyaltyPerOrder => 'حسب قيمة الطلب الواحد';

  @override
  String get warehouseLoyaltyMonthly => 'حسب مجموع المشتريات الشهرية';

  @override
  String get warehouseMonthlyLoyaltyHelp =>
      'تُجمع الفواتير المسلّمة بقيمتها الصافية بعد الحسومات والرصيد، ضمن شهر بتوقيت دمشق. يُضاف فرق الحافز مرة واحدة لرصيد الطلب القادم. المرتجعات تخفض الاستحقاق، وإذا صُرف الحافز يُسوّى من حوافز الولاء القادمة دون المساس بعمولة الصيدلية أو تسجيل دين نقدي. تُثبّت شرائح الشهر عند أول تسليم فيه.';

  @override
  String pharmacyMonthlyLoyaltyProgress(String amount) {
    return 'مشترياتك المسلّمة هذا الشهر: $amount. يُضاف فرق حافز الولاء بعد التسليم لرصيد طلبك القادم؛ المرتجعات تخفض الاستحقاق.';
  }

  @override
  String get warehouseMonthlyLoyaltyExample =>
      'مثال: مشتريات مسلّمة صافية 100,000 → رصيد 1,000؛ وعند 200,000 → مجموع رصيد 5,000، أي فرق إضافي 4,000.';

  @override
  String get warehouseMonthlyLoyaltyMin => 'مجموع الشهر من';

  @override
  String get warehouseMonthlyLoyaltyReward => 'الرصيد المستحق';

  @override
  String pharmacyMonthlyLoyaltyOffset(String amount) {
    return 'حافز مرتجع صُرف سابقاً: $amount، سيُسوّى من حوافز الولاء القادمة؛ ليس ديناً نقدياً.';
  }

  @override
  String get errorLoyaltyChanged =>
      'تغيّرت إعدادات الولاء. ارجع وأعد فتح الإعدادات قبل الحفظ.';

  @override
  String get warehouseInsightsTitle => 'أداء المستودع والمتابعة';

  @override
  String get warehouseInsightsScope =>
      'هذه الأرقام تخص عمليات فينيق فقط. صافي المبيعات بعد المرتجعات لا يعني الربح؛ لا يشمل تكلفة البضاعة أو المصاريف.';

  @override
  String get warehouseInsightsNetSales => 'صافي المبيعات';

  @override
  String get warehouseInsightsCollections => 'التحصيل';

  @override
  String get warehouseInsightsReturns => 'المرتجعات';

  @override
  String get warehouseInsightsDebts => 'الديون الحالية';

  @override
  String get warehouseInsightsTrend => 'المبيعات والتحصيل عبر الأيام';

  @override
  String get warehouseInsightsInspectDay => 'اختر يوماً لعرض أرقامه';

  @override
  String get warehouseInsightsPeriod => 'الفترة';

  @override
  String get warehouseInsightsRefresh => 'تحديث';

  @override
  String get warehouseInsightsAsOf => 'آخر تحديث:';

  @override
  String get warehouseInsightsDamascus => 'توقيت دمشق';

  @override
  String get warehouseInsightsAging => 'أعمار الديون — بالأيام';

  @override
  String get warehouseInsightsAgingMethod =>
      'تُسوّى الحركات الأقدم أولاً. المرتجع يُنقص فاتورته الأصلية، وإلغاء الدفعة يعيد عمر الدين الأصلي. هذا تقدير للمتابعة؛ الدفعات غير مربوطة بفواتير محددة.';

  @override
  String get warehouseInsightsDailyTable => 'جدول التفاصيل اليومية';

  @override
  String get warehouseInsightsDate => 'التاريخ';

  @override
  String get warehouseInsightsPharmacy => 'الصيدلية';

  @override
  String get warehouseInsightsPhone => 'الهاتف';

  @override
  String get warehouseInsightsCity => 'المدينة';

  @override
  String get warehouseInsightsDays => 'الأيام';

  @override
  String get warehouseInsightsAction => 'المتابعة';

  @override
  String get warehouseInsightsOpenStatement => 'فتح الكشف';

  @override
  String get warehouseInsightsOpenStatements => 'كشوف الحسابات';

  @override
  String get warehouseInsightsSettings => 'مدة متابعة الديون والانقطاع';

  @override
  String get warehouseInsightsOverdueDays => 'يتأخر الدين بعد — يوم';

  @override
  String get warehouseInsightsInactiveDays => 'صيدلية دون طلب منذ — يوم';

  @override
  String get warehouseInsightsSaveSettings => 'حفظ المدة';

  @override
  String get warehouseInsightsEmpty =>
      'لا توجد حالات تستدعي المتابعة بهذه المدة.';

  @override
  String get warehouseInsightsLoadMore => 'عرض المزيد';

  @override
  String get warehouseInsightsInactiveFeature =>
      'هذه الميزات غير مفعلة للمستودع. تواصل مع فينيق لتفعيلها.';

  @override
  String get warehouseInsightsNoAlerts => 'لا توجد حالات تستدعي التنبيه الآن.';

  @override
  String get warehouseInsightsOverview => 'نظرة عامة';

  @override
  String get warehouseInsightsOverdue => 'ديون متأخرة';

  @override
  String get warehouseInsightsInactive => 'صيدليات منقطعة';

  @override
  String get warehouseInsightsAlerts => 'تنبيهات المتابعة';

  @override
  String get warehouseInsightsInvalidDays => 'اختر مدة من 1 إلى 180 يوماً.';

  @override
  String get warehouseInsightsSaved => 'تم حفظ مدة المتابعة.';

  @override
  String warehouseInsightsResults(String count) {
    return 'النتائج: $count';
  }

  @override
  String get warehouseInsightsNoPreviousOrder =>
      'لا توجد طلبات سابقة؛ المدة منذ تعيين الصيدلية.';

  @override
  String get errorFeatureUnavailable =>
      'هذه الميزات غير مفعلة للمستودع. تواصل مع فينيق لتفعيلها.';

  @override
  String get errorFollowUpChanged =>
      'تغيّرت مدة المتابعة. حدّث الصفحة قبل الحفظ.';

  @override
  String warehouseInsightsAlertOrders(String count) {
    return 'طلبات معلّقة منذ 48 ساعة: $count';
  }

  @override
  String warehouseInsightsAlertReturns(String count) {
    return 'مرتجعات بانتظار القرار منذ 48 ساعة: $count';
  }

  @override
  String warehouseInsightsAlertOverdue(String count) {
    return 'صيدليات لها مبالغ متأخرة: $count';
  }

  @override
  String warehouseInsightsAlertInactive(String count) {
    return 'صيدليات بحاجة متابعة طلباتها: $count';
  }

  @override
  String get warehouseInsightsScopeShort =>
      'عمليات فينيق فقط؛ صافي المبيعات ليس الربح.';

  @override
  String get warehouseInsightsAbout => 'عن هذه الأرقام';

  @override
  String get warehouseInsightsOverdueAmount => 'المبلغ المتأخر';

  @override
  String get deliveryTitle => 'مناطق ومواعيد التوزيع';

  @override
  String get deliveryExplanation =>
      'فعّل المواعيد بعد ضبط المناطق وربط الصيدليات. التقدير بتوقيت دمشق بهامش ±12 ساعة ويثبت عند إرسال الطلب؛ ليس ضماناً لساعة وصول محددة.';

  @override
  String get deliveryEnable => 'إظهار موعد التوصيل للصيدلي';

  @override
  String get deliveryFeatureOff =>
      'الميزة غير مفعلة في اشتراك المستودع. المواعيد السابقة تبقى محفوظة.';

  @override
  String get deliveryZoneName => 'اسم منطقة التوزيع';

  @override
  String get deliveryPreparation => 'مهلة التجهيز بالساعات';

  @override
  String get deliveryZoneActive => 'المنطقة فعالة';

  @override
  String get deliveryDay => 'يوم الانطلاق';

  @override
  String get deliveryDepartureTime => 'وقت الانطلاق — دمشق';

  @override
  String get deliveryArrivalHours => 'ساعات الوصول بعد الانطلاق';

  @override
  String get deliveryCutoffHours => 'إغلاق الطلب قبل الانطلاق بساعات';

  @override
  String get deliveryAddTrip => 'إضافة يوم توزيع';

  @override
  String get deliveryRemoveTrip => 'حذف يوم التوزيع';

  @override
  String get deliveryExceptions => 'استثناءات الأيام';

  @override
  String get deliveryDate => 'التاريخ — YYYY-MM-DD';

  @override
  String get deliveryCancelTrip => 'إلغاء توزيع هذا اليوم';

  @override
  String get deliveryRemoveException => 'حذف الاستثناء';

  @override
  String get deliveryAddException => 'إضافة استثناء';

  @override
  String get deliveryPauseZone => 'إيقاف المنطقة';

  @override
  String get deliveryAddZone => 'إضافة منطقة';

  @override
  String get deliverySave => 'حفظ الجدول';

  @override
  String get deliverySaved => 'تم الحفظ';

  @override
  String get deliveryReload => 'إعادة تحميل الإعدادات';

  @override
  String get deliveryAssignTitle => 'ربط الصيدليات بمناطق التوزيع';

  @override
  String get deliveryAssignHint =>
      'احفظ الجدول أولاً، ثم ابحث عن الصيدلية وحدد منطقتها. هذا الربط لا يخفي المستودعات من الكتالوج.';

  @override
  String get deliverySearch => 'اسم الصيدلية أو الهاتف';

  @override
  String get deliverySearchButton => 'بحث';

  @override
  String get deliveryUnassigned => 'دون منطقة — الموعد غير محدد';

  @override
  String get deliveryPaused => 'موقوفة';

  @override
  String get deliveryArrivalTitle => 'التوصيل المتوقع';

  @override
  String get deliveryUnavailable =>
      'موعد التوصيل غير محدد لهذه الصيدلية حالياً.';

  @override
  String get deliveryPreview => 'تقدير أولي؛ يثبت الموعد عند إرسال الطلب.';

  @override
  String get deliveryRange => 'متوقع بين';

  @override
  String get deliveryLate =>
      'تأخر عن نافذة الوصول؛ تواصل مع المستودع. انتهاء الوقت لا يعني تسليم الطلب.';

  @override
  String get deliveryDelivered => 'تم التسليم';

  @override
  String get deliveryCancelled => 'الطلب ملغى — انتهى تقدير الوصول';

  @override
  String get deliveryUntil => 'الوقت المتبقي لنهاية النافذة';

  @override
  String get deliveryReschedule => 'تعديل موعد هذا الطلب';

  @override
  String get deliveryNewTime => 'الموعد الجديد — توقيت دمشق';

  @override
  String get deliveryReason => 'سبب تعديل الموعد — يظهر للصيدلي';

  @override
  String get deliveryChanged => 'تم تعديل الموعد';

  @override
  String get deliveryInvalid =>
      'راجع أسماء المناطق والأيام والأوقات. الساعات من 0 إلى 168، وساعات الوصول حتى 72. لا تكرر اليوم في المنطقة.';

  @override
  String get deliveryUnsaved =>
      'لديك تعديلات غير محفوظة. احفظها أو أعد تحميل الإعدادات قبل ربط الصيدليات.';

  @override
  String get deliveryNoResults => 'لا توجد صيدليات مطابقة';

  @override
  String get deliveryDays0 => 'الأحد';

  @override
  String get deliveryDays1 => 'الاثنين';

  @override
  String get deliveryDays2 => 'الثلاثاء';

  @override
  String get deliveryDays3 => 'الأربعاء';

  @override
  String get deliveryDays4 => 'الخميس';

  @override
  String get deliveryDays5 => 'الجمعة';

  @override
  String get deliveryDays6 => 'السبت';

  @override
  String deliveryHoursMinutes(String hours, String minutes) {
    return '$hours ساعة و $minutes دقيقة';
  }

  @override
  String get warehouseInsightsUnknownAge =>
      'رصيد دون عمر فاتورة موثق؛ داخل إجمالي الدين، وخارج شرائح التأخر حتى يتوفر تاريخ موثوق.';

  @override
  String get manualAddressLabel => 'العنوان التفصيلي';

  @override
  String get areaNameLabel => 'المنطقة أو القرية';

  @override
  String get optionalLocationLabel => 'موقع الصيدلية على الخريطة (اختياري)';

  @override
  String get registrationUnconfirmed =>
      'لم نتمكن من تأكيد نتيجة التسجيل. قد يكون حسابك أُنشئ؛ جرّب تسجيل الدخول بنفس الهاتف وكلمة المرور قبل إعادة التسجيل.';

  @override
  String get editProfileTitle => 'تعديل بيانات الصيدلية';

  @override
  String get saveProfileButton => 'حفظ البيانات';

  @override
  String get launchUnknown =>
      'تعذر التحقق من مرحلة التشغيل. يمكنك التصفح؛ إرسال الطلبات متوقف حتى عودة الاتصال.';

  @override
  String get launchPreparing =>
      'التسجيل والتصفح متاحان. استقبال الطلبات لم يبدأ بعد.';

  @override
  String get launchRetry => 'إعادة التحقق';

  @override
  String get featurePreferencesTitle => 'تفضيلات الميزات';

  @override
  String get featurePreferencesHelp =>
      'تشغيل التفضيل لا يمنح حقاً جديداً. تبقى الإتاحة حسب صلاحيات حسابك وحقوق المستودع وإعدادات المنصة. المحاسبة المتقدمة قيد الاعتماد؛ القبض الأساسي يبقى للمحاسب.';

  @override
  String get featurePreferencesOwnerOnly =>
      'تعديل هذه التفضيلات متاح لصاحب المستودع فقط.';

  @override
  String get featurePreferencesSaved => 'تم حفظ التفضيلات وتحديث الإتاحة.';

  @override
  String get featurePreferencesAvailable => 'متاحة حالياً';

  @override
  String get featurePreferencesUnavailable => 'غير متاحة حالياً';

  @override
  String get featurePreferencesReason => 'سبب التعديل';

  @override
  String get featurePreferencesSave => 'حفظ التفضيلات';

  @override
  String get featurePreferencesRepTracking => 'متابعة زيارات المندوب';

  @override
  String get featurePreferencesLoyalty => 'الولاء';

  @override
  String get featurePreferencesAccounting =>
      'المحاسبة المتقدمة — نطاقها قيد الاعتماد';

  @override
  String get featurePreferencesSalesReports => 'تقارير المبيعات';

  @override
  String get featurePreferencesOwnerInsights => 'تقرير المالك';

  @override
  String get featurePreferencesOverdue => 'الديون المتأخرة';

  @override
  String get featurePreferencesInactive => 'الصيدليات المنقطعة';

  @override
  String get featurePreferencesAlerts => 'تنبيهات المالك داخل الشاشة';

  @override
  String get featurePreferencesDelivery => 'جدولة التوصيل';

  @override
  String get errorFeatureControlChanged =>
      'تغيّرت إعدادات الميزات. أعد تحميلها قبل الحفظ.';

  @override
  String get appPermissionsTitle => 'صلاحيات التطبيق';

  @override
  String get appPermissionsIntro =>
      'هنا كل ما يطلبه فينيق من هاتفك وسبب ذلك. لا نطلب إلا ما نحتاجه، ويمكنك تغيير أي إذن من هنا.';

  @override
  String get appPermissionsWhy => 'لماذا؟';

  @override
  String get permNotificationsTitle => 'الإشعارات';

  @override
  String get permNotificationsWhyWarehouse =>
      'ليصلك صوت واهتزاز مع كل طلب جديد، حتى والتطبيق مغلق.';

  @override
  String get permNotificationsWhyOther =>
      'ليصلك إشعار عند تغيّر حالة طلبك أو ظهور عرض جديد.';

  @override
  String get permBatteryTitle => 'بلا قيود على البطارية';

  @override
  String get permBatteryWhy =>
      'يؤدي توفير البطارية في أجهزة شاومي وهواوي وسامسونج إلى تجميد التطبيق وتأخير إشعارات الطلبات. هذا الخيار يضمن وصولها في وقتها.';

  @override
  String get permAutostartTitle => 'التشغيل التلقائي';

  @override
  String get permAutostartWhy =>
      'في هذا الهاتف مفتاح «تشغيل تلقائي» مغلق من المصنع. فعّله لفينيق لتصل الإشعارات بعد إغلاق التطبيق أو إعادة تشغيل الهاتف.';

  @override
  String get permAutostartSteps =>
      'في شاومي: الإعدادات ← التطبيقات ← إدارة التطبيقات ← Feniq ← فعّل «التشغيل التلقائي»، وفي «توفير البطارية» اختر «بلا قيود».';

  @override
  String get permLocationTitle => 'الموقع';

  @override
  String get permLocationWhy =>
      'لتحديد مكان الصيدلية على الخريطة، ولتسجيل زيارات المندوب ومسار السائق.';

  @override
  String get permBackgroundLocationTitle => 'الموقع في الخلفية';

  @override
  String get permBackgroundLocationWhy =>
      'فقط أثناء رحلة توزيع جارية، ليبقى موقعك محدَّثاً والهاتف في الجيب. اختر «السماح طوال الوقت».';

  @override
  String get permCameraTitle => 'الكاميرا';

  @override
  String get permCameraWhy =>
      'لتصوير المرتجعات وختم التسليم ومسح رمز الزيارة. الصور من المعرض لا تحتاج إذناً.';

  @override
  String get permMicrophoneTitle => 'المايكروفون';

  @override
  String get permMicrophoneWhy => 'لتسجيل الدفعة بالصوت بدل الكتابة.';

  @override
  String get permStateGranted => 'مفعّلة';

  @override
  String get permStateDenied => 'غير مفعّلة';

  @override
  String get permStateBlocked => 'مرفوضة، فعّلها من الإعدادات';

  @override
  String get permStateUnknown => 'تحقق بنفسك';

  @override
  String get permActionEnable => 'تفعيل';

  @override
  String get permActionOpenSettings => 'فتح الإعدادات';

  @override
  String get permActionOpenPage => 'فتح الصفحة';

  @override
  String get permAutostartOpenFailed =>
      'تعذّر فتح الصفحة. افتحها من الإعدادات حسب الخطوات.';

  @override
  String get pushDelayedBannerText =>
      'قد تتأخر إشعارات الطلبات على هذا الهاتف.';

  @override
  String get pushDelayedBannerAction => 'إصلاح';

  @override
  String get invoicePdfAction => 'حفظ الفاتورة PDF';

  @override
  String get invoicePdfShare => 'مشاركة أو حفظ في الملفات';

  @override
  String get invoicePdfShareHint => 'واتساب، Drive، أو «الملفات» في هاتفك';

  @override
  String get invoicePdfPrint => 'طباعة أو «حفظ كـ PDF»';

  @override
  String get invoicePdfFailed => 'تعذّر تجهيز الفاتورة. حاول مرة أخرى.';

  @override
  String get invoicePdfItem => 'الصنف';

  @override
  String get invoicePdfQuantity => 'الكمية';

  @override
  String get invoicePdfUnitPrice => 'سعر الوحدة';

  @override
  String get invoicePdfLineTotal => 'المجموع';

  @override
  String get invoicePdfFree => 'مجاني';

  @override
  String invoicePdfFrom(String name) {
    return 'المستودع: $name';
  }

  @override
  String invoicePdfTo(String name) {
    return 'الصيدلية: $name';
  }

  @override
  String get invoicePdfFooter => 'فاتورة من تطبيق فينيق';

  @override
  String get invoicePdfTitle => 'فاتورة';

  @override
  String warehouseAutoDeliverHours(int hours) {
    String _temp0 = intl.Intl.pluralLogic(
      hours,
      locale: localeName,
      other: 'سيُسجَّل مُسلَّماً تلقائياً بعد $hours ساعة',
      few: 'سيُسجَّل مُسلَّماً تلقائياً بعد $hours ساعات',
      two: 'سيُسجَّل مُسلَّماً تلقائياً بعد ساعتين',
      one: 'سيُسجَّل مُسلَّماً تلقائياً بعد ساعة',
    );
    return '$_temp0';
  }

  @override
  String warehouseAutoDeliverMinutes(int minutes) {
    String _temp0 = intl.Intl.pluralLogic(
      minutes,
      locale: localeName,
      other: 'سيُسجَّل مُسلَّماً تلقائياً بعد $minutes دقيقة',
      few: 'سيُسجَّل مُسلَّماً تلقائياً بعد $minutes دقائق',
      two: 'سيُسجَّل مُسلَّماً تلقائياً بعد دقيقتين',
      one: 'سيُسجَّل مُسلَّماً تلقائياً بعد دقيقة',
    );
    return '$_temp0';
  }

  @override
  String get warehouseAutoDeliverDue => 'سيُسجَّل مُسلَّماً تلقائياً خلال ساعة';

  @override
  String get warehouseAutoDeliverExplain =>
      'إذا لم تسجّل التسليم بنفسك، سيعلّم النظام الطلب مُسلَّماً تلقائياً بعد يوم من خروجه، ويُسجَّل مبلغه ديناً على الصيدلية. تأجيل موعد التوصيل لا يوقف هذا العدّاد.';

  @override
  String get dailyReceiptsTitle => 'مقبوضات اليوم';

  @override
  String get dailyReceiptsNet => 'الصافي';

  @override
  String dailyReceiptsReceived(String amount, int count) {
    return 'المقبوض: $amount · عدد الدفعات $count';
  }

  @override
  String dailyReceiptsReversed(String amount) {
    return 'الملغى: −$amount';
  }

  @override
  String get dailyReceiptsNone => 'لم يُقبض أي مبلغ اليوم.';

  @override
  String get dailyReceiptsFailed => 'تعذّر تحميل مقبوضات اليوم.';

  @override
  String get dailyReceiptsCash => 'نقداً';

  @override
  String get dailyReceiptsTransfer => 'تحويل';

  @override
  String get dailyReceiptsCheque => 'شيك';

  @override
  String get dailyReceiptsOther => 'غير ذلك';

  @override
  String get dailyReceiptsRoleOwner => 'مدير';

  @override
  String get dailyReceiptsRoleAccountant => 'محاسب';

  @override
  String get dailyReceiptsRoleLegacy => 'حساب المستودع';

  @override
  String get dailyReceiptsToday => 'اليوم';

  @override
  String get dailyReceiptsYesterday => 'أمس';

  @override
  String get dailyReceiptsVsYesterday => 'الصافي مقارنة بالأمس';

  @override
  String get orderPipelineTitle => 'طلبات اليوم';

  @override
  String get orderPipelinePending => 'بانتظار الموافقة';

  @override
  String get orderPipelineAccepted => 'مقبولة';

  @override
  String get orderPipelineOnTheWay => 'في الطريق';

  @override
  String get orderPipelineDelivered => 'سُلّمت اليوم';

  @override
  String orderPipelineStale(int count) {
    return 'بانتظار الموافقة منذ أكثر من 48 ساعة: $count';
  }

  @override
  String get orderPipelineFailed => 'تعذّر تحميل طلبات اليوم.';

  @override
  String get orderPipelineNone =>
      'لا توجد طلبات مفتوحة، ولم يُسلَّم شيء اليوم.';
}
