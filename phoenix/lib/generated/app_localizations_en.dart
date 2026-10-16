// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appName => 'Feniq';

  @override
  String get login => 'Login';

  @override
  String get logout => 'Logout';

  @override
  String get email => 'Email';

  @override
  String get password => 'Password';

  @override
  String get settings => 'Settings';

  @override
  String get language => 'Language';

  @override
  String get theme => 'Theme';

  @override
  String get light => 'Light';

  @override
  String get dark => 'Dark';

  @override
  String get system => 'System';

  @override
  String get save => 'Save';

  @override
  String get cancel => 'Cancel';

  @override
  String get welcome => 'Welcome';

  @override
  String get home => 'Home';

  @override
  String get profile => 'Profile';

  @override
  String get registrationTitle => 'Create your pharmacy account';

  @override
  String get registrationSubtitle =>
      'Fill in the details below - your account is activated once the administration reviews your documents.';

  @override
  String get fullNameLabel => 'Full name';

  @override
  String get fullNameHint => 'e.g. Dr. Samer Halabi';

  @override
  String get pharmacyNameLabel => 'Pharmacy name';

  @override
  String get pharmacyNameHint => 'e.g. Al-Noor Pharmacy';

  @override
  String get phoneLabel => 'Phone number';

  @override
  String get addressLabel => 'Address';

  @override
  String get confirmLocationButton => 'Choose this location';

  @override
  String get locationConfirmedText => 'Location chosen';

  @override
  String get changeLocationButton => 'Change location';

  @override
  String get confirmLocationRequiredError =>
      'Tap \"Choose this location\" to confirm the pharmacy\'s location';

  @override
  String get pickLocationHint =>
      'Move the map to fine-tune the pin\'s position';

  @override
  String get resolvingAddressText => 'Resolving address...';

  @override
  String get locationPermissionDeniedMessage =>
      'Couldn\'t access your location - you can still drag the map manually.';

  @override
  String get addressNotResolvedYetMessage =>
      'Please wait for the map to resolve an address, or adjust the pin\'s position.';

  @override
  String get useCurrentLocationTooltip => 'My current location';

  @override
  String get areaTypeLabel => 'Area type';

  @override
  String get areaTypeCity => 'City';

  @override
  String get areaTypeCityRing => 'City ring';

  @override
  String get areaTypeRural => 'Rural';

  @override
  String get confirmPasswordLabel => 'Confirm password';

  @override
  String get confirmPasswordHint => 'Re-enter your password';

  @override
  String passwordHint(String min) {
    return 'At least $min characters';
  }

  @override
  String get passwordTooShort => 'Password must be at least 8 characters.';

  @override
  String get passwordMismatch => 'Passwords do not match.';

  @override
  String get alreadyHaveAccountLink =>
      'Already have an account? Log in with password';

  @override
  String get sendCodeButton => 'Send verification code';

  @override
  String get createAccountButton => 'Create account';

  @override
  String get termsAgreementLabel =>
      'I agree to the Terms of Use and Privacy Policy.';

  @override
  String get termsAgreementRequiredError =>
      'You must agree to the terms to continue.';

  @override
  String get passwordsMustMatchHint => 'Both passwords must match.';

  @override
  String get passwordLoginTitle => 'Log in with password';

  @override
  String get passwordLoginSubtitle => 'Enter your phone number and password';

  @override
  String get backToRegistrationLink => 'New here? Create an account';

  @override
  String get forgotPasswordSupportLink =>
      'Forgot your password? Contact support on WhatsApp';

  @override
  String get forgotPasswordSupportMessage =>
      'Hello, I would like to recover the password for my account. Pharmacy/warehouse name: ___ Registered phone number: ___';

  @override
  String whatsAppUnavailable(String phone) {
    return 'Couldn\'t open WhatsApp. Support number: $phone';
  }

  @override
  String get copyAction => 'Copy';

  @override
  String get phoneCopied => 'Number copied.';

  @override
  String get otpTitle => 'Enter verification code';

  @override
  String get otpInstructionsPrefix => 'Enter the 6-digit code sent to';

  @override
  String get otpCodeLabel => 'Verification code';

  @override
  String get verifyButton => 'Verify';

  @override
  String get resendCodeButton => 'Didn\'t get the code? Resend';

  @override
  String get codeResent => 'A new code has been sent.';

  @override
  String get approvalPendingTitle => 'Your account is under review';

  @override
  String get approvalPendingMessage =>
      'We\'re reviewing your registration. You\'ll be able to order as soon as it\'s approved.';

  @override
  String approvalPendingMessageWithName(String pharmacyName) {
    return 'We\'re currently reviewing $pharmacyName\'s documents. You\'ll be able to order as soon as it\'s approved.';
  }

  @override
  String get approvalPendingBlockedTitle => 'Account blocked';

  @override
  String get approvalPendingBlockedMessage =>
      'This account has been blocked. Please contact support for help.';

  @override
  String get approvalChecklistReceived => 'Data and documents received';

  @override
  String get approvalChecklistReview => 'Under administration review';

  @override
  String get approvalChecklistActivate => 'Account activation and ordering';

  @override
  String get refreshStatusButton => 'Check status';

  @override
  String get contactSupportButton => 'Contact support';

  @override
  String get contactSupportDialogTitle => 'Contact support';

  @override
  String get contactSupportDialogMessage =>
      'For help with your account, please contact Al-Najah Warehouse support.';

  @override
  String get fieldRequired => 'This field is required.';

  @override
  String get invalidPhoneNumber => 'Please enter a valid phone number.';

  @override
  String get invalidOtpCode => 'Please enter the 6-digit code.';

  @override
  String get close => 'Close';

  @override
  String get errorState => 'Something went wrong.';

  @override
  String get errorNetwork =>
      'Unable to connect to the internet. Check your connection and try again.';

  @override
  String get errorTimeout =>
      'The request took longer than expected. Please try again.';

  @override
  String get errorServer => 'A server error occurred. Please try again later.';

  @override
  String get errorNotFound => 'The requested data could not be found.';

  @override
  String get errorSessionExpired =>
      'Your session has expired. Please sign in again.';

  @override
  String get errorNoPermission =>
      'You don\'t have permission to perform this action.';

  @override
  String get noMoreResultsText => 'No more results';

  @override
  String get retryButton => 'Retry';

  @override
  String get warehouseSelectionTitle => 'Choose a warehouse';

  @override
  String get selectWarehouseButton => 'Select';

  @override
  String get noWarehousesAvailable => 'No warehouses available yet.';

  @override
  String warehouseSelectedMessage(String name) {
    return '$name selected. The product catalog is coming soon.';
  }

  @override
  String warehousesAvailableSubtitle(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count warehouses available for your pharmacy',
      one: '1 warehouse available for your pharmacy',
      zero: 'No warehouses available for your pharmacy',
    );
    return '$_temp0';
  }

  @override
  String get searchWarehouseHint => 'Search by warehouse or city';

  @override
  String get noSearchResultsFound => 'No results match your search.';

  @override
  String get warehouseProfileButtonLabel => 'Profile';

  @override
  String get warehousesScopeMyCity => 'My city';

  @override
  String get warehousesScopeAllCities => 'All cities';

  @override
  String get viewAllCitiesButton => 'View all cities';

  @override
  String get noWarehousesInYourCity => 'No warehouses in your city';

  @override
  String get noWarehousesInYourCitySubtitle =>
      'Try broadening the search to other cities.';

  @override
  String get noManufacturersFound =>
      'No manufacturers available for this warehouse.';

  @override
  String manufacturersCountSubtitle(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count manufacturers',
      one: '1 manufacturer',
      zero: 'No manufacturers',
    );
    return '$_temp0';
  }

  @override
  String companyDiscountValue(String percent) {
    return 'Company Discount: $percent%';
  }

  @override
  String get warehouseProfileTooltip => 'Warehouse info';

  @override
  String get deliveryInfoTitle => 'Delivery Information';

  @override
  String deliveryHoursValue(String start, String end) {
    return 'From $start to $end';
  }

  @override
  String get deliveryHoursNotSet => 'Not specified';

  @override
  String get deliveryTypeSelfLabel => 'Delivered by the warehouse itself';

  @override
  String get deliveryTypeThirdPartyLabel =>
      'Delivered by a third-party courier';

  @override
  String get deliveryInfoDisclaimer =>
      'This information is for display only and doesn\'t prevent placing an order.';

  @override
  String get warehouseReviewsTitle => 'Reviews';

  @override
  String get noWarehouseReviewsYet => 'No reviews yet.';

  @override
  String get anonymousReviewerName => 'User';

  @override
  String get browseWarehouseProductsButton =>
      'Browse this warehouse\'s products';

  @override
  String get searchProductsHint => 'Search by name or manufacturer';

  @override
  String get searchWarehouseProductsHint =>
      'Search all of this warehouse\'s products';

  @override
  String get addToCartButton => 'Add';

  @override
  String get unavailableLabel => 'Unavailable';

  @override
  String offlineBannerMessage(String time) {
    return 'No connection - showing the copy saved on your phone from $time. Prices and availability may have changed, and sending an order needs a connection.';
  }

  @override
  String offlineToastMessage(String time) {
    return 'No connection - showing the saved copy ($time)';
  }

  @override
  String productionDateShort(String date) {
    return 'Made $date';
  }

  @override
  String expiryDateShort(String date) {
    return 'Exp. $date';
  }

  @override
  String bonusInsteadOf(String tiers, String regular) {
    return 'Bonus $tiers instead of $regular';
  }

  @override
  String get alternativesLink => 'Alternatives';

  @override
  String get alternativesTitle => 'Alternatives';

  @override
  String get alternativesSubtitle =>
      'Same active ingredient, strength and form';

  @override
  String get alternativesEmpty => 'No alternatives in this warehouse.';

  @override
  String get alternativesHereTitle => 'In this warehouse';

  @override
  String get alternativesNoneEverywhere =>
      'No alternatives here or at any other warehouse.';

  @override
  String get alternativesElsewhereTitle => 'At other warehouses';

  @override
  String get alternativesElsewhereHint => 'Tap one to go to its warehouse.';

  @override
  String get alternativesSameMedicine => 'Same medicine';

  @override
  String get alternativesGoToWarehouse => 'Go to warehouse';

  @override
  String get offerBadgeLabel => 'Offer';

  @override
  String get toggleDensityTooltip => 'Toggle view';

  @override
  String get noProductsFound => 'No products found.';

  @override
  String catalogItemsCountSubtitle(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count items',
      one: '1 item',
      zero: 'No items',
    );
    return '$_temp0';
  }

  @override
  String get currencySuffix => 'SYP';

  @override
  String addedToCartMessage(String name) {
    return '$name added to cart.';
  }

  @override
  String get cartTitle => 'Cart';

  @override
  String get cartEmptyMessage => 'Your cart is empty.';

  @override
  String get cartEmptyHint =>
      'Choose a warehouse and start adding medicines to your cart.';

  @override
  String get browseCatalogButton => 'Browse products';

  @override
  String get quantityLabel => 'Quantity';

  @override
  String get decreaseQuantityLabel => 'Decrease quantity';

  @override
  String get increaseQuantityLabel => 'Increase quantity';

  @override
  String get notesLabel => 'Notes (optional)';

  @override
  String get subtotalLabel => 'Subtotal';

  @override
  String get submitOrderButton => 'Submit order';

  @override
  String get submitOrderTitle => 'Submit order?';

  @override
  String submitOrderConfirmation(String warehouseName) {
    return 'Send this order to $warehouseName?';
  }

  @override
  String get orderSubmittedTitle => 'Order submitted';

  @override
  String orderSubmittedMessage(String orderNumber) {
    return 'Your order #$orderNumber has been submitted.';
  }

  @override
  String get removeItemTitle => 'Remove item?';

  @override
  String removeItemConfirmation(String name) {
    return 'Remove $name from your cart?';
  }

  @override
  String get removeButton => 'Remove';

  @override
  String get clearCartButton => 'Clear cart';

  @override
  String get clearCartTitle => 'Clear cart?';

  @override
  String get clearCartConfirmation =>
      'Are you sure you want to clear all the contents of your cart?';

  @override
  String get cartIconTooltip => 'Cart';

  @override
  String get reorderButton => 'Reorder';

  @override
  String get addProductButton => 'Add product';

  @override
  String get reorderReplaceCartTitle => 'Replace your cart?';

  @override
  String get reorderReplaceCartMessage =>
      'Your current cart will be replaced with the items from this order. You can still edit everything before checkout.';

  @override
  String get reorderReplaceCartConfirm => 'Replace cart';

  @override
  String get reorderUnavailableTitle => 'Some items are unavailable';

  @override
  String get reorderNoItemsMessage =>
      'None of this order\'s products are available from this warehouse anymore.';

  @override
  String reorderSomeItemsUnavailable(String names) {
    return 'These items are no longer sold by this warehouse and were not added: $names';
  }

  @override
  String get advertisementsSectionTitle => 'Special packages';

  @override
  String get advertisementPackageTotal => 'Package price';

  @override
  String advertisementSavingPercent(int percent) {
    return 'Save $percent%';
  }

  @override
  String advertisementProductCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count products',
      one: '1 product',
    );
    return '$_temp0';
  }

  @override
  String advertisementItemQuantity(int count) {
    return '× $count';
  }

  @override
  String get packageBadge => 'Package';

  @override
  String get packageCopiesLabel => 'package copies';

  @override
  String get advertisementDiscountLabel => 'Package discount';

  @override
  String get advertisementTotalToPay => 'Total to pay';

  @override
  String get advertisementAddToCartButton => 'Add package to cart';

  @override
  String get advertisementReplaceCartTitle => 'Replace your cart?';

  @override
  String get advertisementReplaceCartMessage =>
      'Your current cart will be replaced with this package. You can still edit everything before checkout.';

  @override
  String get advertisementReplaceCartConfirm => 'Replace cart';

  @override
  String get advertisementUnavailableTitle => 'Package unavailable';

  @override
  String get advertisementUnavailableMessage =>
      'This package is no longer available. It may have expired or been withdrawn.';

  @override
  String get packageUnavailableBanner =>
      'This package is no longer available. You won\'t be able to place the order with it.';

  @override
  String packageUnavailableCheckoutMessage(String names) {
    return 'No longer available: $names. The order wasn\'t placed — remove it from your cart to continue.';
  }

  @override
  String get errorPackageUnavailable => 'This package is no longer available.';

  @override
  String get errorIdempotencyKeyReused =>
      'An earlier attempt already placed an order from this cart before you changed it. Check My Orders, then submit again to place your updated cart as a new order.';

  @override
  String get removeUnavailablePackagesButton => 'Remove from cart';

  @override
  String advertisementIncompleteMessage(String names) {
    return 'Some products in this package are no longer sold by this warehouse, so it can\'t be added: $names';
  }

  @override
  String get advertisementPackageBrokenMessage =>
      'Removing a product ends the package price. The remaining items are now priced normally.';

  @override
  String get advertisementsLoading => 'Loading packages...';

  @override
  String get advertisementsEmpty => 'No packages are running right now.';

  @override
  String get advertisementsError => 'Packages couldn\'t be loaded.';

  @override
  String get notificationsTitle => 'Notifications';

  @override
  String get noNotificationsYet => 'No notifications yet';

  @override
  String get noNotificationsYetHint =>
      'Order updates and offers will show up here.';

  @override
  String get markAllAsRead => 'Mark all as read';

  @override
  String get errorInvalidRequest =>
      'Something about this request wasn\'t valid. Please try again.';

  @override
  String get errorQuantityTooLarge =>
      'A single item can\'t exceed 10,000 units per order. Please lower the quantity.';

  @override
  String get errorInvalidCredentials =>
      'The phone number or password is incorrect.';

  @override
  String get errorAccountBlocked =>
      'This account has been blocked. Please contact support.';

  @override
  String get errorAccountNotFound =>
      'No account found for this phone number. Please create one first.';

  @override
  String get errorPharmacyNotFound =>
      'We couldn\'t find your pharmacy profile. Please contact support.';

  @override
  String get errorWarehouseNotFound => 'This warehouse is no longer available.';

  @override
  String get errorExchangeRateUnavailable =>
      'Prices can\'t be confirmed right now. Please try again shortly.';

  @override
  String get errorStockCheckFailedGeneric =>
      'Some items in your cart are no longer available as requested.';

  @override
  String errorProductUnavailable(String name) {
    return '$name is currently unavailable.';
  }

  @override
  String errorProductNotFound(String name) {
    return '$name is no longer available.';
  }

  @override
  String get errorPriceChangedGeneric =>
      'Some prices in your cart have changed.';

  @override
  String get errorBonusChangedGeneric =>
      'The bonus changed on some items in your cart.';

  @override
  String bonusValue(String tiers) {
    return 'Bonus $tiers';
  }

  @override
  String freeUnits(int count) {
    return '+$count free';
  }

  @override
  String get noBonus => 'No bonus';

  @override
  String bonusChangedLine(String name, String bonus) {
    return '$name: $bonus';
  }

  @override
  String errorPriceChanged(String name, String newPrice, String oldPrice) {
    return '$name is now $newPrice (was $oldPrice).';
  }

  @override
  String get priceChangedConfirmHint =>
      'Submit again to place the order at the new prices.';

  @override
  String get errorRateChangedTitle => 'The exchange rate changed';

  @override
  String rateChangedTotals(String newTotal, String oldTotal) {
    return 'Your order comes to $newTotal at the new rate, instead of $oldTotal.';
  }

  @override
  String get rateChangedConfirmHint =>
      'Submit again to place the order at the new rate.';

  @override
  String get thisItemFallback => 'This item';

  @override
  String get loading => 'Loading...';

  @override
  String get orderTrackingTitle => 'Order Tracking';

  @override
  String orderNumberLabel(String number) {
    return 'Order #$number';
  }

  @override
  String get stageSent => 'Sent';

  @override
  String get stageUnderReview => 'Waiting for Approval';

  @override
  String get stagePreparing => 'Preparing';

  @override
  String get stageOutForDelivery => 'On the Way';

  @override
  String get stageDelivered => 'Delivered';

  @override
  String get stageCancelled => 'Cancelled';

  @override
  String get stageModified => 'Order modified';

  @override
  String get stageUnderReviewDesc => 'Your order has reached the warehouse';

  @override
  String get stagePreparingDesc => 'The warehouse is preparing your order';

  @override
  String get stageOutForDeliveryDesc => 'Your order has left the warehouse';

  @override
  String get stageDeliveredDesc => 'You received the order';

  @override
  String get statusHistoryTitle => 'Status history';

  @override
  String lastUpdatedLabel(String time) {
    return 'Last updated: $time';
  }

  @override
  String get cancelOrderTitle => 'Cancel order?';

  @override
  String get cancelOrderConfirmation =>
      'Are you sure you want to cancel this order?';

  @override
  String get cancelOrderButton => 'Cancel order';

  @override
  String get orderCancelledMessage => 'This order has been cancelled.';

  @override
  String get contactWarehouseForChanges =>
      'For any changes now, please contact the warehouse directly.';

  @override
  String get orderModifiedBannerTitle =>
      'This order was modified by the warehouse';

  @override
  String get errorOrderNotFound => 'This order could not be found.';

  @override
  String get errorOrderNotCancellable =>
      'This order can no longer be cancelled from the app.';

  @override
  String get myOrdersTitle => 'My Orders';

  @override
  String myOrdersCountSubtitle(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count orders · pull down to refresh',
      one: '1 order · pull down to refresh',
      zero: 'No orders yet',
    );
    return '$_temp0';
  }

  @override
  String get refreshTooltip => 'Refresh';

  @override
  String get noOrdersYet => 'You haven\'t placed any orders yet.';

  @override
  String get browseWarehousesButton => 'Browse warehouses';

  @override
  String get invoiceTitle => 'Order items';

  @override
  String get discountLabel => 'Discount';

  @override
  String get invoiceTotalLabel => 'Total';

  @override
  String youSavedLabel(String amount) {
    return '💰 You saved $amount';
  }

  @override
  String totalSavingsLabel(String amount) {
    return '💰 Total savings: $amount (including offer discounts and manufacturer discount)';
  }

  @override
  String get returnsTitle => 'Returns';

  @override
  String returnsCountSubtitle(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count return requests',
      one: '1 return request',
      zero: 'No return requests',
    );
    return '$_temp0';
  }

  @override
  String get noReturnsYet => 'You haven\'t requested any returns yet.';

  @override
  String get noReturnsYetHint =>
      'Once you request a return on a delivered order, it will show up here so you can follow its status.';

  @override
  String get noReturnableOrdersTitle => 'No orders eligible for return';

  @override
  String get myReturnsListSectionTitle => 'Your return requests';

  @override
  String get newReturnRequestButton => 'New return request';

  @override
  String get selectOrderForReturnTitle =>
      'Select the order you want to return items from';

  @override
  String get noEligibleOrdersForReturn =>
      'No delivered orders are currently eligible for a return.';

  @override
  String get requestReturnTitle => 'Request a return';

  @override
  String get requestReturnButton => 'Submit return request';

  @override
  String get requestReturnAction => 'Request Return';

  @override
  String get accountHistoryTitle => 'Account History';

  @override
  String get moneySavedTitle => 'Money Saved';

  @override
  String get fromDiscountsLabel => 'From Discounts';

  @override
  String get debtsTitle => 'Debts';

  @override
  String get outstandingBalanceLabel => 'Outstanding Balance';

  @override
  String get viewReturnsLabel => 'View Returns';

  @override
  String returnsRequestsShort(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count requests',
      one: '1 request',
      zero: 'No requests',
    );
    return '$_temp0';
  }

  @override
  String get returnQuantityLabel => 'Quantity';

  @override
  String get returnReasonLabel => 'Reason';

  @override
  String get reasonDamaged => 'Damaged';

  @override
  String get reasonWrongItem => 'Wrong item';

  @override
  String get reasonOther => 'Other';

  @override
  String get multipleReasonsLabel => 'Multiple reasons';

  @override
  String get customReasonLabel => 'Please specify';

  @override
  String get returnSubmittedTitle => 'Return requested';

  @override
  String get returnSubmittedMessage =>
      'Your return request has been submitted. The warehouse will review it.';

  @override
  String get returnStatusPending => 'Pending review';

  @override
  String get returnStatusApproved => 'Approved';

  @override
  String get returnStatusRejected => 'Rejected';

  @override
  String get returnPickItemsLabel => 'Select the items you\'re returning';

  @override
  String get returnRejectionNoteLabel => 'Rejection reason';

  @override
  String returnCreditedLabel(String amount) {
    return 'Credited to your account: $amount';
  }

  @override
  String get editButton => 'Edit';

  @override
  String get deleteReturnButton => 'Delete';

  @override
  String get deleteReturnConfirmTitle => 'Delete return request?';

  @override
  String get deleteReturnConfirmMessage =>
      'Are you sure you want to delete this return request?';

  @override
  String get returnApprovedBanner =>
      'Return approved — your account has been credited';

  @override
  String get returnPendingReviewBanner =>
      'Return submitted, awaiting the warehouse\'s review';

  @override
  String get returnRejectedBanner => 'Return rejected';

  @override
  String get errorOrderNotDelivered => 'This order hasn\'t been delivered yet.';

  @override
  String get errorOrderNotReorderable =>
      'Only delivered orders can be reordered.';

  @override
  String get errorOrderItemNotFound =>
      'This item could not be found in the order.';

  @override
  String get errorReturnQuantityExceeded =>
      'The return quantity exceeds what\'s available to return for this item.';

  @override
  String get errorCustomReasonRequired =>
      'Please describe the reason for this return.';

  @override
  String get errorTooManyReturnPhotos => 'You can attach up to 5 photos.';

  @override
  String get errorInvalidReturnPhoto =>
      'One of the attached photos is not a valid image.';

  @override
  String get errorReturnAlreadyExists =>
      'A return request has already been submitted for this order.';

  @override
  String get errorReturnNotEditable =>
      'This return request has already been decided and can no longer be changed.';

  @override
  String get errorReturnItemsEmpty =>
      'Please select at least one item to return.';

  @override
  String get errorDuplicateReturnItem =>
      'Each item can only appear once in a return request.';

  @override
  String get errorRejectionNoteRequired =>
      'Please explain why this return is being rejected.';

  @override
  String get returnPhotosLabel => 'Photos (optional)';

  @override
  String get returnPhotosHint =>
      'Optionally add photos of the item to help the warehouse verify the reason';

  @override
  String get addPhotoButton => 'Add photo';

  @override
  String get cameraOption => 'Take a photo';

  @override
  String get galleryOption => 'Choose from gallery';

  @override
  String get permissionRequiredTitle => 'Permission needed';

  @override
  String get cameraPermissionDenied =>
      'Camera access is needed to take a photo. You can enable it in Settings.';

  @override
  String get openSettings => 'Open Settings';

  @override
  String get navWarehouses => 'Warehouses';

  @override
  String get profileTitle => 'Profile';

  @override
  String get personalInfoTitle => 'Personal information';

  @override
  String get cityLabel => 'City';

  @override
  String get logoutConfirmTitle => 'Log out?';

  @override
  String get logoutConfirmMessage => 'Are you sure you want to log out?';

  @override
  String get dangerZoneTitle => 'Danger zone';

  @override
  String get deleteAccount => 'Delete account';

  @override
  String get deleteAccountSubtitle => 'Permanently delete your account';

  @override
  String get deleteAccountConfirmTitle => 'Delete your account permanently?';

  @override
  String get deleteAccountConfirmMessage =>
      'Your account will be deleted permanently and you will not be able to sign in again. This cannot be undone.\n\nYour past orders and financial records will remain in the records of the warehouses you dealt with.\n\nEnter your password to confirm.';

  @override
  String get deleteAccountPasswordLabel => 'Password';

  @override
  String get deleteAccountPasswordRequired =>
      'Enter your password to continue.';

  @override
  String get deleteAccountConfirmAction => 'Delete permanently';

  @override
  String get deleteAccountSuccess => 'Your account has been deleted.';

  @override
  String get errorPhoneAlreadyRegistered =>
      'An account already exists for this phone number. Please sign in instead.';

  @override
  String get errorInvalidCurrentPassword => 'That password is incorrect.';

  @override
  String get yourRatingTitle => 'Your rating';

  @override
  String get ratingsTitle => 'Ratings';

  @override
  String get viewRatingsLabel => 'View Ratings';

  @override
  String get noRatingsYet => 'No warehouse has rated you yet.';

  @override
  String ratingSummary(String average, String count) {
    return '$average average ($count ratings)';
  }

  @override
  String get myDebtsTitle => 'My Debts';

  @override
  String get noDebtsYet => 'No debts right now.';

  @override
  String get totalDebtsLabel => 'Total debts';

  @override
  String get totalOrdersLabel => 'Total orders';

  @override
  String get totalPaidLabel => 'Total paid';

  @override
  String get currentBalanceLabel => 'Current balance';

  @override
  String get creditBalanceLabel => 'Credit balance';

  @override
  String get deliveredOrdersTitle => 'Delivered orders';

  @override
  String get paymentsTitle => 'Payments';

  @override
  String get noPaymentsYet => 'No payments recorded yet.';

  @override
  String get rateWarehouseTitle => 'Rate the warehouse';

  @override
  String get rateWarehouseCommentLabel => 'Comment (optional)';

  @override
  String get submitReviewButton => 'Submit rating';

  @override
  String get submitReviewConfirmTitle => 'Submit rating?';

  @override
  String get submitReviewConfirmMessage =>
      'You won\'t be able to change this rating after sending it. Continue?';

  @override
  String reviewThankYouTitle(String rating) {
    return 'Thanks — you rated this order $rating stars';
  }

  @override
  String get errorAlreadyReviewed => 'This order has already been rated.';

  @override
  String minOrderLabel(String amount) {
    return 'Minimum order: $amount';
  }

  @override
  String maxOrderLabel(String amount) {
    return 'Maximum order: $amount';
  }

  @override
  String addMoreToReachMinimum(String amount) {
    return 'Add $amount more to reach the minimum';
  }

  @override
  String removeToMeetMaximum(String amount) {
    return 'Over the $amount maximum — remove some items';
  }

  @override
  String orderBelowMinimum(String amount) {
    return 'The minimum order from this warehouse is $amount.';
  }

  @override
  String orderAboveMaximum(String amount) {
    return 'The maximum order from this warehouse is $amount.';
  }

  @override
  String get loadingOrderLimits => 'Updating the order limits';

  @override
  String get returnableSectionTitle => 'Orders eligible for return';

  @override
  String get returnableSectionSubtitle =>
      'You can request a return within 24 hours of delivery';

  @override
  String returnableDeliveredOnLabel(String date) {
    return 'Delivered $date';
  }

  @override
  String returnableOrderNumber(String number) {
    return 'Order #$number';
  }

  @override
  String returnableHoursLeft(String hours) {
    return '${hours}h left';
  }

  @override
  String get returnableEndingSoon => 'Ending soon';

  @override
  String get returnableRequestButton => 'Request a return';

  @override
  String returnableMoreItems(String count) {
    return '+$count more';
  }

  @override
  String get returnWindowExpired =>
      'A return must be requested within 24 hours of delivery.';

  @override
  String get privacyPolicy => 'Privacy Policy';

  @override
  String privacyPolicyLastUpdated(String date) {
    return 'Last updated: $date';
  }

  @override
  String get complaintsTitle => 'Complaints';

  @override
  String get complaintsProfileSubtitle =>
      'File a complaint about a warehouse and follow its status';

  @override
  String complaintsCountSubtitle(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count complaints',
      one: '1 complaint',
      zero: 'No complaints yet',
    );
    return '$_temp0';
  }

  @override
  String get noComplaintsYet => 'You haven\'t filed any complaints yet.';

  @override
  String get noComplaintsYetHint =>
      'If you run into a problem with a warehouse, you can file a complaint for the administration to review.';

  @override
  String get submitComplaintCta => 'Submit a complaint';

  @override
  String get submitComplaintTitle => 'Submit a complaint';

  @override
  String get submitComplaintButton => 'Submit complaint';

  @override
  String get complaintSubmittedMessage =>
      'Your complaint has been submitted. The administration will review it.';

  @override
  String get complaintWarehouseLabel => 'Warehouse';

  @override
  String get complaintWarehouseHint =>
      'Choose the warehouse this complaint is about';

  @override
  String get complaintSubjectLabel => 'Complaint subject';

  @override
  String get complaintSubjectHint => 'Summarize the issue in a short sentence';

  @override
  String get complaintDescriptionLabel => 'Complaint details';

  @override
  String get complaintDescriptionHint => 'Describe the problem in detail';

  @override
  String get complaintOrderNumberLabel => 'Related order number (optional)';

  @override
  String get complaintOrderNumberHint =>
      'Enter the order number if this complaint is about an order';

  @override
  String get complaintExtraDetailsLabel => 'Additional details (optional)';

  @override
  String get complaintExtraDetailsHint =>
      'Any other information that could help resolve the complaint';

  @override
  String get complaintFormFooterHint =>
      'Your warehouse\'s information is attached to the complaint automatically.';

  @override
  String get complaintDetailTitle => 'Complaint details';

  @override
  String get complaintYourComplaintTitle => 'Your complaint';

  @override
  String get complaintResponseTitle => 'Response';

  @override
  String complaintNumberLabel(String number) {
    return 'Complaint #$number';
  }

  @override
  String complaintFiledOnLabel(String date) {
    return 'Filed on $date';
  }

  @override
  String complaintRelatedOrderLabel(String number) {
    return 'Related order: #$number';
  }

  @override
  String get complaintAboutWarehouseLabel => 'About this warehouse';

  @override
  String get complaintHasResponseHint => 'Reply received';

  @override
  String get complaintNoResponseYet =>
      'The administration hasn\'t responded yet. You\'ll be notified when a reply arrives.';

  @override
  String get complaintAdminResponseLabel => 'Administration\'s response';

  @override
  String complaintRespondedOnLabel(String date) {
    return 'Responded on $date';
  }

  @override
  String complaintRespondedByLabel(String name) {
    return 'Responded by $name';
  }

  @override
  String get complaintStatusPending => 'Pending';

  @override
  String get complaintStatusInReview => 'In review';

  @override
  String get complaintStatusResolved => 'Resolved';

  @override
  String get complaintStatusClosed => 'Closed';

  @override
  String get errorComplaintWarehouseRequired =>
      'Please choose the warehouse this complaint is about.';

  @override
  String get errorComplaintSubjectRequired =>
      'Please enter a subject for the complaint.';

  @override
  String get errorComplaintDescriptionRequired =>
      'Please describe the complaint.';

  @override
  String get errorComplaintOrderNotFound =>
      'No order with that number was found for this warehouse.';

  @override
  String get errorComplaintTooLong =>
      'One of the fields is longer than allowed. Please shorten it.';

  @override
  String get errorComplaintNotFound => 'This complaint could not be found.';

  @override
  String get errorComplaintContextMismatch =>
      'This complaint can\'t be linked to that warehouse.';

  @override
  String get submitComplaintOnWarehouseTitle => 'Complaint about warehouse';

  @override
  String get submitComplaintAboutOrderTitle => 'Complaint about order';

  @override
  String get complaintContextGeneral => 'General complaint';

  @override
  String get complaintGeneralContextNote =>
      'This isn\'t about a specific warehouse or order.';

  @override
  String get complaintOnWarehouseLabel => 'Complaint about';

  @override
  String get complaintAboutOrderLabel => 'Complaint about order';

  @override
  String complaintOrderWarehouseLine(String name) {
    return 'Warehouse: $name';
  }

  @override
  String get submitComplaintOnWarehouseCta =>
      'File a complaint about this warehouse';

  @override
  String get submitComplaintAboutOrderCta =>
      'File a complaint about this order';

  @override
  String get orderComplaintsSectionTitle => 'Complaints about this order';

  @override
  String get orderComplaintsEmptyPrompt =>
      'Have a problem with this order? You can file a complaint and the administration will review it.';

  @override
  String get updateAvailable => 'New Update Available';

  @override
  String get updateAvailableMessage =>
      'A new version of Feniq is available. Update now to get the latest features and improvements.';

  @override
  String get updateRequired => 'Mandatory Update';

  @override
  String get updateRequiredMessage =>
      'Your current version of Feniq is no longer supported. Please update the application to continue.';

  @override
  String get updateNow => 'Update Now';

  @override
  String get later => 'Later';

  @override
  String get updateOpenStoreFailed =>
      'Unable to open Google Play. Please try again.';

  @override
  String get deliverySealRequiredTitle => 'Confirm delivery';

  @override
  String get deliverySealRequiredMessage =>
      'This warehouse asks for a photo of the shipment seal before the order is completed. Take a clear photo of the seal/stamp on the package.';

  @override
  String get takeSealPhoto => 'Add seal photo';

  @override
  String get retakeSealPhoto => 'Retake photo';

  @override
  String get confirmDeliveryButton => 'Confirm delivery';

  @override
  String get sealPhotoLabel => 'Delivery seal photo';

  @override
  String deliverySealConfirmedOn(String date) {
    return 'Delivery confirmed on $date';
  }

  @override
  String get errorDeliverySealPhotoRequired =>
      'A seal photo is required to confirm delivery.';

  @override
  String get errorInvalidDeliverySealPhoto =>
      'That file isn\'t a valid image. Please choose another photo.';

  @override
  String get errorOrderNotAwaitingDelivery =>
      'This order isn\'t awaiting a delivery confirmation right now.';

  @override
  String get statementTitle => 'Account statement';

  @override
  String get statementEmpty => 'No activity yet.';

  @override
  String get statementOpening => 'Opening balance';

  @override
  String get statementCharges => 'Charged';

  @override
  String get statementPayments => 'Paid';

  @override
  String get statementReturnCredits => 'Returned';

  @override
  String get statementKindCharge => 'Order delivered';

  @override
  String get statementKindChargeReversal => 'Delivery reversed';

  @override
  String get statementKindPayment => 'Payment received';

  @override
  String get statementKindPaymentReversal => 'Payment reversed';

  @override
  String get statementKindReturnCredit => 'Return credited';

  @override
  String get statementKindReturnCreditReversal => 'Return credit reversed';

  @override
  String get statementKindManualCredit => 'Credit added';

  @override
  String get statementKindManualDebit => 'Charge added';

  @override
  String get statementKindOther => 'Adjustment';

  @override
  String statementInvoiceRef(String number) {
    return 'Invoice INV-$number';
  }

  @override
  String statementPaymentRef(String number) {
    return 'Payment PAY-$number';
  }

  @override
  String creditBalanceShort(String amount) {
    return 'Credit: $amount';
  }

  @override
  String get navOffers => 'Offers';

  @override
  String get offersAndAdsTitle => 'Exceptional offers & ads';

  @override
  String promotionsCountSubtitle(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count running now',
      one: '1 running now',
      zero: 'Nothing running right now',
    );
    return '$_temp0';
  }

  @override
  String get promotionsAllTitle => 'All exceptional offers & packages';

  @override
  String get promotionsFilterAllTypes => 'All';

  @override
  String get promotionsFilterOffers => 'Exceptional offers';

  @override
  String get promotionsFilterPackages => 'Packages';

  @override
  String get promotionsAllWarehouses => 'All warehouses';

  @override
  String get promotionsWarehouseFilterTitle => 'Filter by warehouse';

  @override
  String get promotionsPackageBadge => 'Package';

  @override
  String get promotionsEmptyTitle => 'No exceptional offers right now';

  @override
  String get promotionsEmptyMessage =>
      'Offers and packages from your warehouses will show up here.';

  @override
  String get promotionsNoFilterResults => 'Nothing matches these filters.';

  @override
  String get promotionsClearFilters => 'Clear filters';

  @override
  String get promotionsError => 'Offers couldn\'t be loaded.';

  @override
  String offerDiscountPercent(int percent) {
    return '$percent% off';
  }

  @override
  String offerEndsOn(String date) {
    return 'Until $date';
  }

  @override
  String get offerPermanent => 'Ongoing';

  @override
  String get addToCartFullButton => 'Add to cart';

  @override
  String get warehouseOffersTitle => 'Warehouse\'s exceptional offers';

  @override
  String get discountCodeFieldLabel => 'Discount code';

  @override
  String get discountCodeHint => 'Enter a discount code';

  @override
  String get discountCodeApply => 'Apply';

  @override
  String get discountCodeRemove => 'Remove';

  @override
  String discountCodeApplied(String code) {
    return 'Code $code applied';
  }

  @override
  String discountCodeLine(String code) {
    return 'Discount code ($code)';
  }

  @override
  String get loyaltyDiscountLine => 'Warehouse loyalty discount';

  @override
  String get creditUsedLine => 'From your credit with the warehouse';

  @override
  String get discountCodeUpdating => 'Updating the discount';

  @override
  String get discountCodeChangedTitle => 'Discount code changed';

  @override
  String discountCodeRemovedMessage(String reason) {
    return '$reason The code was removed from your cart - check the total, then submit again.';
  }

  @override
  String discountCodeEditedMessage(String code, String discount, String total) {
    return 'The discount code $code changed. The discount is now $discount and the total $total.';
  }

  @override
  String get errorDiscountCodeInvalid => 'This discount code is not valid.';

  @override
  String get errorDiscountCodeNotStarted =>
      'This discount code is not active yet.';

  @override
  String get errorDiscountCodeExpired => 'This discount code has expired.';

  @override
  String get errorDiscountCodeLimitReached =>
      'This discount code has reached its usage limit.';

  @override
  String get errorDiscountCodePharmacyLimitReached =>
      'You have already used this code the maximum number of times.';

  @override
  String get errorDiscountCodeNotForPharmacy =>
      'This code is not for your pharmacy.';

  @override
  String get errorDiscountCodeNotForWarehouse =>
      'This code does not work on orders to this warehouse.';

  @override
  String get errorDiscountCodePendingApproval =>
      'This discount code is still waiting for approval.';

  @override
  String get errorDiscountCodeStopped => 'This discount code has been stopped.';

  @override
  String get errorDiscountCodeEdited =>
      'The terms of this discount code changed.';

  @override
  String get cartQuoteUnavailable => 'Couldn\'t work out the total.';

  @override
  String get changePasswordTitle => 'Change password';

  @override
  String get changePasswordSubtitle => 'Choose a new password only you know.';

  @override
  String get changePasswordForcedMessage =>
      'Your password was reset by support. Please choose a new password to continue.';

  @override
  String get currentPasswordLabel => 'Current password';

  @override
  String get currentPasswordForcedLabel => 'Temporary password';

  @override
  String get newPasswordLabel => 'New password';

  @override
  String get confirmNewPasswordLabel => 'Confirm new password';

  @override
  String get changePasswordAction => 'Save new password';

  @override
  String get changePasswordSuccess =>
      'Password changed. Other devices have been signed out.';

  @override
  String get newPasswordSameAsCurrent =>
      'The new password must be different from the current one.';

  @override
  String get errorPasswordUnchanged =>
      'The new password must be different from the current one.';

  @override
  String get errorPasswordMismatch => 'Passwords do not match.';

  @override
  String get errorInvalidPassword =>
      'This password does not meet the requirements.';

  @override
  String get cartOtherWarehousesHint =>
      'You have a cart at each of these warehouses. Each one is sent as its own order, with its own invoice:';

  @override
  String submitAllButton(int count) {
    return 'Send all orders ($count)';
  }

  @override
  String get submitAllTitle => 'Send all orders?';

  @override
  String submitAllConfirmation(String names) {
    return 'Each warehouse gets its own order, with its own invoice:\n$names';
  }

  @override
  String submitAllDone(int count) {
    return 'All orders sent ($count).';
  }

  @override
  String submitAllPartial(int sent, int total) {
    return 'Sent $sent of $total. The orders not sent stay in the cart with the reason.';
  }

  @override
  String get submitThisWarehouseOnly => 'Send only this warehouse\'s order';

  @override
  String get exceptionalOfferBadge => 'Special offer';

  @override
  String get packageContentsTitle => 'What\'s in the package';

  @override
  String get packageFixedNote =>
      'A package is fixed: it is ordered whole, as the warehouse set it up - you only choose how many copies.';

  @override
  String get packageShowContents => 'Show what\'s inside';

  @override
  String get packageAddToCart => 'Add the package to the cart';

  @override
  String get repNavPharmacies => 'My pharmacies';

  @override
  String get repNavVisits => 'My visits';

  @override
  String get repSearchHint => 'Search by name, owner, phone or address';

  @override
  String get repScanAction => 'Scan visit code';

  @override
  String get repNoPharmaciesTitle => 'No pharmacies assigned to you yet';

  @override
  String get repNoPharmaciesSubtitle =>
      'The warehouse assigns your pharmacies - they appear here as soon as it does.';

  @override
  String get repNoSearchResults => 'No pharmacy matches your search';

  @override
  String get repNeverVisited => 'Never visited';

  @override
  String repLastVisitAgo(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: 'Last visit: $days days ago',
      one: 'Last visit: yesterday',
      zero: 'Last visit: today',
    );
    return '$_temp0';
  }

  @override
  String repMonthOrdersCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count orders this month',
      one: '1 order this month',
      zero: 'No orders this month',
    );
    return '$_temp0';
  }

  @override
  String get repStatPharmacies => 'Pharmacies';

  @override
  String get repStatVisitsWeek => 'Visits, 7 days';

  @override
  String get repStatOrdersMonth => 'Orders this month';

  @override
  String get repStatSalesMonth => 'Their value';

  @override
  String get repStatCommissionMonth => 'Your commission this month';

  @override
  String repCommissionHint(String rate) {
    return 'You earn $rate of the value of delivered orders from your pharmacies placed through Feniq.';
  }

  @override
  String get repOwnerLabel => 'Owner';

  @override
  String get repCallAction => 'Call';

  @override
  String get repLogVisitAction => 'Log a visit';

  @override
  String get repNoLocationWarning =>
      'This pharmacy has not set its map location yet, so a visit here cannot be verified.';

  @override
  String get repRecentOrders => 'Latest orders';

  @override
  String get repNoOrdersYet => 'No orders from this pharmacy yet';

  @override
  String get repRecentVisits => 'Your latest visits here';

  @override
  String get repNoVisitsHere => 'You have not visited this pharmacy yet';

  @override
  String get repVisitsTitle => 'My visits';

  @override
  String get repNoVisitsTitle => 'No visits logged yet';

  @override
  String get repNoVisitsSubtitle =>
      'Scan the QR code at a pharmacy to log your visit.';

  @override
  String get repVisitVerified => 'Verified';

  @override
  String get repVisitOutOfRange => 'Out of range';

  @override
  String get repVisitMockLocation => 'Spoofed location';

  @override
  String get repVisitNoPharmacyLocation => 'Pharmacy has no location';

  @override
  String repDistanceMeters(int meters) {
    return '$meters m away';
  }

  @override
  String get repScanTitle => 'Scan visit code';

  @override
  String get repScanHint =>
      'Point the camera at the Feniq QR code at the pharmacy.';

  @override
  String get repScanNotFeniq => 'That is not a Feniq visit code.';

  @override
  String get repScanLocating => 'Finding your location...';

  @override
  String get repScanSubmitting => 'Logging the visit...';

  @override
  String get repScanVerifiedTitle => 'Visit verified';

  @override
  String get repScanDuplicateTitle => 'Already logged a moment ago';

  @override
  String get repScanUnverifiedTitle => 'Visit logged, not verified';

  @override
  String repScanOutOfRangeMessage(int meters) {
    return 'Your phone is $meters m from the pharmacy. Go to the pharmacy and scan again to verify.';
  }

  @override
  String get repScanMockMessage =>
      'Your phone reports a spoofed location, so the visit cannot be verified.';

  @override
  String get repScanNoLocationMessage =>
      'The pharmacy has not set its location yet, so the visit cannot be verified.';

  @override
  String get repScanAnother => 'Scan another code';

  @override
  String get repScanTryAgain => 'Try again';

  @override
  String get repLocationServiceOff =>
      'Turn on location (GPS) on your phone, then try again.';

  @override
  String get repLocationDenied =>
      'Location permission is needed to verify the visit.';

  @override
  String get repLocationDeniedForever =>
      'Location permission is blocked. Allow it from the app settings.';

  @override
  String get repLocationUnavailable =>
      'Could not find your location. Check that GPS is on and try again.';

  @override
  String get repOpenSettings => 'Open settings';

  @override
  String get repCameraDenied =>
      'Camera permission is needed to scan the code. Allow it from the app settings.';

  @override
  String get repCameraUnavailable => 'The camera could not be started.';

  @override
  String get repWarehouseLabel => 'Warehouse';

  @override
  String get repProfileHint =>
      'You are signed in as a rep. Your warehouse manages your pharmacies.';

  @override
  String get errorRepPharmacyNotAssigned =>
      'This pharmacy is not assigned to you.';

  @override
  String get errorRepVisitCodeUnknown => 'No pharmacy has this visit code.';

  @override
  String get errorRepVisitCodeInvalid => 'That is not a Feniq visit code.';

  @override
  String get errorRepInactive =>
      'Your rep account has been switched off by the warehouse.';

  @override
  String get errorRepInvalidLocation =>
      'Could not read your location. Try again.';

  @override
  String get pharmacyVisitCodeTitle => 'Visit code';

  @override
  String get pharmacyVisitCodeSubtitle => 'For reps who visit you';

  @override
  String get pharmacyVisitCodeIntro =>
      'Show this code to the warehouse rep so they can scan it when they visit. The visit is verified only if their phone is at your pharmacy.';

  @override
  String get panelHomeTitle => 'Warehouse account';

  @override
  String panelHomeGreeting(String name) {
    return 'Hello $name';
  }

  @override
  String get panelHomeBody =>
      'The warehouse screens inside the app are on their way. For now, orders, products and reps are in the warehouse panel.';

  @override
  String get panelHomeOpenPanel => 'Open the warehouse panel';

  @override
  String panelHomeOpenFailed(String url) {
    return 'Could not open the panel. Open $url in your browser.';
  }

  @override
  String get warehouseNavOrders => 'Orders';

  @override
  String get warehouseNavAccount => 'Account';

  @override
  String get warehouseFilterAll => 'All';

  @override
  String get warehouseMarkDelivered => 'Mark as delivered';

  @override
  String get warehouseConfirmApproveTitle => 'Send this order on its way?';

  @override
  String warehouseConfirmApproveBody(int number) {
    return 'Order #$number leaves for the pharmacy, and its items can no longer be changed.';
  }

  @override
  String warehouseOrderTitle(int number) {
    return 'Order #$number';
  }

  @override
  String warehouseOrderItemsCount(int count) {
    return 'Items: $count';
  }

  @override
  String get warehouseNoOrdersTitle => 'No orders here';

  @override
  String get warehouseNoOrdersSubtitle =>
      'New orders show up here as soon as they arrive, with a notification.';

  @override
  String get warehouseSectionPharmacy => 'Pharmacy';

  @override
  String get warehouseSectionItems => 'Items';

  @override
  String get warehouseSectionMoney => 'Amounts';

  @override
  String get warehouseSectionHistory => 'Order history';

  @override
  String get warehouseSectionNotes => 'Pharmacy\'s notes';

  @override
  String get warehouseCall => 'Call';

  @override
  String warehouseFreeUnits(int count) {
    return '+$count free';
  }

  @override
  String get warehousePackageLine => 'In a package';

  @override
  String get warehouseSubtotal => 'Subtotal';

  @override
  String get warehouseDiscounts => 'Discounts';

  @override
  String get warehousePharmacyPays => 'Pharmacy pays';

  @override
  String get warehouseFeniqShare => 'Feniq\'s share';

  @override
  String get warehouseYouKeep => 'You keep';

  @override
  String warehouseRepCommissionTitle(String rate) {
    return 'Rep commission ($rate%)';
  }

  @override
  String get warehouseRepShare => 'To the rep';

  @override
  String get warehouseRepSaving => 'Your saving';

  @override
  String get warehouseEditItems => 'Edit items';

  @override
  String get warehouseSaveEdits => 'Save changes';

  @override
  String get warehouseRemoveLine => 'Remove';

  @override
  String get warehouseRestoreLine => 'Restore';

  @override
  String get warehouseEditHint =>
      'Adding a product or changing a package is done in the warehouse panel.';

  @override
  String get warehouseConfirmSaveTitle => 'Save the changes?';

  @override
  String get warehouseConfirmSaveBody =>
      'The order is repriced, and the pharmacy is notified of the change.';

  @override
  String get warehouseCannotEmpty =>
      'You can\'t remove every item. If the order can\'t go ahead, talk to the pharmacy.';

  @override
  String get warehouseWaitingSeal =>
      'Waiting for the pharmacy\'s seal photo before delivery.';

  @override
  String get warehouseHasReturn => 'Has a return';

  @override
  String warehouseCancelReason(String reason) {
    return 'Cancel reason: $reason';
  }

  @override
  String get warehouseAccountPanelHint =>
      'Products, offers, reps and reports are in the warehouse panel.';

  @override
  String warehouseOrderAdvanced(int number, String status) {
    return 'Order #$number is now: $status';
  }

  @override
  String get errorCannotRemoveLastItem =>
      'You can\'t remove the order\'s last item.';

  @override
  String get errorOrderAlreadyAdvanced =>
      'The order already moved on. Refresh the page.';

  @override
  String get errorOrderNotAdvanceable =>
      'This order can\'t move to another stage.';

  @override
  String get errorOrderNotEditable =>
      'The order was sent, so its items can no longer be changed.';

  @override
  String get errorPackageItemsLocked =>
      'A package\'s items are changed in the warehouse panel.';

  @override
  String get warehouseNavReturns => 'Returns';

  @override
  String get warehouseNavAccounts => 'Accounts';

  @override
  String get warehouseNavReps => 'Reps';

  @override
  String warehouseReturnTitle(int number) {
    return 'Return on order #$number';
  }

  @override
  String get warehouseReturnNoOrder => 'Return';

  @override
  String warehouseReturnUnits(int count) {
    return '$count units';
  }

  @override
  String get warehouseNoReturnsTitle => 'No returns here';

  @override
  String get warehouseNoReturnsSubtitle =>
      'Return requests from pharmacies show up here.';

  @override
  String get warehouseReturnPhotos => 'Photos';

  @override
  String get warehouseReturnPharmacyNotes => 'Pharmacy\'s notes';

  @override
  String warehouseReturnCreditPreview(String amount) {
    return 'If you approve, the pharmacy is credited: $amount';
  }

  @override
  String warehouseReturnCredited(String amount) {
    return 'Credited to the pharmacy: $amount';
  }

  @override
  String get warehouseReturnApprove => 'Approve';

  @override
  String get warehouseReturnReject => 'Reject';

  @override
  String get warehouseReturnApproveTitle => 'Approve this return?';

  @override
  String get warehouseReturnApproveBody =>
      'The amount is credited to the pharmacy\'s account, and can\'t be undone from the app.';

  @override
  String get warehouseReturnRejectTitle => 'Reject the return';

  @override
  String get warehouseReturnRejectHint => 'Write why - the pharmacy sees it.';

  @override
  String warehouseReturnResolved(String status) {
    return 'The return is now: $status';
  }

  @override
  String get warehouseNoAccountsTitle => 'No accounts yet';

  @override
  String get warehouseNoAccountsSubtitle =>
      'A pharmacy\'s account shows up here after its first delivered order.';

  @override
  String get warehouseAccountsSearch => 'Search by pharmacy name or phone';

  @override
  String warehouseAccountOwes(String amount) {
    return 'Owes $amount';
  }

  @override
  String warehouseAccountInCredit(String amount) {
    return 'In credit $amount';
  }

  @override
  String get warehouseAccountSettled => 'Settled';

  @override
  String get warehouseRecordPayment => 'Record a payment';

  @override
  String get warehouseRecordPaymentTitle => 'Payment from the pharmacy';

  @override
  String warehousePaymentAmount(String currency) {
    return 'Amount ($currency)';
  }

  @override
  String get warehousePaymentMethod => 'Method';

  @override
  String get warehousePaymentMethodCash => 'Cash';

  @override
  String get warehousePaymentMethodBank => 'Transfer';

  @override
  String get warehousePaymentMethodCheque => 'Cheque';

  @override
  String get warehousePaymentMethodOther => 'Other';

  @override
  String get warehousePaymentNote => 'Note (optional)';

  @override
  String warehousePaymentConfirm(String amount, String pharmacy) {
    return 'Record $amount from $pharmacy?';
  }

  @override
  String get warehousePaymentRecorded => 'Payment recorded.';

  @override
  String get warehousePaymentReverseHint =>
      'To reverse a wrong payment, use the warehouse panel.';

  @override
  String get warehouseNoRepsTitle => 'No reps yet';

  @override
  String get warehouseNoRepsSubtitle =>
      'Add a rep - they sign in to the Feniq app with their number and password.';

  @override
  String get warehouseAddRep => 'Add a rep';

  @override
  String get warehouseRepName => 'Name';

  @override
  String get warehouseRepPhone => 'Mobile number';

  @override
  String get warehouseRepPassword => 'Password (8+ characters)';

  @override
  String get warehouseRepRate => 'Commission rate (%)';

  @override
  String get warehouseRepRateHint =>
      'Half to the rep, a quarter to Feniq, the rest you save. Between 0 and 10.';

  @override
  String get warehouseRepInactive => 'Switched off';

  @override
  String warehouseRepStats(int pharmacies, int visits) {
    return '$pharmacies pharmacies · $visits visits in 30 days';
  }

  @override
  String warehouseRepMonth(int orders, String amount) {
    return 'This month: $orders orders · commission $amount';
  }

  @override
  String get warehouseRepEditRate => 'Edit commission';

  @override
  String get warehouseRepEditRateHint => 'Applies to new orders only.';

  @override
  String get warehouseRepDeactivate => 'Switch the rep off';

  @override
  String get warehouseRepActivate => 'Switch the rep on';

  @override
  String get warehouseRepResetPassword => 'New password';

  @override
  String get warehouseRepPasswordReset => 'Password changed. Tell the rep.';

  @override
  String get warehouseRepSaved => 'Saved.';

  @override
  String get warehouseRepPharmacies => 'Their pharmacies';

  @override
  String get warehouseRepNoPharmacies =>
      'No pharmacies yet. Pharmacies are assigned in the warehouse panel.';

  @override
  String get warehouseRepVisits => 'Their visits';

  @override
  String get warehouseRepNoVisits => 'No visits logged yet.';

  @override
  String warehouseRepLastVisit(String date) {
    return 'Last visit: $date';
  }

  @override
  String get warehouseRepNeverVisited => 'Never visited';

  @override
  String get warehouseFieldRequired => 'This field is required';

  @override
  String get warehouseInvalidNumber => 'Enter a valid number';

  @override
  String get errorInvalidCommissionRate =>
      'The commission rate must be between 0 and 10.';

  @override
  String get errorInvalidPaymentAmount => 'That amount isn\'t valid.';

  @override
  String get errorInvalidPhoneFormat => 'That mobile number isn\'t valid.';

  @override
  String get errorInvalidRepName => 'Enter the rep\'s name.';

  @override
  String get errorNoTradingRelationship =>
      'You have no dealings with this pharmacy yet.';

  @override
  String get errorRepNotFound => 'That rep wasn\'t found.';

  @override
  String get errorReturnAlreadyResolved =>
      'This return was already resolved. Refresh the page.';

  @override
  String get warehouseLoyaltyTitle => 'Loyalty discount';

  @override
  String get warehouseLoyaltyIntro =>
      'A fixed amount off an order by its size. You set the tiers and you pay for it; Feniq takes its share of what is left.';

  @override
  String get warehouseLoyaltyEnabled => 'Turn the loyalty discount on';

  @override
  String get warehouseLoyaltyMin => 'Order from';

  @override
  String get warehouseLoyaltyDiscount => 'Discount';

  @override
  String get warehouseLoyaltyAddTier => 'Add a tier';

  @override
  String get warehouseLoyaltySave => 'Save the loyalty discount';

  @override
  String get warehouseLoyaltySaved => 'Loyalty discount saved.';

  @override
  String get warehouseLoyaltyExample =>
      'Example: an order of 100,000 or more -> 2,000 off.';

  @override
  String get warehouseLoyaltyTierError =>
      'Each tier needs an order value above zero and a smaller discount.';

  @override
  String get warehouseLoyaltyOff => 'Off';

  @override
  String warehouseLoyaltyOnTiers(int count) {
    return 'On · $count tiers';
  }

  @override
  String get warehouseLoyaltyLine => 'Loyalty discount';

  @override
  String get warehouseCreditUsedLine => 'From the pharmacy\'s credit';

  @override
  String get warehouseRepPharmacyShare => 'Pharmacy credit';

  @override
  String get warehouseRepWarehouseShare => 'Your quarter';

  @override
  String get warehouseRepWarehouseShareToRep => 'Your quarter (to the rep)';

  @override
  String get warehouseRepShareToRep => 'Give my quarter to the rep';

  @override
  String get warehouseRepShareToRepOn =>
      'Your quarter now goes to the rep on new orders.';

  @override
  String get warehouseRepShareToRepOff =>
      'Your quarter is yours again on new orders.';

  @override
  String get warehouseRepShareGiven => 'Your quarter to the rep';

  @override
  String get warehouseRepQuartersHint =>
      'A quarter to Feniq, a quarter as pharmacy credit, a quarter to the rep, and the last quarter yours or the rep\'s. Between 0 and 10.';

  @override
  String get errorInvalidLoyaltyTiers =>
      'Each tier needs an order value above zero and a smaller discount, with no two on the same value.';

  @override
  String get errorLoyaltyTiersRequired =>
      'Add at least one tier before turning the loyalty discount on.';

  @override
  String get stageAccepted => 'Accepted';

  @override
  String get stageAcceptedDesc => 'The warehouse accepted your order';

  @override
  String get warehouseAccept => 'Accept';

  @override
  String get warehouseSendOnWay => 'Send on its way';

  @override
  String warehouseCollectTitle(int number) {
    return 'Delivering order #$number - did you collect?';
  }

  @override
  String warehouseCollectTotal(String amount) {
    return 'Amount: $amount';
  }

  @override
  String get warehouseCollectFull => 'All of it';

  @override
  String get warehouseCollectPartial => 'Part';

  @override
  String get warehouseCollectLater => 'Later';

  @override
  String warehouseCollectPaidLabel(String currency) {
    return 'Paid now ($currency)';
  }

  @override
  String warehouseCollectLeft(String amount) {
    return 'Left: $amount';
  }

  @override
  String get warehouseCollectSave => 'Deliver and save';

  @override
  String get warehouseCollectPartialInvalid =>
      'Enter an amount above zero and below the total.';

  @override
  String warehouseCollectRecorded(String amount) {
    return 'Delivered, and $amount recorded as paid';
  }

  @override
  String get warehouseCollectFailed =>
      'Delivered, but the payment wasn\'t saved - record it from Accounts.';

  @override
  String warehouseCollectNote(int number) {
    return 'Paid on delivery of order #$number';
  }

  @override
  String warehouseAccountPurchases(String amount) {
    return 'Bought $amount';
  }

  @override
  String warehouseAccountPaid(String amount) {
    return 'Paid $amount';
  }

  @override
  String warehouseAccountLastPayment(String date) {
    return 'Last payment $date';
  }

  @override
  String get warehouseAccountNoPayment => 'No payments yet';

  @override
  String get warehouseAccountPayFull => 'Pay in full';

  @override
  String get warehouseAccountPayPartial => 'Part payment';

  @override
  String warehouseAccountPayFullConfirm(String amount) {
    return 'Record a cash payment of $amount?';
  }

  @override
  String warehouseAccountPayOwes(String amount) {
    return 'Owes: $amount';
  }

  @override
  String get warehouseAccountPaySave => 'Record payment';

  @override
  String get warehouseAccountPayInvalid =>
      'Enter an amount above zero and below the amount owed.';

  @override
  String warehouseAccountPayRecorded(String amount) {
    return 'Recorded a payment of $amount';
  }

  @override
  String get warehouseAccountPayFailed =>
      'The payment wasn\'t saved. Try again.';

  @override
  String get warehouseVoiceTitle => 'Record a payment by voice';

  @override
  String get warehouseVoiceHint =>
      'Say, in Arabic, for example: Al-Noor pharmacy paid fifty thousand, or Al-Amal paid the full amount.';

  @override
  String get warehouseVoiceSpeak => 'Tap and speak';

  @override
  String get warehouseVoiceStop => 'Stop';

  @override
  String get warehouseVoiceHeard => 'What was heard (you can edit it)';

  @override
  String get warehouseVoiceNoMic =>
      'Voice isn\'t available on this phone. Type the sentence in the box.';

  @override
  String get warehouseVoiceNotUnderstood =>
      'I did not understand. Try: pharmacy name + paid + the amount.';

  @override
  String get warehouseVoiceNoPharmacy =>
      'No pharmacy found for that name. Edit the name.';

  @override
  String warehouseVoiceOwes(String amount) {
    return 'owes $amount';
  }

  @override
  String warehouseVoiceWillRecord(String amount) {
    return 'A payment of $amount will be recorded';
  }

  @override
  String warehouseVoiceLeftAfter(String amount) {
    return 'It will still owe $amount';
  }

  @override
  String get warehouseVoiceCannotRecord =>
      'That amount does not fit this pharmacy\'s account (zero, or more than it owes).';

  @override
  String get warehouseVoiceConfirm => 'OK, record it';

  @override
  String get warehouseSummaryTitle => 'Warehouse summary';

  @override
  String get warehouseSummaryToday => 'Today';

  @override
  String get warehouseSummaryWeek => 'Last 7 days';

  @override
  String get warehouseSummaryMonth => 'This month';

  @override
  String get warehouseSummarySales => 'Sales';

  @override
  String get warehouseSummaryCollections => 'Collected';

  @override
  String get warehouseSummaryReturns => 'Returns';

  @override
  String get warehouseSummaryTotalDebts => 'Total debts';

  @override
  String warehouseSummaryInvoices(int count) {
    return '$count invoices';
  }

  @override
  String warehouseSummaryPayments(int count) {
    return '$count payments';
  }

  @override
  String warehouseSummaryDebtors(int count) {
    return '$count pharmacies owe you';
  }

  @override
  String warehouseSummaryCreditHeld(String amount) {
    return 'Credit held for pharmacies: $amount';
  }

  @override
  String warehouseSummaryChangeUp(int percent) {
    return '▲ $percent% vs previous period';
  }

  @override
  String warehouseSummaryChangeDown(int percent) {
    return '▼ $percent% vs previous period';
  }

  @override
  String get warehouseSummaryChangeFlat => 'Same as the previous period';

  @override
  String get warehouseSummaryChangeNew => 'Nothing in the previous period';

  @override
  String get warehouseSummaryTopBuyers => 'Top buyers';

  @override
  String get warehouseSummaryTopDebtors => 'Biggest debts';

  @override
  String get warehouseSummaryNoBuyers => 'No sales in this period.';

  @override
  String get warehouseSummaryNoDebtors => 'No outstanding debts.';

  @override
  String get warehouseSummaryDeliveredNote =>
      'Sales count delivered orders only.';
}
