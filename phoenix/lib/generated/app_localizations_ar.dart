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
      'املأ البيانات التالية، وسيتم تفعيل حسابك بعد مراجعة الوثائق من قِبل الإدارة.';

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
  String get alreadyHaveAccountLink => 'عندك حساب؟ سجّل دخول بكلمة السر';

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
  String get passwordLoginTitle => 'تسجيل الدخول بكلمة السر';

  @override
  String get passwordLoginSubtitle => 'أدخل رقم هاتفك وكلمة السر';

  @override
  String get backToRegistrationLink => 'جديد هون؟ أنشئ حساب';

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
      'نقوم بمراجعة تسجيلك حالياً. ستتمكن من الطلب فور الموافقة على حسابك.';

  @override
  String approvalPendingMessageWithName(String pharmacyName) {
    return 'نقوم بمراجعة وثائق صيدلية $pharmacyName حالياً. ستتمكن من الطلب فور الموافقة على حسابك.';
  }

  @override
  String get approvalPendingBlockedTitle => 'الحساب محظور';

  @override
  String get approvalPendingBlockedMessage =>
      'تم حظر هذا الحساب. يرجى التواصل مع الدعم للمساعدة.';

  @override
  String get approvalChecklistReceived => 'تم استلام البيانات والوثائق';

  @override
  String get approvalChecklistReview => 'قيد مراجعة الإدارة';

  @override
  String get approvalChecklistActivate => 'تفعيل الحساب والبدء بالطلب';

  @override
  String get refreshStatusButton => 'تحقق من الحالة';

  @override
  String get contactSupportButton => 'تواصل مع الدعم';

  @override
  String get contactSupportDialogTitle => 'تواصل مع الدعم';

  @override
  String get contactSupportDialogMessage =>
      'للمساعدة بخصوص حسابك، يرجى التواصل مع دعم مستودع النجاح.';

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
  String get noSearchResultsFound => 'ما في نتائج مطابقة لبحثك.';

  @override
  String get warehouseProfileButtonLabel => 'البروفايل';

  @override
  String get warehousesScopeMyCity => 'مدينتي';

  @override
  String get warehousesScopeAllCities => 'كل المدن';

  @override
  String get viewAllCitiesButton => 'عرض كل المدن';

  @override
  String get noWarehousesInYourCity => 'لا يوجد مستودعات بمدينتك';

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
  String get advertisementAddToCartButton => 'أضف للسلة';

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
      'حذف منتج يُنهي سعر السلة. المنتجات المتبقية صار سعرها عادي.';

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
    return '$name أصبح بـ $newPrice (كان $oldPrice).';
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
  String get stageOutForDelivery => 'بالطريق';

  @override
  String get stageDelivered => 'تم التسليم';

  @override
  String get stageCancelled => 'ملغى';

  @override
  String get stageModified => 'تم تعديل الطلب';

  @override
  String get stageUnderReviewDesc => 'وصل طلبك إلى المستودع';

  @override
  String get stagePreparingDesc => 'المستودع عم يجهز طلبك';

  @override
  String get stageOutForDeliveryDesc => 'طلبك طلع من المستودع';

  @override
  String get stageDeliveredDesc => 'استلمت الطلب';

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
  String get noReturnableOrdersTitle => 'لا يوجد طلبات مؤهلة للإرجاع';

  @override
  String get myReturnsListSectionTitle => 'طلبات الإرجاع الخاصة بك';

  @override
  String get newReturnRequestButton => 'طلب مرتجع جديد';

  @override
  String get selectOrderForReturnTitle =>
      'اختر الطلب الذي تريد إرجاع أصناف منه';

  @override
  String get noEligibleOrdersForReturn =>
      'لا يوجد طلبات مسلّمة حالياً يمكن طلب إرجاع لها.';

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
  String get returnPickItemsLabel => 'اختر الأصناف يلي بدك ترجعها';

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
  String get errorTooManyReturnPhotos => 'ممكن ترفق حتى 5 صور.';

  @override
  String get errorInvalidReturnPhoto => 'إحدى الصور المرفقة مش صورة صالحة.';

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
      'كل صنف ممكن يظهر مرة وحدة بس بطلب الإرجاع.';

  @override
  String get errorRejectionNoteRequired => 'يرجى توضيح سبب رفض هذا المرتجع.';

  @override
  String get returnPhotosLabel => 'صور (اختياري)';

  @override
  String get returnPhotosHint =>
      'يمكنك إرفاق صور للمنتج تساعد المستودع يتحقق من السبب';

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
  String get profileTitle => 'البروفايل';

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
  String get noRatingsYet => 'ما في مستودع قيّمك لهلق.';

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
    return 'أضف $amount للوصول للحد الأدنى';
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
    return 'طلب #$number';
  }

  @override
  String returnableHoursLeft(String hours) {
    return 'باقي $hours ساعة';
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
      'تعذر فتح متجر Google Play. حاول مرة أخرى.';

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
      'عندك سلّة عند كل مستودع من هدول، وكل سلّة بتنبعت كطلب منفصل بفاتورته:';

  @override
  String submitAllButton(int count) {
    return 'إرسال كل الطلبات ($count)';
  }

  @override
  String get submitAllTitle => 'إرسال كل الطلبات؟';

  @override
  String submitAllConfirmation(String names) {
    return 'رح ينبعت طلب منفصل لكل مستودع، ولكل طلب فاتورته:\n$names';
  }

  @override
  String submitAllDone(int count) {
    return 'انبعتت كل الطلبات ($count).';
  }

  @override
  String submitAllPartial(int sent, int total) {
    return 'انبعت $sent من $total. الطلبات اللي ما انبعتت ضلّت بالسلّة مع السبب.';
  }

  @override
  String get submitThisWarehouseOnly => 'إرسال طلب هالمستودع بس';

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
  String get repSearchHint => 'ابحث بالاسم أو المسؤول أو الهاتف أو العنوان';

  @override
  String get repScanAction => 'مسح باركود الزيارة';

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
      other: '$count طلبية هذا الشهر',
      many: '$count طلبية هذا الشهر',
      few: '$count طلبيات هذا الشهر',
      two: 'طلبيتان هذا الشهر',
      one: 'طلبية واحدة هذا الشهر',
      zero: 'لا طلبيات هذا الشهر',
    );
    return '$_temp0';
  }

  @override
  String get repStatPharmacies => 'الصيدليات';

  @override
  String get repStatVisitsWeek => 'زيارات 7 أيام';

  @override
  String get repStatOrdersMonth => 'طلبيات الشهر';

  @override
  String get repStatSalesMonth => 'قيمتها';

  @override
  String get repStatCommissionMonth => 'عمولتك هذا الشهر';

  @override
  String repCommissionHint(String rate) {
    return 'عمولتك $rate من قيمة الطلبيات المسلَّمة لصيدلياتك عبر فينيق.';
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
  String get repRecentOrders => 'آخر الطلبيات';

  @override
  String get repNoOrdersYet => 'لا طلبيات من هذه الصيدلية بعد';

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
      'امسح باركود الصيدلية عند زيارتها لتسجيل الزيارة.';

  @override
  String get repVisitVerified => 'موثّقة';

  @override
  String get repVisitOutOfRange => 'خارج النطاق';

  @override
  String get repVisitMockLocation => 'موقع مزيّف';

  @override
  String get repVisitNoPharmacyLocation => 'الصيدلية بلا موقع';

  @override
  String repDistanceMeters(int meters) {
    return 'على بعد $meters م';
  }

  @override
  String get repScanTitle => 'مسح باركود الزيارة';

  @override
  String get repScanHint =>
      'وجّه الكاميرا نحو باركود فينيق الموجود عند الصيدلية.';

  @override
  String get repScanNotFeniq => 'هذا ليس باركود زيارة من فينيق.';

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
    return 'هاتفك على بعد $meters م من الصيدلية. اذهب إلى الصيدلية وامسح الباركود من جديد ليُوثَّق.';
  }

  @override
  String get repScanMockMessage =>
      'هاتفك يُبلّغ عن موقع مزيّف، لذلك لا يمكن توثيق الزيارة.';

  @override
  String get repScanNoLocationMessage =>
      'الصيدلية لم تحدد موقعها بعد، لذلك لا يمكن توثيق الزيارة.';

  @override
  String get repScanAnother => 'مسح باركود آخر';

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
      'نحتاج إذن الكاميرا لمسح الباركود. اسمح به من إعدادات التطبيق.';

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
  String get errorRepVisitCodeUnknown => 'لا توجد صيدلية بهذا الباركود.';

  @override
  String get errorRepVisitCodeInvalid => 'هذا ليس باركود زيارة من فينيق.';

  @override
  String get errorRepInactive => 'أوقف المستودع حساب المندوب الخاص بك.';

  @override
  String get errorRepInvalidLocation => 'تعذّرت قراءة موقعك. حاول مرة أخرى.';

  @override
  String get pharmacyVisitCodeTitle => 'باركود الزيارة';

  @override
  String get pharmacyVisitCodeSubtitle => 'للمناديب الذين يزورونك';

  @override
  String get pharmacyVisitCodeIntro =>
      'اعرض هذا الباركود لمندوب المستودع ليمسحه عند زيارتك. تُوثَّق الزيارة فقط إذا كان هاتفه عند صيدليتك.';

  @override
  String get panelHomeTitle => 'حساب المستودع';

  @override
  String panelHomeGreeting(String name) {
    return 'أهلاً $name';
  }

  @override
  String get panelHomeBody =>
      'شاشات المستودع جوّا التطبيق عم تنجهّز. لهلق، الطلبيات والأصناف والمناديب من لوحة المستودع.';

  @override
  String get panelHomeOpenPanel => 'افتح لوحة المستودع';

  @override
  String panelHomeOpenFailed(String url) {
    return 'ما قدرنا نفتح اللوحة. افتح $url من المتصفح.';
  }

  @override
  String get warehouseNavOrders => 'الطلبيات';

  @override
  String get warehouseNavAccount => 'الحساب';

  @override
  String get warehouseFilterAll => 'الكل';

  @override
  String get warehouseMarkDelivered => 'تم التسليم';

  @override
  String get warehouseConfirmApproveTitle => 'الطلبية طلعت ع الطريق؟';

  @override
  String warehouseConfirmApproveBody(int number) {
    return 'الطلبية رقم $number رح تطلع للصيدلية، وبعدها ما عاد فيك تعدّل أصنافها.';
  }

  @override
  String warehouseOrderTitle(int number) {
    return 'طلبية #$number';
  }

  @override
  String warehouseOrderItemsCount(int count) {
    return 'الأصناف: $count';
  }

  @override
  String get warehouseNoOrdersTitle => 'ما في طلبيات هون';

  @override
  String get warehouseNoOrdersSubtitle =>
      'الطلبيات الجديدة بتطلع هون أول ما توصل، وبيجيك إشعار فيها.';

  @override
  String get warehouseSectionPharmacy => 'الصيدلية';

  @override
  String get warehouseSectionItems => 'الأصناف';

  @override
  String get warehouseSectionMoney => 'المبالغ';

  @override
  String get warehouseSectionHistory => 'مراحل الطلبية';

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
  String get warehousePharmacyPays => 'الصيدلية بتدفع';

  @override
  String get warehouseFeniqShare => 'حصة فينيق';

  @override
  String get warehouseYouKeep => 'الصافي إلك';

  @override
  String warehouseRepCommissionTitle(String rate) {
    return 'عمولة المندوب ($rate%)';
  }

  @override
  String get warehouseRepShare => 'للمندوب';

  @override
  String get warehouseRepSaving => 'توفير إلك';

  @override
  String get warehouseEditItems => 'تعديل الأصناف';

  @override
  String get warehouseSaveEdits => 'حفظ التعديلات';

  @override
  String get warehouseRemoveLine => 'شيل';

  @override
  String get warehouseRestoreLine => 'رجّع';

  @override
  String get warehouseEditHint =>
      'إضافة صنف جديد أو تعديل عرض بتصير من لوحة المستودع.';

  @override
  String get warehouseConfirmSaveTitle => 'حفظ التعديلات؟';

  @override
  String get warehouseConfirmSaveBody =>
      'رح ينحسب سعر الطلبية من جديد، وبيوصل للصيدلية إشعار بالتعديل.';

  @override
  String get warehouseCannotEmpty =>
      'ما فيك تشيل كل الأصناف. إذا الطلبية ما بتمشي، احكي مع الصيدلية.';

  @override
  String get warehouseWaitingSeal =>
      'بانتظار صورة الختم من الصيدلية قبل التسليم.';

  @override
  String get warehouseHasReturn => 'عليها مرتجع';

  @override
  String warehouseCancelReason(String reason) {
    return 'سبب الإلغاء: $reason';
  }

  @override
  String get warehouseAccountPanelHint =>
      'الأصناف والعروض والمناديب والتقارير بلوحة المستودع.';

  @override
  String warehouseOrderAdvanced(int number, String status) {
    return 'صارت الطلبية رقم $number: $status';
  }

  @override
  String get errorCannotRemoveLastItem => 'ما فيك تشيل آخر صنف بالطلبية.';

  @override
  String get errorOrderAlreadyAdvanced =>
      'الطلبية انتقلت لمرحلة تانية. حدّث الصفحة.';

  @override
  String get errorOrderNotAdvanceable =>
      'هالطلبية ما عاد فيها تنتقل لمرحلة تانية.';

  @override
  String get errorOrderNotEditable =>
      'الطلبية انبعتت، وما عاد فيك تعدّل أصنافها.';

  @override
  String get errorPackageItemsLocked => 'أصناف العرض بتتعدّل من لوحة المستودع.';

  @override
  String get warehouseNavReturns => 'المرتجعات';

  @override
  String get warehouseNavAccounts => 'الحسابات';

  @override
  String get warehouseNavReps => 'المناديب';

  @override
  String warehouseReturnTitle(int number) {
    return 'مرتجع على الطلبية #$number';
  }

  @override
  String get warehouseReturnNoOrder => 'مرتجع';

  @override
  String warehouseReturnUnits(int count) {
    return '$count قطعة';
  }

  @override
  String get warehouseNoReturnsTitle => 'ما في مرتجعات هون';

  @override
  String get warehouseNoReturnsSubtitle =>
      'طلبات الإرجاع من الصيدليات بتطلع هون.';

  @override
  String get warehouseReturnPhotos => 'الصور';

  @override
  String get warehouseReturnPharmacyNotes => 'ملاحظات الصيدلية';

  @override
  String warehouseReturnCreditPreview(String amount) {
    return 'إذا وافقت، بينضاف لحساب الصيدلية: $amount';
  }

  @override
  String warehouseReturnCredited(String amount) {
    return 'انضاف لحساب الصيدلية: $amount';
  }

  @override
  String get warehouseReturnApprove => 'موافقة';

  @override
  String get warehouseReturnReject => 'رفض';

  @override
  String get warehouseReturnApproveTitle => 'الموافقة على المرتجع؟';

  @override
  String get warehouseReturnApproveBody =>
      'رح ينضاف المبلغ لحساب الصيدلية، وما بتنعكس من التطبيق.';

  @override
  String get warehouseReturnRejectTitle => 'رفض المرتجع';

  @override
  String get warehouseReturnRejectHint => 'اكتب سبب الرفض، بيوصل للصيدلية.';

  @override
  String warehouseReturnResolved(String status) {
    return 'صار المرتجع: $status';
  }

  @override
  String get warehouseNoAccountsTitle => 'ما في حسابات بعد';

  @override
  String get warehouseNoAccountsSubtitle =>
      'أول ما تتسلّم طلبية لصيدلية، بيطلع حسابها هون.';

  @override
  String get warehouseAccountsSearch => 'دوّر باسم الصيدلية أو الرقم';

  @override
  String warehouseAccountOwes(String amount) {
    return 'عليها $amount';
  }

  @override
  String warehouseAccountInCredit(String amount) {
    return 'إلها $amount';
  }

  @override
  String get warehouseAccountSettled => 'الحساب مسكّر';

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
  String get warehousePaymentMethodCash => 'كاش';

  @override
  String get warehousePaymentMethodBank => 'تحويل';

  @override
  String get warehousePaymentMethodCheque => 'شيك';

  @override
  String get warehousePaymentMethodOther => 'غير';

  @override
  String get warehousePaymentNote => 'ملاحظة (اختياري)';

  @override
  String warehousePaymentConfirm(String amount, String pharmacy) {
    return 'تسجيل $amount من $pharmacy؟';
  }

  @override
  String get warehousePaymentRecorded => 'انسجّلت الدفعة.';

  @override
  String get warehousePaymentReverseHint => 'لعكس دفعة غلط، من لوحة المستودع.';

  @override
  String get warehouseNoRepsTitle => 'ما في مناديب بعد';

  @override
  String get warehouseNoRepsSubtitle =>
      'ضيف مندوب، وبيفوت على تطبيق Feniq برقمه وكلمة السر.';

  @override
  String get warehouseAddRep => 'إضافة مندوب';

  @override
  String get warehouseRepName => 'الاسم';

  @override
  String get warehouseRepPhone => 'رقم الموبايل';

  @override
  String get warehouseRepPassword => 'كلمة السر (8 أحرف أو أكتر)';

  @override
  String get warehouseRepRate => 'نسبة العمولة (%)';

  @override
  String get warehouseRepRateHint =>
      'نصها للمندوب، ربعها لفينيق، والباقي توفير إلك. بين 0 و10.';

  @override
  String get warehouseRepInactive => 'موقوف';

  @override
  String warehouseRepStats(int pharmacies, int visits) {
    return '$pharmacies صيدلية · $visits زيارة بآخر 30 يوم';
  }

  @override
  String warehouseRepMonth(int orders, String amount) {
    return 'هالشهر: $orders طلبية · عمولته $amount';
  }

  @override
  String get warehouseRepEditRate => 'تعديل العمولة';

  @override
  String get warehouseRepEditRateHint => 'بتنطبق على الطلبيات الجديدة بس.';

  @override
  String get warehouseRepDeactivate => 'إيقاف المندوب';

  @override
  String get warehouseRepActivate => 'تشغيل المندوب';

  @override
  String get warehouseRepResetPassword => 'كلمة سر جديدة';

  @override
  String get warehouseRepPasswordReset =>
      'تغيّرت كلمة السر. بلّغ المندوب فيها.';

  @override
  String get warehouseRepSaved => 'تم الحفظ.';

  @override
  String get warehouseRepPharmacies => 'صيدلياته';

  @override
  String get warehouseRepNoPharmacies =>
      'ما في صيدليات معه. توزيع الصيدليات من لوحة المستودع.';

  @override
  String get warehouseRepVisits => 'زياراته';

  @override
  String get warehouseRepNoVisits => 'ما سجّل زيارات بعد.';

  @override
  String warehouseRepLastVisit(String date) {
    return 'آخر زيارة: $date';
  }

  @override
  String get warehouseRepNeverVisited => 'ما انزارت';

  @override
  String get warehouseFieldRequired => 'هالحقل مطلوب';

  @override
  String get warehouseInvalidNumber => 'اكتب رقم صحيح';

  @override
  String get errorInvalidCommissionRate => 'نسبة العمولة لازم تكون بين 0 و10.';

  @override
  String get errorInvalidPaymentAmount => 'المبلغ مو صحيح.';

  @override
  String get errorInvalidPhoneFormat => 'رقم الموبايل مو صحيح.';

  @override
  String get errorInvalidRepName => 'اكتب اسم المندوب.';

  @override
  String get errorNoTradingRelationship =>
      'ما في تعامل بينك وبين هالصيدلية لسا.';

  @override
  String get errorRepNotFound => 'ما لقينا المندوب.';

  @override
  String get errorReturnAlreadyResolved => 'هالمرتجع انحسم قبل. حدّث الصفحة.';

  @override
  String get warehouseLoyaltyTitle => 'حسم الولاء';

  @override
  String get warehouseLoyaltyIntro =>
      'حسم ثابت بتعطيه للصيدلية على الطلبية حسب قيمتها. إنت بتحدد الشرائح وإنت بتدفعه، وفينيق بتاخد حصتها من الباقي بعد الحسم.';

  @override
  String get warehouseLoyaltyEnabled => 'شغّل حسم الولاء';

  @override
  String get warehouseLoyaltyMin => 'إذا الطلبية من';

  @override
  String get warehouseLoyaltyDiscount => 'الحسم';

  @override
  String get warehouseLoyaltyAddTier => 'إضافة شريحة';

  @override
  String get warehouseLoyaltySave => 'حفظ حسم الولاء';

  @override
  String get warehouseLoyaltySaved => 'انحفظ حسم الولاء.';

  @override
  String get warehouseLoyaltyExample =>
      'مثال: طلبية بـ 100,000 أو أكتر ← حسم 2,000.';

  @override
  String get warehouseLoyaltyTierError =>
      'كل شريحة بدها قيمة طلبية أكبر من صفر وحسم أصغر منها.';

  @override
  String get warehouseLoyaltyOff => 'مطفي';

  @override
  String warehouseLoyaltyOnTiers(int count) {
    return 'شغّال · $count شرائح';
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
  String get warehouseRepShareToRep => 'أعطي ربعي للمندوب';

  @override
  String get warehouseRepShareToRepOn =>
      'ربعك صار للمندوب على الطلبيات الجديدة.';

  @override
  String get warehouseRepShareToRepOff => 'ربعك رجع إلك على الطلبيات الجديدة.';

  @override
  String get warehouseRepShareGiven => 'ربعك للمندوب';

  @override
  String get warehouseRepQuartersHint =>
      'ربع لفينيق، ربع رصيد للصيدلية، ربع للمندوب، والربع الأخير إلك أو للمندوب. بين 0 و10.';

  @override
  String get errorInvalidLoyaltyTiers =>
      'كل شريحة بدها قيمة طلبية أكبر من صفر وحسم أصغر منها، ولا شريحتين بنفس القيمة.';

  @override
  String get errorLoyaltyTiersRequired =>
      'ضيف شريحة وحدة ع الأقل قبل ما تشغّل حسم الولاء.';

  @override
  String get stageAccepted => 'انقبلت';

  @override
  String get stageAcceptedDesc => 'المستودع قبل طلبيتك';

  @override
  String get warehouseAccept => 'قبول';

  @override
  String get warehouseSendOnWay => 'طلعت ع الطريق';

  @override
  String warehouseCollectTitle(int number) {
    return 'تسليم الطلبية رقم $number - قبضت؟';
  }

  @override
  String warehouseCollectTotal(String amount) {
    return 'المبلغ: $amount';
  }

  @override
  String get warehouseCollectFull => 'كامل';

  @override
  String get warehouseCollectPartial => 'جزء';

  @override
  String get warehouseCollectLater => 'بعدين';

  @override
  String warehouseCollectPaidLabel(String currency) {
    return 'دفع هلق ($currency)';
  }

  @override
  String warehouseCollectLeft(String amount) {
    return 'ضل: $amount';
  }

  @override
  String get warehouseCollectSave => 'سلّم واحفظ';

  @override
  String get warehouseCollectPartialInvalid =>
      'اكتب مبلغ أكبر من صفر وأصغر من المبلغ كله.';

  @override
  String warehouseCollectRecorded(String amount) {
    return 'تم التسليم، وانسجّل $amount مدفوع';
  }

  @override
  String get warehouseCollectFailed =>
      'تم التسليم، بس الدفعة ما انحفظت - سجّلها من الحسابات.';

  @override
  String warehouseCollectNote(int number) {
    return 'دفعة عند تسليم الطلبية رقم $number';
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
  String get warehouseAccountNoPayment => 'ما دفعت لسا';

  @override
  String get warehouseAccountPayFull => 'دفع كامل';

  @override
  String get warehouseAccountPayPartial => 'دفعة جزئية';

  @override
  String warehouseAccountPayFullConfirm(String amount) {
    return 'تسجّل دفعة نقدية $amount؟';
  }

  @override
  String warehouseAccountPayOwes(String amount) {
    return 'عليها: $amount';
  }

  @override
  String get warehouseAccountPaySave => 'سجّل الدفعة';

  @override
  String get warehouseAccountPayInvalid =>
      'اكتب مبلغ أكبر من صفر وأصغر من المبلغ المطلوب.';

  @override
  String warehouseAccountPayRecorded(String amount) {
    return 'انسجّلت دفعة $amount';
  }

  @override
  String get warehouseAccountPayFailed => 'الدفعة ما انحفظت. جرّب مرة تانية.';

  @override
  String get warehouseVoiceTitle => 'تسجيل دفعة بالصوت';

  @override
  String get warehouseVoiceHint =>
      'احكي مثلاً: «صيدلية النور دفعت خمسين ألف» أو «صيدلية الأمل دفعت المبلغ كامل».';

  @override
  String get warehouseVoiceSpeak => 'اضغط واحكي';

  @override
  String get warehouseVoiceStop => 'وقّف';

  @override
  String get warehouseVoiceHeard => 'اللي انسمع (بتقدر تعدّله)';

  @override
  String get warehouseVoiceNoMic =>
      'الصوت مو متاح بهالموبايل. اكتب الجملة بالخانة.';

  @override
  String get warehouseVoiceNotUnderstood =>
      'ما فهمت الجملة. جرّب: اسم الصيدلية + دفعت + المبلغ.';

  @override
  String get warehouseVoiceNoPharmacy => 'ما لقيت هالصيدلية. عدّل الاسم.';

  @override
  String warehouseVoiceOwes(String amount) {
    return 'عليها $amount';
  }

  @override
  String warehouseVoiceWillRecord(String amount) {
    return 'رح تنسجّل دفعة $amount';
  }

  @override
  String warehouseVoiceLeftAfter(String amount) {
    return 'بيضل عليها $amount';
  }

  @override
  String get warehouseVoiceCannotRecord =>
      'المبلغ ما بيركب مع حساب هالصيدلية (يا صفر، يا أكبر من المطلوب).';

  @override
  String get warehouseVoiceConfirm => 'تمام، سجّل';

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
    return 'رصيد للصيدليات عندك: $amount';
  }

  @override
  String warehouseSummaryChangeUp(int percent) {
    return '▲ $percent% عن الفترة السابقة';
  }

  @override
  String warehouseSummaryChangeDown(int percent) {
    return '▼ $percent% عن الفترة السابقة';
  }

  @override
  String get warehouseSummaryChangeFlat => 'متل الفترة السابقة';

  @override
  String get warehouseSummaryChangeNew => 'ما كان في شي بالفترة السابقة';

  @override
  String get warehouseSummaryTopBuyers => 'أكتر الصيدليات شراءً';

  @override
  String get warehouseSummaryTopDebtors => 'أكبر الديون';

  @override
  String get warehouseSummaryNoBuyers => 'ما في مبيعات بهالفترة.';

  @override
  String get warehouseSummaryNoDebtors => 'ما في ديون.';

  @override
  String get warehouseSummaryDeliveredNote =>
      'المبيعات بتحسب الطلبيات المتسلَّمة بس.';
}
