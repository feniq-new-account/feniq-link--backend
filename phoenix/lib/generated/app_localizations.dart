import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_ar.dart';
import 'app_localizations_en.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'generated/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations? of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations);
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('ar'),
    Locale('en'),
  ];

  /// No description provided for @appName.
  ///
  /// In en, this message translates to:
  /// **'Feniq'**
  String get appName;

  /// No description provided for @login.
  ///
  /// In en, this message translates to:
  /// **'Login'**
  String get login;

  /// No description provided for @logout.
  ///
  /// In en, this message translates to:
  /// **'Logout'**
  String get logout;

  /// No description provided for @email.
  ///
  /// In en, this message translates to:
  /// **'Email'**
  String get email;

  /// No description provided for @password.
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get password;

  /// No description provided for @settings.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get settings;

  /// No description provided for @language.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get language;

  /// No description provided for @theme.
  ///
  /// In en, this message translates to:
  /// **'Theme'**
  String get theme;

  /// No description provided for @light.
  ///
  /// In en, this message translates to:
  /// **'Light'**
  String get light;

  /// No description provided for @dark.
  ///
  /// In en, this message translates to:
  /// **'Dark'**
  String get dark;

  /// No description provided for @system.
  ///
  /// In en, this message translates to:
  /// **'System'**
  String get system;

  /// No description provided for @save.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get save;

  /// No description provided for @cancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get cancel;

  /// No description provided for @welcome.
  ///
  /// In en, this message translates to:
  /// **'Welcome'**
  String get welcome;

  /// No description provided for @home.
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get home;

  /// No description provided for @profile.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get profile;

  /// No description provided for @registrationTitle.
  ///
  /// In en, this message translates to:
  /// **'Create your pharmacy account'**
  String get registrationTitle;

  /// No description provided for @registrationSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Enter your pharmacy details to create an account. Its status will appear after registration, including pending administrator approval when required.'**
  String get registrationSubtitle;

  /// No description provided for @fullNameLabel.
  ///
  /// In en, this message translates to:
  /// **'Full name'**
  String get fullNameLabel;

  /// No description provided for @fullNameHint.
  ///
  /// In en, this message translates to:
  /// **'e.g. Dr. Samer Halabi'**
  String get fullNameHint;

  /// No description provided for @pharmacyNameLabel.
  ///
  /// In en, this message translates to:
  /// **'Pharmacy name'**
  String get pharmacyNameLabel;

  /// No description provided for @pharmacyNameHint.
  ///
  /// In en, this message translates to:
  /// **'e.g. Al-Noor Pharmacy'**
  String get pharmacyNameHint;

  /// No description provided for @phoneLabel.
  ///
  /// In en, this message translates to:
  /// **'Phone number'**
  String get phoneLabel;

  /// No description provided for @addressLabel.
  ///
  /// In en, this message translates to:
  /// **'Address'**
  String get addressLabel;

  /// No description provided for @confirmLocationButton.
  ///
  /// In en, this message translates to:
  /// **'Choose this location'**
  String get confirmLocationButton;

  /// No description provided for @locationConfirmedText.
  ///
  /// In en, this message translates to:
  /// **'Location chosen'**
  String get locationConfirmedText;

  /// No description provided for @changeLocationButton.
  ///
  /// In en, this message translates to:
  /// **'Change location'**
  String get changeLocationButton;

  /// No description provided for @confirmLocationRequiredError.
  ///
  /// In en, this message translates to:
  /// **'Tap \"Choose this location\" to confirm the pharmacy\'s location'**
  String get confirmLocationRequiredError;

  /// No description provided for @pickLocationHint.
  ///
  /// In en, this message translates to:
  /// **'Move the map to fine-tune the pin\'s position'**
  String get pickLocationHint;

  /// No description provided for @resolvingAddressText.
  ///
  /// In en, this message translates to:
  /// **'Resolving address...'**
  String get resolvingAddressText;

  /// No description provided for @locationPermissionDeniedMessage.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t access your location - you can still drag the map manually.'**
  String get locationPermissionDeniedMessage;

  /// No description provided for @addressNotResolvedYetMessage.
  ///
  /// In en, this message translates to:
  /// **'Please wait for the map to resolve an address, or adjust the pin\'s position.'**
  String get addressNotResolvedYetMessage;

  /// No description provided for @useCurrentLocationTooltip.
  ///
  /// In en, this message translates to:
  /// **'My current location'**
  String get useCurrentLocationTooltip;

  /// No description provided for @areaTypeLabel.
  ///
  /// In en, this message translates to:
  /// **'Area type'**
  String get areaTypeLabel;

  /// No description provided for @areaTypeCity.
  ///
  /// In en, this message translates to:
  /// **'City'**
  String get areaTypeCity;

  /// No description provided for @areaTypeCityRing.
  ///
  /// In en, this message translates to:
  /// **'City ring'**
  String get areaTypeCityRing;

  /// No description provided for @areaTypeRural.
  ///
  /// In en, this message translates to:
  /// **'Rural'**
  String get areaTypeRural;

  /// No description provided for @confirmPasswordLabel.
  ///
  /// In en, this message translates to:
  /// **'Confirm password'**
  String get confirmPasswordLabel;

  /// No description provided for @confirmPasswordHint.
  ///
  /// In en, this message translates to:
  /// **'Re-enter your password'**
  String get confirmPasswordHint;

  /// No description provided for @passwordHint.
  ///
  /// In en, this message translates to:
  /// **'At least {min} characters'**
  String passwordHint(String min);

  /// No description provided for @passwordTooShort.
  ///
  /// In en, this message translates to:
  /// **'Password must be at least 8 characters.'**
  String get passwordTooShort;

  /// No description provided for @passwordMismatch.
  ///
  /// In en, this message translates to:
  /// **'Passwords do not match.'**
  String get passwordMismatch;

  /// No description provided for @alreadyHaveAccountLink.
  ///
  /// In en, this message translates to:
  /// **'Already have an account? Log in with password'**
  String get alreadyHaveAccountLink;

  /// No description provided for @sendCodeButton.
  ///
  /// In en, this message translates to:
  /// **'Send verification code'**
  String get sendCodeButton;

  /// No description provided for @createAccountButton.
  ///
  /// In en, this message translates to:
  /// **'Create account'**
  String get createAccountButton;

  /// No description provided for @termsAgreementLabel.
  ///
  /// In en, this message translates to:
  /// **'I agree to the Terms of Use and Privacy Policy.'**
  String get termsAgreementLabel;

  /// No description provided for @termsAgreementRequiredError.
  ///
  /// In en, this message translates to:
  /// **'You must agree to the terms to continue.'**
  String get termsAgreementRequiredError;

  /// No description provided for @passwordsMustMatchHint.
  ///
  /// In en, this message translates to:
  /// **'Both passwords must match.'**
  String get passwordsMustMatchHint;

  /// No description provided for @passwordLoginTitle.
  ///
  /// In en, this message translates to:
  /// **'Log in with password'**
  String get passwordLoginTitle;

  /// No description provided for @passwordLoginSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Enter your phone number and password'**
  String get passwordLoginSubtitle;

  /// No description provided for @backToRegistrationLink.
  ///
  /// In en, this message translates to:
  /// **'New here? Create an account'**
  String get backToRegistrationLink;

  /// No description provided for @forgotPasswordSupportLink.
  ///
  /// In en, this message translates to:
  /// **'Forgot your password? Contact support on WhatsApp'**
  String get forgotPasswordSupportLink;

  /// No description provided for @forgotPasswordSupportMessage.
  ///
  /// In en, this message translates to:
  /// **'Hello, I would like to recover the password for my account. Pharmacy/warehouse name: ___ Registered phone number: ___'**
  String get forgotPasswordSupportMessage;

  /// No description provided for @whatsAppUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t open WhatsApp. Support number: {phone}'**
  String whatsAppUnavailable(String phone);

  /// No description provided for @copyAction.
  ///
  /// In en, this message translates to:
  /// **'Copy'**
  String get copyAction;

  /// No description provided for @phoneCopied.
  ///
  /// In en, this message translates to:
  /// **'Number copied.'**
  String get phoneCopied;

  /// No description provided for @otpTitle.
  ///
  /// In en, this message translates to:
  /// **'Enter verification code'**
  String get otpTitle;

  /// No description provided for @otpInstructionsPrefix.
  ///
  /// In en, this message translates to:
  /// **'Enter the 6-digit code sent to'**
  String get otpInstructionsPrefix;

  /// No description provided for @otpCodeLabel.
  ///
  /// In en, this message translates to:
  /// **'Verification code'**
  String get otpCodeLabel;

  /// No description provided for @verifyButton.
  ///
  /// In en, this message translates to:
  /// **'Verify'**
  String get verifyButton;

  /// No description provided for @resendCodeButton.
  ///
  /// In en, this message translates to:
  /// **'Didn\'t get the code? Resend'**
  String get resendCodeButton;

  /// No description provided for @codeResent.
  ///
  /// In en, this message translates to:
  /// **'A new code has been sent.'**
  String get codeResent;

  /// No description provided for @approvalPendingTitle.
  ///
  /// In en, this message translates to:
  /// **'Your account is under review'**
  String get approvalPendingTitle;

  /// No description provided for @approvalPendingMessage.
  ///
  /// In en, this message translates to:
  /// **'Your account is awaiting administrator review. Ordering requires account approval and order intake to be open.'**
  String get approvalPendingMessage;

  /// No description provided for @approvalPendingMessageWithName.
  ///
  /// In en, this message translates to:
  /// **'The pharmacy account for {pharmacyName} is awaiting administrator review. Ordering requires account approval and order intake to be open.'**
  String approvalPendingMessageWithName(String pharmacyName);

  /// No description provided for @approvalPendingBlockedTitle.
  ///
  /// In en, this message translates to:
  /// **'Account blocked'**
  String get approvalPendingBlockedTitle;

  /// No description provided for @approvalPendingBlockedMessage.
  ///
  /// In en, this message translates to:
  /// **'This account has been blocked. Please contact support for help.'**
  String get approvalPendingBlockedMessage;

  /// No description provided for @approvalChecklistReceived.
  ///
  /// In en, this message translates to:
  /// **'Registration details received'**
  String get approvalChecklistReceived;

  /// No description provided for @approvalChecklistReview.
  ///
  /// In en, this message translates to:
  /// **'Under administration review'**
  String get approvalChecklistReview;

  /// No description provided for @approvalChecklistActivate.
  ///
  /// In en, this message translates to:
  /// **'Account activation after approval'**
  String get approvalChecklistActivate;

  /// No description provided for @refreshStatusButton.
  ///
  /// In en, this message translates to:
  /// **'Check status'**
  String get refreshStatusButton;

  /// No description provided for @contactSupportButton.
  ///
  /// In en, this message translates to:
  /// **'Contact support'**
  String get contactSupportButton;

  /// No description provided for @contactSupportDialogTitle.
  ///
  /// In en, this message translates to:
  /// **'Contact support'**
  String get contactSupportDialogTitle;

  /// No description provided for @contactSupportDialogMessage.
  ///
  /// In en, this message translates to:
  /// **'For help with your account, contact Feniq support on WhatsApp using the number below. Tap Copy to copy it.'**
  String get contactSupportDialogMessage;

  /// No description provided for @fieldRequired.
  ///
  /// In en, this message translates to:
  /// **'This field is required.'**
  String get fieldRequired;

  /// No description provided for @invalidPhoneNumber.
  ///
  /// In en, this message translates to:
  /// **'Please enter a valid phone number.'**
  String get invalidPhoneNumber;

  /// No description provided for @invalidOtpCode.
  ///
  /// In en, this message translates to:
  /// **'Please enter the 6-digit code.'**
  String get invalidOtpCode;

  /// No description provided for @close.
  ///
  /// In en, this message translates to:
  /// **'Close'**
  String get close;

  /// No description provided for @errorState.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong.'**
  String get errorState;

  /// No description provided for @errorNetwork.
  ///
  /// In en, this message translates to:
  /// **'Unable to connect to the internet. Check your connection and try again.'**
  String get errorNetwork;

  /// No description provided for @errorTimeout.
  ///
  /// In en, this message translates to:
  /// **'The request took longer than expected. Please try again.'**
  String get errorTimeout;

  /// No description provided for @errorServer.
  ///
  /// In en, this message translates to:
  /// **'A server error occurred. Please try again later.'**
  String get errorServer;

  /// No description provided for @errorNotFound.
  ///
  /// In en, this message translates to:
  /// **'The requested data could not be found.'**
  String get errorNotFound;

  /// No description provided for @errorSessionExpired.
  ///
  /// In en, this message translates to:
  /// **'Your session has expired. Please sign in again.'**
  String get errorSessionExpired;

  /// No description provided for @errorNoPermission.
  ///
  /// In en, this message translates to:
  /// **'You don\'t have permission to perform this action.'**
  String get errorNoPermission;

  /// No description provided for @noMoreResultsText.
  ///
  /// In en, this message translates to:
  /// **'No more results'**
  String get noMoreResultsText;

  /// No description provided for @retryButton.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get retryButton;

  /// No description provided for @warehouseSelectionTitle.
  ///
  /// In en, this message translates to:
  /// **'Choose a warehouse'**
  String get warehouseSelectionTitle;

  /// No description provided for @selectWarehouseButton.
  ///
  /// In en, this message translates to:
  /// **'Select'**
  String get selectWarehouseButton;

  /// No description provided for @noWarehousesAvailable.
  ///
  /// In en, this message translates to:
  /// **'No warehouses available yet.'**
  String get noWarehousesAvailable;

  /// No description provided for @warehouseSelectedMessage.
  ///
  /// In en, this message translates to:
  /// **'{name} selected. The product catalog is coming soon.'**
  String warehouseSelectedMessage(String name);

  /// No description provided for @warehousesAvailableSubtitle.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, zero{No warehouses available for your pharmacy} one{1 warehouse available for your pharmacy} other{{count} warehouses available for your pharmacy}}'**
  String warehousesAvailableSubtitle(int count);

  /// No description provided for @searchWarehouseHint.
  ///
  /// In en, this message translates to:
  /// **'Search by warehouse or city'**
  String get searchWarehouseHint;

  /// No description provided for @noSearchResultsFound.
  ///
  /// In en, this message translates to:
  /// **'No results match your search.'**
  String get noSearchResultsFound;

  /// No description provided for @warehouseProfileButtonLabel.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get warehouseProfileButtonLabel;

  /// No description provided for @warehousesScopeMyCity.
  ///
  /// In en, this message translates to:
  /// **'My city'**
  String get warehousesScopeMyCity;

  /// No description provided for @warehousesScopeAllCities.
  ///
  /// In en, this message translates to:
  /// **'All cities'**
  String get warehousesScopeAllCities;

  /// No description provided for @viewAllCitiesButton.
  ///
  /// In en, this message translates to:
  /// **'View all cities'**
  String get viewAllCitiesButton;

  /// No description provided for @noWarehousesInYourCity.
  ///
  /// In en, this message translates to:
  /// **'No warehouses in your city'**
  String get noWarehousesInYourCity;

  /// No description provided for @noWarehousesInYourCitySubtitle.
  ///
  /// In en, this message translates to:
  /// **'Try broadening the search to other cities.'**
  String get noWarehousesInYourCitySubtitle;

  /// No description provided for @noManufacturersFound.
  ///
  /// In en, this message translates to:
  /// **'No manufacturers available for this warehouse.'**
  String get noManufacturersFound;

  /// No description provided for @manufacturersCountSubtitle.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, zero{No manufacturers} one{1 manufacturer} other{{count} manufacturers}}'**
  String manufacturersCountSubtitle(int count);

  /// The warehouse's standing discount for a manufacturer, shown on its company card. Pre-formatted by the caller so the exact stored figure is preserved: 0 shows as 0%, a whole number as e.g. 15%, a fractional one as e.g. 25.5%.
  ///
  /// In en, this message translates to:
  /// **'Company Discount: {percent}%'**
  String companyDiscountValue(String percent);

  /// No description provided for @warehouseProfileTooltip.
  ///
  /// In en, this message translates to:
  /// **'Warehouse info'**
  String get warehouseProfileTooltip;

  /// No description provided for @deliveryInfoTitle.
  ///
  /// In en, this message translates to:
  /// **'Delivery Information'**
  String get deliveryInfoTitle;

  /// No description provided for @deliveryHoursValue.
  ///
  /// In en, this message translates to:
  /// **'From {start} to {end}'**
  String deliveryHoursValue(String start, String end);

  /// No description provided for @deliveryHoursNotSet.
  ///
  /// In en, this message translates to:
  /// **'Not specified'**
  String get deliveryHoursNotSet;

  /// No description provided for @deliveryTypeSelfLabel.
  ///
  /// In en, this message translates to:
  /// **'Delivered by the warehouse itself'**
  String get deliveryTypeSelfLabel;

  /// No description provided for @deliveryTypeThirdPartyLabel.
  ///
  /// In en, this message translates to:
  /// **'Delivered by a third-party courier'**
  String get deliveryTypeThirdPartyLabel;

  /// No description provided for @deliveryInfoDisclaimer.
  ///
  /// In en, this message translates to:
  /// **'This information is for display only and doesn\'t prevent placing an order.'**
  String get deliveryInfoDisclaimer;

  /// No description provided for @warehouseReviewsTitle.
  ///
  /// In en, this message translates to:
  /// **'Reviews'**
  String get warehouseReviewsTitle;

  /// No description provided for @noWarehouseReviewsYet.
  ///
  /// In en, this message translates to:
  /// **'No reviews yet.'**
  String get noWarehouseReviewsYet;

  /// No description provided for @anonymousReviewerName.
  ///
  /// In en, this message translates to:
  /// **'User'**
  String get anonymousReviewerName;

  /// No description provided for @browseWarehouseProductsButton.
  ///
  /// In en, this message translates to:
  /// **'Browse this warehouse\'s products'**
  String get browseWarehouseProductsButton;

  /// No description provided for @searchProductsHint.
  ///
  /// In en, this message translates to:
  /// **'Search by name or manufacturer'**
  String get searchProductsHint;

  /// No description provided for @searchWarehouseProductsHint.
  ///
  /// In en, this message translates to:
  /// **'Search all of this warehouse\'s products'**
  String get searchWarehouseProductsHint;

  /// No description provided for @addToCartButton.
  ///
  /// In en, this message translates to:
  /// **'Add'**
  String get addToCartButton;

  /// No description provided for @unavailableLabel.
  ///
  /// In en, this message translates to:
  /// **'Unavailable'**
  String get unavailableLabel;

  /// No description provided for @offlineBannerMessage.
  ///
  /// In en, this message translates to:
  /// **'No connection - showing the copy saved on your phone from {time}. Prices and availability may have changed, and sending an order needs a connection.'**
  String offlineBannerMessage(String time);

  /// No description provided for @offlineToastMessage.
  ///
  /// In en, this message translates to:
  /// **'No connection - showing the saved copy ({time})'**
  String offlineToastMessage(String time);

  /// No description provided for @productionDateShort.
  ///
  /// In en, this message translates to:
  /// **'Made {date}'**
  String productionDateShort(String date);

  /// No description provided for @expiryDateShort.
  ///
  /// In en, this message translates to:
  /// **'Exp. {date}'**
  String expiryDateShort(String date);

  /// No description provided for @bonusInsteadOf.
  ///
  /// In en, this message translates to:
  /// **'Bonus {tiers} instead of {regular}'**
  String bonusInsteadOf(String tiers, String regular);

  /// No description provided for @alternativesLink.
  ///
  /// In en, this message translates to:
  /// **'Alternatives'**
  String get alternativesLink;

  /// No description provided for @alternativesTitle.
  ///
  /// In en, this message translates to:
  /// **'Alternatives'**
  String get alternativesTitle;

  /// No description provided for @alternativesSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Same active ingredient, strength and form'**
  String get alternativesSubtitle;

  /// No description provided for @alternativesEmpty.
  ///
  /// In en, this message translates to:
  /// **'No alternatives in this warehouse.'**
  String get alternativesEmpty;

  /// No description provided for @alternativesHereTitle.
  ///
  /// In en, this message translates to:
  /// **'In this warehouse'**
  String get alternativesHereTitle;

  /// No description provided for @alternativesNoneEverywhere.
  ///
  /// In en, this message translates to:
  /// **'No alternatives here or at any other warehouse.'**
  String get alternativesNoneEverywhere;

  /// No description provided for @alternativesElsewhereTitle.
  ///
  /// In en, this message translates to:
  /// **'At other warehouses'**
  String get alternativesElsewhereTitle;

  /// No description provided for @alternativesElsewhereHint.
  ///
  /// In en, this message translates to:
  /// **'Tap one to go to its warehouse.'**
  String get alternativesElsewhereHint;

  /// No description provided for @alternativesSameMedicine.
  ///
  /// In en, this message translates to:
  /// **'Same medicine'**
  String get alternativesSameMedicine;

  /// No description provided for @alternativesGoToWarehouse.
  ///
  /// In en, this message translates to:
  /// **'Go to warehouse'**
  String get alternativesGoToWarehouse;

  /// No description provided for @offerBadgeLabel.
  ///
  /// In en, this message translates to:
  /// **'Offer'**
  String get offerBadgeLabel;

  /// No description provided for @toggleDensityTooltip.
  ///
  /// In en, this message translates to:
  /// **'Toggle view'**
  String get toggleDensityTooltip;

  /// No description provided for @noProductsFound.
  ///
  /// In en, this message translates to:
  /// **'No products found.'**
  String get noProductsFound;

  /// No description provided for @catalogItemsCountSubtitle.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, zero{No items} one{1 item} other{{count} items}}'**
  String catalogItemsCountSubtitle(int count);

  /// No description provided for @currencySuffix.
  ///
  /// In en, this message translates to:
  /// **'SYP'**
  String get currencySuffix;

  /// No description provided for @addedToCartMessage.
  ///
  /// In en, this message translates to:
  /// **'{name} added to cart.'**
  String addedToCartMessage(String name);

  /// No description provided for @cartTitle.
  ///
  /// In en, this message translates to:
  /// **'Cart'**
  String get cartTitle;

  /// No description provided for @cartEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'Your cart is empty.'**
  String get cartEmptyMessage;

  /// No description provided for @cartEmptyHint.
  ///
  /// In en, this message translates to:
  /// **'Choose a warehouse and start adding medicines to your cart.'**
  String get cartEmptyHint;

  /// No description provided for @browseCatalogButton.
  ///
  /// In en, this message translates to:
  /// **'Browse products'**
  String get browseCatalogButton;

  /// No description provided for @quantityLabel.
  ///
  /// In en, this message translates to:
  /// **'Quantity'**
  String get quantityLabel;

  /// No description provided for @decreaseQuantityLabel.
  ///
  /// In en, this message translates to:
  /// **'Decrease quantity'**
  String get decreaseQuantityLabel;

  /// No description provided for @increaseQuantityLabel.
  ///
  /// In en, this message translates to:
  /// **'Increase quantity'**
  String get increaseQuantityLabel;

  /// No description provided for @notesLabel.
  ///
  /// In en, this message translates to:
  /// **'Notes (optional)'**
  String get notesLabel;

  /// No description provided for @subtotalLabel.
  ///
  /// In en, this message translates to:
  /// **'Subtotal'**
  String get subtotalLabel;

  /// No description provided for @submitOrderButton.
  ///
  /// In en, this message translates to:
  /// **'Submit order'**
  String get submitOrderButton;

  /// No description provided for @submitOrderTitle.
  ///
  /// In en, this message translates to:
  /// **'Submit order?'**
  String get submitOrderTitle;

  /// No description provided for @submitOrderConfirmation.
  ///
  /// In en, this message translates to:
  /// **'Send this order to {warehouseName}?'**
  String submitOrderConfirmation(String warehouseName);

  /// No description provided for @orderSubmittedTitle.
  ///
  /// In en, this message translates to:
  /// **'Order submitted'**
  String get orderSubmittedTitle;

  /// No description provided for @orderSubmittedMessage.
  ///
  /// In en, this message translates to:
  /// **'Your order #{orderNumber} has been submitted.'**
  String orderSubmittedMessage(String orderNumber);

  /// No description provided for @removeItemTitle.
  ///
  /// In en, this message translates to:
  /// **'Remove item?'**
  String get removeItemTitle;

  /// No description provided for @removeItemConfirmation.
  ///
  /// In en, this message translates to:
  /// **'Remove {name} from your cart?'**
  String removeItemConfirmation(String name);

  /// No description provided for @removeButton.
  ///
  /// In en, this message translates to:
  /// **'Remove'**
  String get removeButton;

  /// No description provided for @clearCartButton.
  ///
  /// In en, this message translates to:
  /// **'Clear cart'**
  String get clearCartButton;

  /// No description provided for @clearCartTitle.
  ///
  /// In en, this message translates to:
  /// **'Clear cart?'**
  String get clearCartTitle;

  /// No description provided for @clearCartConfirmation.
  ///
  /// In en, this message translates to:
  /// **'Are you sure you want to clear all the contents of your cart?'**
  String get clearCartConfirmation;

  /// No description provided for @cartIconTooltip.
  ///
  /// In en, this message translates to:
  /// **'Cart'**
  String get cartIconTooltip;

  /// No description provided for @reorderButton.
  ///
  /// In en, this message translates to:
  /// **'Reorder'**
  String get reorderButton;

  /// No description provided for @addProductButton.
  ///
  /// In en, this message translates to:
  /// **'Add product'**
  String get addProductButton;

  /// No description provided for @reorderReplaceCartTitle.
  ///
  /// In en, this message translates to:
  /// **'Replace your cart?'**
  String get reorderReplaceCartTitle;

  /// No description provided for @reorderReplaceCartMessage.
  ///
  /// In en, this message translates to:
  /// **'Your current cart will be replaced with the items from this order. You can still edit everything before checkout.'**
  String get reorderReplaceCartMessage;

  /// No description provided for @reorderReplaceCartConfirm.
  ///
  /// In en, this message translates to:
  /// **'Replace cart'**
  String get reorderReplaceCartConfirm;

  /// No description provided for @reorderUnavailableTitle.
  ///
  /// In en, this message translates to:
  /// **'Some items are unavailable'**
  String get reorderUnavailableTitle;

  /// No description provided for @reorderNoItemsMessage.
  ///
  /// In en, this message translates to:
  /// **'None of this order\'s products are available from this warehouse anymore.'**
  String get reorderNoItemsMessage;

  /// No description provided for @reorderSomeItemsUnavailable.
  ///
  /// In en, this message translates to:
  /// **'These items are no longer sold by this warehouse and were not added: {names}'**
  String reorderSomeItemsUnavailable(String names);

  /// No description provided for @advertisementsSectionTitle.
  ///
  /// In en, this message translates to:
  /// **'Special packages'**
  String get advertisementsSectionTitle;

  /// No description provided for @advertisementPackageTotal.
  ///
  /// In en, this message translates to:
  /// **'Package price'**
  String get advertisementPackageTotal;

  /// No description provided for @advertisementSavingPercent.
  ///
  /// In en, this message translates to:
  /// **'Save {percent}%'**
  String advertisementSavingPercent(int percent);

  /// No description provided for @advertisementProductCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 product} other{{count} products}}'**
  String advertisementProductCount(int count);

  /// No description provided for @advertisementItemQuantity.
  ///
  /// In en, this message translates to:
  /// **'× {count}'**
  String advertisementItemQuantity(int count);

  /// No description provided for @packageBadge.
  ///
  /// In en, this message translates to:
  /// **'Package'**
  String get packageBadge;

  /// No description provided for @packageCopiesLabel.
  ///
  /// In en, this message translates to:
  /// **'package copies'**
  String get packageCopiesLabel;

  /// No description provided for @advertisementDiscountLabel.
  ///
  /// In en, this message translates to:
  /// **'Package discount'**
  String get advertisementDiscountLabel;

  /// No description provided for @advertisementTotalToPay.
  ///
  /// In en, this message translates to:
  /// **'Total to pay'**
  String get advertisementTotalToPay;

  /// No description provided for @advertisementAddToCartButton.
  ///
  /// In en, this message translates to:
  /// **'Add package to cart'**
  String get advertisementAddToCartButton;

  /// No description provided for @advertisementReplaceCartTitle.
  ///
  /// In en, this message translates to:
  /// **'Replace your cart?'**
  String get advertisementReplaceCartTitle;

  /// No description provided for @advertisementReplaceCartMessage.
  ///
  /// In en, this message translates to:
  /// **'Your current cart will be replaced with this package. You can still edit everything before checkout.'**
  String get advertisementReplaceCartMessage;

  /// No description provided for @advertisementReplaceCartConfirm.
  ///
  /// In en, this message translates to:
  /// **'Replace cart'**
  String get advertisementReplaceCartConfirm;

  /// No description provided for @advertisementUnavailableTitle.
  ///
  /// In en, this message translates to:
  /// **'Package unavailable'**
  String get advertisementUnavailableTitle;

  /// No description provided for @advertisementUnavailableMessage.
  ///
  /// In en, this message translates to:
  /// **'This package is no longer available. It may have expired or been withdrawn.'**
  String get advertisementUnavailableMessage;

  /// No description provided for @packageUnavailableBanner.
  ///
  /// In en, this message translates to:
  /// **'This package is no longer available. You won\'t be able to place the order with it.'**
  String get packageUnavailableBanner;

  /// No description provided for @packageUnavailableCheckoutMessage.
  ///
  /// In en, this message translates to:
  /// **'No longer available: {names}. The order wasn\'t placed — remove it from your cart to continue.'**
  String packageUnavailableCheckoutMessage(String names);

  /// No description provided for @errorPackageUnavailable.
  ///
  /// In en, this message translates to:
  /// **'This package is no longer available.'**
  String get errorPackageUnavailable;

  /// No description provided for @errorIdempotencyKeyReused.
  ///
  /// In en, this message translates to:
  /// **'An earlier attempt already placed an order from this cart before you changed it. Check My Orders, then submit again to place your updated cart as a new order.'**
  String get errorIdempotencyKeyReused;

  /// No description provided for @removeUnavailablePackagesButton.
  ///
  /// In en, this message translates to:
  /// **'Remove from cart'**
  String get removeUnavailablePackagesButton;

  /// No description provided for @advertisementIncompleteMessage.
  ///
  /// In en, this message translates to:
  /// **'Some products in this package are no longer sold by this warehouse, so it can\'t be added: {names}'**
  String advertisementIncompleteMessage(String names);

  /// No description provided for @advertisementPackageBrokenMessage.
  ///
  /// In en, this message translates to:
  /// **'Removing a product ends the package price. The remaining items are now priced normally.'**
  String get advertisementPackageBrokenMessage;

  /// No description provided for @advertisementsLoading.
  ///
  /// In en, this message translates to:
  /// **'Loading packages...'**
  String get advertisementsLoading;

  /// No description provided for @advertisementsEmpty.
  ///
  /// In en, this message translates to:
  /// **'No packages are running right now.'**
  String get advertisementsEmpty;

  /// No description provided for @advertisementsError.
  ///
  /// In en, this message translates to:
  /// **'Packages couldn\'t be loaded.'**
  String get advertisementsError;

  /// No description provided for @notificationsTitle.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get notificationsTitle;

  /// No description provided for @noNotificationsYet.
  ///
  /// In en, this message translates to:
  /// **'No notifications yet'**
  String get noNotificationsYet;

  /// No description provided for @noNotificationsYetHint.
  ///
  /// In en, this message translates to:
  /// **'Order updates and offers will show up here.'**
  String get noNotificationsYetHint;

  /// No description provided for @markAllAsRead.
  ///
  /// In en, this message translates to:
  /// **'Mark all as read'**
  String get markAllAsRead;

  /// No description provided for @errorInvalidRequest.
  ///
  /// In en, this message translates to:
  /// **'Something about this request wasn\'t valid. Please try again.'**
  String get errorInvalidRequest;

  /// No description provided for @errorQuantityTooLarge.
  ///
  /// In en, this message translates to:
  /// **'A single item can\'t exceed 10,000 units per order. Please lower the quantity.'**
  String get errorQuantityTooLarge;

  /// No description provided for @errorInvalidCredentials.
  ///
  /// In en, this message translates to:
  /// **'The phone number or password is incorrect.'**
  String get errorInvalidCredentials;

  /// No description provided for @errorAccountBlocked.
  ///
  /// In en, this message translates to:
  /// **'This account has been blocked. Please contact support.'**
  String get errorAccountBlocked;

  /// No description provided for @errorAccountNotFound.
  ///
  /// In en, this message translates to:
  /// **'No account found for this phone number. Please create one first.'**
  String get errorAccountNotFound;

  /// No description provided for @errorPharmacyNotFound.
  ///
  /// In en, this message translates to:
  /// **'We couldn\'t find your pharmacy profile. Please contact support.'**
  String get errorPharmacyNotFound;

  /// No description provided for @errorWarehouseNotFound.
  ///
  /// In en, this message translates to:
  /// **'This warehouse is no longer available.'**
  String get errorWarehouseNotFound;

  /// No description provided for @errorExchangeRateUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Prices can\'t be confirmed right now. Please try again shortly.'**
  String get errorExchangeRateUnavailable;

  /// No description provided for @errorStockCheckFailedGeneric.
  ///
  /// In en, this message translates to:
  /// **'Some items in your cart are no longer available as requested.'**
  String get errorStockCheckFailedGeneric;

  /// No description provided for @errorProductUnavailable.
  ///
  /// In en, this message translates to:
  /// **'{name} is currently unavailable.'**
  String errorProductUnavailable(String name);

  /// No description provided for @errorProductNotFound.
  ///
  /// In en, this message translates to:
  /// **'{name} is no longer available.'**
  String errorProductNotFound(String name);

  /// No description provided for @errorPriceChangedGeneric.
  ///
  /// In en, this message translates to:
  /// **'Some prices in your cart have changed.'**
  String get errorPriceChangedGeneric;

  /// No description provided for @errorBonusChangedGeneric.
  ///
  /// In en, this message translates to:
  /// **'The bonus changed on some items in your cart.'**
  String get errorBonusChangedGeneric;

  /// No description provided for @bonusValue.
  ///
  /// In en, this message translates to:
  /// **'Bonus {tiers}'**
  String bonusValue(String tiers);

  /// No description provided for @freeUnits.
  ///
  /// In en, this message translates to:
  /// **'+{count} free'**
  String freeUnits(int count);

  /// No description provided for @noBonus.
  ///
  /// In en, this message translates to:
  /// **'No bonus'**
  String get noBonus;

  /// No description provided for @bonusChangedLine.
  ///
  /// In en, this message translates to:
  /// **'{name}: {bonus}'**
  String bonusChangedLine(String name, String bonus);

  /// No description provided for @errorPriceChanged.
  ///
  /// In en, this message translates to:
  /// **'{name} is now {newPrice} (was {oldPrice}).'**
  String errorPriceChanged(String name, String newPrice, String oldPrice);

  /// No description provided for @priceChangedConfirmHint.
  ///
  /// In en, this message translates to:
  /// **'Submit again to place the order at the new prices.'**
  String get priceChangedConfirmHint;

  /// No description provided for @errorRateChangedTitle.
  ///
  /// In en, this message translates to:
  /// **'The exchange rate changed'**
  String get errorRateChangedTitle;

  /// No description provided for @rateChangedTotals.
  ///
  /// In en, this message translates to:
  /// **'Your order comes to {newTotal} at the new rate, instead of {oldTotal}.'**
  String rateChangedTotals(String newTotal, String oldTotal);

  /// No description provided for @rateChangedConfirmHint.
  ///
  /// In en, this message translates to:
  /// **'Submit again to place the order at the new rate.'**
  String get rateChangedConfirmHint;

  /// No description provided for @thisItemFallback.
  ///
  /// In en, this message translates to:
  /// **'This item'**
  String get thisItemFallback;

  /// No description provided for @loading.
  ///
  /// In en, this message translates to:
  /// **'Loading...'**
  String get loading;

  /// No description provided for @orderTrackingTitle.
  ///
  /// In en, this message translates to:
  /// **'Order Tracking'**
  String get orderTrackingTitle;

  /// No description provided for @orderNumberLabel.
  ///
  /// In en, this message translates to:
  /// **'Order #{number}'**
  String orderNumberLabel(String number);

  /// No description provided for @stageSent.
  ///
  /// In en, this message translates to:
  /// **'Sent'**
  String get stageSent;

  /// Order status label for order.status == 'confirmed'. The order has reached the warehouse and is waiting for it to accept/prepare it.
  ///
  /// In en, this message translates to:
  /// **'Waiting for Approval'**
  String get stageUnderReview;

  /// No description provided for @stagePreparing.
  ///
  /// In en, this message translates to:
  /// **'Preparing'**
  String get stagePreparing;

  /// Order status label for order.status == 'out_for_delivery'. The order has left the warehouse and is being delivered.
  ///
  /// In en, this message translates to:
  /// **'On the Way'**
  String get stageOutForDelivery;

  /// No description provided for @stageDelivered.
  ///
  /// In en, this message translates to:
  /// **'Delivered'**
  String get stageDelivered;

  /// No description provided for @stageCancelled.
  ///
  /// In en, this message translates to:
  /// **'Cancelled'**
  String get stageCancelled;

  /// No description provided for @stageModified.
  ///
  /// In en, this message translates to:
  /// **'Order modified'**
  String get stageModified;

  /// No description provided for @stageUnderReviewDesc.
  ///
  /// In en, this message translates to:
  /// **'Your order has reached the warehouse'**
  String get stageUnderReviewDesc;

  /// No description provided for @stagePreparingDesc.
  ///
  /// In en, this message translates to:
  /// **'The warehouse is preparing your order'**
  String get stagePreparingDesc;

  /// No description provided for @stageOutForDeliveryDesc.
  ///
  /// In en, this message translates to:
  /// **'Your order has left the warehouse'**
  String get stageOutForDeliveryDesc;

  /// No description provided for @stageDeliveredDesc.
  ///
  /// In en, this message translates to:
  /// **'You received the order'**
  String get stageDeliveredDesc;

  /// No description provided for @statusHistoryTitle.
  ///
  /// In en, this message translates to:
  /// **'Status history'**
  String get statusHistoryTitle;

  /// No description provided for @lastUpdatedLabel.
  ///
  /// In en, this message translates to:
  /// **'Last updated: {time}'**
  String lastUpdatedLabel(String time);

  /// No description provided for @cancelOrderTitle.
  ///
  /// In en, this message translates to:
  /// **'Cancel order?'**
  String get cancelOrderTitle;

  /// No description provided for @cancelOrderConfirmation.
  ///
  /// In en, this message translates to:
  /// **'Are you sure you want to cancel this order?'**
  String get cancelOrderConfirmation;

  /// No description provided for @cancelOrderButton.
  ///
  /// In en, this message translates to:
  /// **'Cancel order'**
  String get cancelOrderButton;

  /// No description provided for @orderCancelledMessage.
  ///
  /// In en, this message translates to:
  /// **'This order has been cancelled.'**
  String get orderCancelledMessage;

  /// No description provided for @contactWarehouseForChanges.
  ///
  /// In en, this message translates to:
  /// **'For any changes now, please contact the warehouse directly.'**
  String get contactWarehouseForChanges;

  /// No description provided for @orderModifiedBannerTitle.
  ///
  /// In en, this message translates to:
  /// **'This order was modified by the warehouse'**
  String get orderModifiedBannerTitle;

  /// No description provided for @errorOrderNotFound.
  ///
  /// In en, this message translates to:
  /// **'This order could not be found.'**
  String get errorOrderNotFound;

  /// No description provided for @errorOrderNotCancellable.
  ///
  /// In en, this message translates to:
  /// **'This order can no longer be cancelled from the app.'**
  String get errorOrderNotCancellable;

  /// No description provided for @myOrdersTitle.
  ///
  /// In en, this message translates to:
  /// **'My Orders'**
  String get myOrdersTitle;

  /// No description provided for @myOrdersCountSubtitle.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, zero{No orders yet} one{1 order · pull down to refresh} other{{count} orders · pull down to refresh}}'**
  String myOrdersCountSubtitle(int count);

  /// No description provided for @refreshTooltip.
  ///
  /// In en, this message translates to:
  /// **'Refresh'**
  String get refreshTooltip;

  /// No description provided for @noOrdersYet.
  ///
  /// In en, this message translates to:
  /// **'You haven\'t placed any orders yet.'**
  String get noOrdersYet;

  /// No description provided for @browseWarehousesButton.
  ///
  /// In en, this message translates to:
  /// **'Browse warehouses'**
  String get browseWarehousesButton;

  /// No description provided for @invoiceTitle.
  ///
  /// In en, this message translates to:
  /// **'Order items'**
  String get invoiceTitle;

  /// No description provided for @discountLabel.
  ///
  /// In en, this message translates to:
  /// **'Discount'**
  String get discountLabel;

  /// No description provided for @invoiceTotalLabel.
  ///
  /// In en, this message translates to:
  /// **'Total'**
  String get invoiceTotalLabel;

  /// No description provided for @youSavedLabel.
  ///
  /// In en, this message translates to:
  /// **'💰 You saved {amount}'**
  String youSavedLabel(String amount);

  /// No description provided for @totalSavingsLabel.
  ///
  /// In en, this message translates to:
  /// **'💰 Total savings: {amount} (including offer discounts and manufacturer discount)'**
  String totalSavingsLabel(String amount);

  /// No description provided for @returnsTitle.
  ///
  /// In en, this message translates to:
  /// **'Returns'**
  String get returnsTitle;

  /// No description provided for @returnsCountSubtitle.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, zero{No return requests} one{1 return request} other{{count} return requests}}'**
  String returnsCountSubtitle(int count);

  /// No description provided for @noReturnsYet.
  ///
  /// In en, this message translates to:
  /// **'You haven\'t requested any returns yet.'**
  String get noReturnsYet;

  /// No description provided for @noReturnsYetHint.
  ///
  /// In en, this message translates to:
  /// **'Once you request a return on a delivered order, it will show up here so you can follow its status.'**
  String get noReturnsYetHint;

  /// No description provided for @noReturnableOrdersTitle.
  ///
  /// In en, this message translates to:
  /// **'No orders eligible for return'**
  String get noReturnableOrdersTitle;

  /// No description provided for @myReturnsListSectionTitle.
  ///
  /// In en, this message translates to:
  /// **'Your return requests'**
  String get myReturnsListSectionTitle;

  /// No description provided for @newReturnRequestButton.
  ///
  /// In en, this message translates to:
  /// **'New return request'**
  String get newReturnRequestButton;

  /// No description provided for @selectOrderForReturnTitle.
  ///
  /// In en, this message translates to:
  /// **'Select the order you want to return items from'**
  String get selectOrderForReturnTitle;

  /// No description provided for @noEligibleOrdersForReturn.
  ///
  /// In en, this message translates to:
  /// **'No delivered orders are currently eligible for a return.'**
  String get noEligibleOrdersForReturn;

  /// No description provided for @requestReturnTitle.
  ///
  /// In en, this message translates to:
  /// **'Request a return'**
  String get requestReturnTitle;

  /// No description provided for @requestReturnButton.
  ///
  /// In en, this message translates to:
  /// **'Submit return request'**
  String get requestReturnButton;

  /// No description provided for @requestReturnAction.
  ///
  /// In en, this message translates to:
  /// **'Request Return'**
  String get requestReturnAction;

  /// No description provided for @accountHistoryTitle.
  ///
  /// In en, this message translates to:
  /// **'Account History'**
  String get accountHistoryTitle;

  /// No description provided for @moneySavedTitle.
  ///
  /// In en, this message translates to:
  /// **'Money Saved'**
  String get moneySavedTitle;

  /// No description provided for @fromDiscountsLabel.
  ///
  /// In en, this message translates to:
  /// **'From Discounts'**
  String get fromDiscountsLabel;

  /// No description provided for @debtsTitle.
  ///
  /// In en, this message translates to:
  /// **'Debts'**
  String get debtsTitle;

  /// No description provided for @outstandingBalanceLabel.
  ///
  /// In en, this message translates to:
  /// **'Outstanding Balance'**
  String get outstandingBalanceLabel;

  /// No description provided for @viewReturnsLabel.
  ///
  /// In en, this message translates to:
  /// **'View Returns'**
  String get viewReturnsLabel;

  /// No description provided for @returnsRequestsShort.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, zero{No requests} one{1 request} other{{count} requests}}'**
  String returnsRequestsShort(int count);

  /// No description provided for @returnQuantityLabel.
  ///
  /// In en, this message translates to:
  /// **'Quantity'**
  String get returnQuantityLabel;

  /// No description provided for @returnReasonLabel.
  ///
  /// In en, this message translates to:
  /// **'Reason'**
  String get returnReasonLabel;

  /// No description provided for @reasonDamaged.
  ///
  /// In en, this message translates to:
  /// **'Damaged'**
  String get reasonDamaged;

  /// No description provided for @reasonWrongItem.
  ///
  /// In en, this message translates to:
  /// **'Wrong item'**
  String get reasonWrongItem;

  /// No description provided for @reasonOther.
  ///
  /// In en, this message translates to:
  /// **'Other'**
  String get reasonOther;

  /// No description provided for @multipleReasonsLabel.
  ///
  /// In en, this message translates to:
  /// **'Multiple reasons'**
  String get multipleReasonsLabel;

  /// No description provided for @customReasonLabel.
  ///
  /// In en, this message translates to:
  /// **'Please specify'**
  String get customReasonLabel;

  /// No description provided for @returnSubmittedTitle.
  ///
  /// In en, this message translates to:
  /// **'Return requested'**
  String get returnSubmittedTitle;

  /// No description provided for @returnSubmittedMessage.
  ///
  /// In en, this message translates to:
  /// **'Your return request has been submitted. The warehouse will review it.'**
  String get returnSubmittedMessage;

  /// No description provided for @returnStatusPending.
  ///
  /// In en, this message translates to:
  /// **'Pending review'**
  String get returnStatusPending;

  /// No description provided for @returnStatusApproved.
  ///
  /// In en, this message translates to:
  /// **'Approved'**
  String get returnStatusApproved;

  /// No description provided for @returnStatusRejected.
  ///
  /// In en, this message translates to:
  /// **'Rejected'**
  String get returnStatusRejected;

  /// No description provided for @returnPickItemsLabel.
  ///
  /// In en, this message translates to:
  /// **'Select the items you\'re returning'**
  String get returnPickItemsLabel;

  /// No description provided for @returnRejectionNoteLabel.
  ///
  /// In en, this message translates to:
  /// **'Rejection reason'**
  String get returnRejectionNoteLabel;

  /// No description provided for @returnCreditedLabel.
  ///
  /// In en, this message translates to:
  /// **'Credited to your account: {amount}'**
  String returnCreditedLabel(String amount);

  /// No description provided for @editButton.
  ///
  /// In en, this message translates to:
  /// **'Edit'**
  String get editButton;

  /// No description provided for @deleteReturnButton.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get deleteReturnButton;

  /// No description provided for @deleteReturnConfirmTitle.
  ///
  /// In en, this message translates to:
  /// **'Delete return request?'**
  String get deleteReturnConfirmTitle;

  /// No description provided for @deleteReturnConfirmMessage.
  ///
  /// In en, this message translates to:
  /// **'Are you sure you want to delete this return request?'**
  String get deleteReturnConfirmMessage;

  /// No description provided for @returnApprovedBanner.
  ///
  /// In en, this message translates to:
  /// **'Return approved — your account has been credited'**
  String get returnApprovedBanner;

  /// No description provided for @returnPendingReviewBanner.
  ///
  /// In en, this message translates to:
  /// **'Return submitted, awaiting the warehouse\'s review'**
  String get returnPendingReviewBanner;

  /// No description provided for @returnRejectedBanner.
  ///
  /// In en, this message translates to:
  /// **'Return rejected'**
  String get returnRejectedBanner;

  /// No description provided for @errorOrderNotDelivered.
  ///
  /// In en, this message translates to:
  /// **'This order hasn\'t been delivered yet.'**
  String get errorOrderNotDelivered;

  /// No description provided for @errorOrderNotReorderable.
  ///
  /// In en, this message translates to:
  /// **'Only delivered orders can be reordered.'**
  String get errorOrderNotReorderable;

  /// No description provided for @errorOrderItemNotFound.
  ///
  /// In en, this message translates to:
  /// **'This item could not be found in the order.'**
  String get errorOrderItemNotFound;

  /// No description provided for @errorReturnQuantityExceeded.
  ///
  /// In en, this message translates to:
  /// **'The return quantity exceeds what\'s available to return for this item.'**
  String get errorReturnQuantityExceeded;

  /// No description provided for @errorCustomReasonRequired.
  ///
  /// In en, this message translates to:
  /// **'Please describe the reason for this return.'**
  String get errorCustomReasonRequired;

  /// No description provided for @errorTooManyReturnPhotos.
  ///
  /// In en, this message translates to:
  /// **'You can attach up to 5 photos.'**
  String get errorTooManyReturnPhotos;

  /// No description provided for @errorInvalidReturnPhoto.
  ///
  /// In en, this message translates to:
  /// **'One of the attached photos is not a valid image.'**
  String get errorInvalidReturnPhoto;

  /// No description provided for @errorReturnAlreadyExists.
  ///
  /// In en, this message translates to:
  /// **'A return request has already been submitted for this order.'**
  String get errorReturnAlreadyExists;

  /// No description provided for @errorReturnNotEditable.
  ///
  /// In en, this message translates to:
  /// **'This return request has already been decided and can no longer be changed.'**
  String get errorReturnNotEditable;

  /// No description provided for @errorReturnItemsEmpty.
  ///
  /// In en, this message translates to:
  /// **'Please select at least one item to return.'**
  String get errorReturnItemsEmpty;

  /// No description provided for @errorDuplicateReturnItem.
  ///
  /// In en, this message translates to:
  /// **'Each item can only appear once in a return request.'**
  String get errorDuplicateReturnItem;

  /// No description provided for @errorRejectionNoteRequired.
  ///
  /// In en, this message translates to:
  /// **'Please explain why this return is being rejected.'**
  String get errorRejectionNoteRequired;

  /// No description provided for @returnPhotosLabel.
  ///
  /// In en, this message translates to:
  /// **'Photos (optional)'**
  String get returnPhotosLabel;

  /// No description provided for @returnPhotosHint.
  ///
  /// In en, this message translates to:
  /// **'Optionally add photos of the item to help the warehouse verify the reason'**
  String get returnPhotosHint;

  /// No description provided for @addPhotoButton.
  ///
  /// In en, this message translates to:
  /// **'Add photo'**
  String get addPhotoButton;

  /// No description provided for @cameraOption.
  ///
  /// In en, this message translates to:
  /// **'Take a photo'**
  String get cameraOption;

  /// No description provided for @galleryOption.
  ///
  /// In en, this message translates to:
  /// **'Choose from gallery'**
  String get galleryOption;

  /// No description provided for @permissionRequiredTitle.
  ///
  /// In en, this message translates to:
  /// **'Permission needed'**
  String get permissionRequiredTitle;

  /// No description provided for @cameraPermissionDenied.
  ///
  /// In en, this message translates to:
  /// **'Camera access is needed to take a photo. You can enable it in Settings.'**
  String get cameraPermissionDenied;

  /// No description provided for @openSettings.
  ///
  /// In en, this message translates to:
  /// **'Open Settings'**
  String get openSettings;

  /// No description provided for @navWarehouses.
  ///
  /// In en, this message translates to:
  /// **'Warehouses'**
  String get navWarehouses;

  /// No description provided for @navAccounts.
  ///
  /// In en, this message translates to:
  /// **'Accounts'**
  String get navAccounts;

  /// No description provided for @showPassword.
  ///
  /// In en, this message translates to:
  /// **'Show password'**
  String get showPassword;

  /// No description provided for @hidePassword.
  ///
  /// In en, this message translates to:
  /// **'Hide password'**
  String get hidePassword;

  /// No description provided for @increaseQuantity.
  ///
  /// In en, this message translates to:
  /// **'Increase quantity'**
  String get increaseQuantity;

  /// No description provided for @decreaseQuantity.
  ///
  /// In en, this message translates to:
  /// **'Decrease quantity'**
  String get decreaseQuantity;

  /// No description provided for @navOrders.
  ///
  /// In en, this message translates to:
  /// **'Orders'**
  String get navOrders;

  /// No description provided for @profileTitle.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get profileTitle;

  /// No description provided for @personalInfoTitle.
  ///
  /// In en, this message translates to:
  /// **'Personal information'**
  String get personalInfoTitle;

  /// No description provided for @cityLabel.
  ///
  /// In en, this message translates to:
  /// **'City'**
  String get cityLabel;

  /// No description provided for @logoutConfirmTitle.
  ///
  /// In en, this message translates to:
  /// **'Log out?'**
  String get logoutConfirmTitle;

  /// No description provided for @logoutConfirmMessage.
  ///
  /// In en, this message translates to:
  /// **'Are you sure you want to log out?'**
  String get logoutConfirmMessage;

  /// No description provided for @dangerZoneTitle.
  ///
  /// In en, this message translates to:
  /// **'Danger zone'**
  String get dangerZoneTitle;

  /// No description provided for @deleteAccount.
  ///
  /// In en, this message translates to:
  /// **'Delete account'**
  String get deleteAccount;

  /// No description provided for @deleteAccountSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Permanently delete your account'**
  String get deleteAccountSubtitle;

  /// No description provided for @deleteAccountConfirmTitle.
  ///
  /// In en, this message translates to:
  /// **'Delete your account permanently?'**
  String get deleteAccountConfirmTitle;

  /// No description provided for @deleteAccountConfirmMessage.
  ///
  /// In en, this message translates to:
  /// **'Your account will be deleted permanently and you will not be able to sign in again. This cannot be undone.\n\nYour past orders and financial records will remain in the records of the warehouses you dealt with.\n\nEnter your password to confirm.'**
  String get deleteAccountConfirmMessage;

  /// No description provided for @deleteAccountPasswordLabel.
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get deleteAccountPasswordLabel;

  /// No description provided for @deleteAccountPasswordRequired.
  ///
  /// In en, this message translates to:
  /// **'Enter your password to continue.'**
  String get deleteAccountPasswordRequired;

  /// No description provided for @deleteAccountConfirmAction.
  ///
  /// In en, this message translates to:
  /// **'Delete permanently'**
  String get deleteAccountConfirmAction;

  /// No description provided for @deleteAccountSuccess.
  ///
  /// In en, this message translates to:
  /// **'Your account has been deleted.'**
  String get deleteAccountSuccess;

  /// No description provided for @errorPhoneAlreadyRegistered.
  ///
  /// In en, this message translates to:
  /// **'An account already exists for this phone number. Please sign in instead.'**
  String get errorPhoneAlreadyRegistered;

  /// No description provided for @errorInvalidCurrentPassword.
  ///
  /// In en, this message translates to:
  /// **'That password is incorrect.'**
  String get errorInvalidCurrentPassword;

  /// No description provided for @yourRatingTitle.
  ///
  /// In en, this message translates to:
  /// **'Your rating'**
  String get yourRatingTitle;

  /// No description provided for @ratingsTitle.
  ///
  /// In en, this message translates to:
  /// **'Ratings'**
  String get ratingsTitle;

  /// No description provided for @viewRatingsLabel.
  ///
  /// In en, this message translates to:
  /// **'View Ratings'**
  String get viewRatingsLabel;

  /// No description provided for @noRatingsYet.
  ///
  /// In en, this message translates to:
  /// **'No warehouse has rated you yet.'**
  String get noRatingsYet;

  /// No description provided for @ratingSummary.
  ///
  /// In en, this message translates to:
  /// **'{average} average ({count} ratings)'**
  String ratingSummary(String average, String count);

  /// No description provided for @myDebtsTitle.
  ///
  /// In en, this message translates to:
  /// **'My Debts'**
  String get myDebtsTitle;

  /// No description provided for @noDebtsYet.
  ///
  /// In en, this message translates to:
  /// **'No debts right now.'**
  String get noDebtsYet;

  /// No description provided for @totalDebtsLabel.
  ///
  /// In en, this message translates to:
  /// **'Total debts'**
  String get totalDebtsLabel;

  /// No description provided for @totalOrdersLabel.
  ///
  /// In en, this message translates to:
  /// **'Total orders'**
  String get totalOrdersLabel;

  /// No description provided for @totalPaidLabel.
  ///
  /// In en, this message translates to:
  /// **'Total paid'**
  String get totalPaidLabel;

  /// No description provided for @currentBalanceLabel.
  ///
  /// In en, this message translates to:
  /// **'Current balance'**
  String get currentBalanceLabel;

  /// No description provided for @creditBalanceLabel.
  ///
  /// In en, this message translates to:
  /// **'Credit balance'**
  String get creditBalanceLabel;

  /// No description provided for @deliveredOrdersTitle.
  ///
  /// In en, this message translates to:
  /// **'Delivered orders'**
  String get deliveredOrdersTitle;

  /// No description provided for @paymentsTitle.
  ///
  /// In en, this message translates to:
  /// **'Payments'**
  String get paymentsTitle;

  /// No description provided for @noPaymentsYet.
  ///
  /// In en, this message translates to:
  /// **'No payments recorded yet.'**
  String get noPaymentsYet;

  /// No description provided for @rateWarehouseTitle.
  ///
  /// In en, this message translates to:
  /// **'Rate the warehouse'**
  String get rateWarehouseTitle;

  /// No description provided for @rateWarehouseCommentLabel.
  ///
  /// In en, this message translates to:
  /// **'Comment (optional)'**
  String get rateWarehouseCommentLabel;

  /// No description provided for @submitReviewButton.
  ///
  /// In en, this message translates to:
  /// **'Submit rating'**
  String get submitReviewButton;

  /// No description provided for @submitReviewConfirmTitle.
  ///
  /// In en, this message translates to:
  /// **'Submit rating?'**
  String get submitReviewConfirmTitle;

  /// No description provided for @submitReviewConfirmMessage.
  ///
  /// In en, this message translates to:
  /// **'You won\'t be able to change this rating after sending it. Continue?'**
  String get submitReviewConfirmMessage;

  /// No description provided for @reviewThankYouTitle.
  ///
  /// In en, this message translates to:
  /// **'Thanks — you rated this order {rating} stars'**
  String reviewThankYouTitle(String rating);

  /// No description provided for @errorAlreadyReviewed.
  ///
  /// In en, this message translates to:
  /// **'This order has already been rated.'**
  String get errorAlreadyReviewed;

  /// No description provided for @minOrderLabel.
  ///
  /// In en, this message translates to:
  /// **'Minimum order: {amount}'**
  String minOrderLabel(String amount);

  /// No description provided for @maxOrderLabel.
  ///
  /// In en, this message translates to:
  /// **'Maximum order: {amount}'**
  String maxOrderLabel(String amount);

  /// No description provided for @addMoreToReachMinimum.
  ///
  /// In en, this message translates to:
  /// **'Add {amount} more to reach the minimum'**
  String addMoreToReachMinimum(String amount);

  /// No description provided for @removeToMeetMaximum.
  ///
  /// In en, this message translates to:
  /// **'Over the {amount} maximum — remove some items'**
  String removeToMeetMaximum(String amount);

  /// No description provided for @orderBelowMinimum.
  ///
  /// In en, this message translates to:
  /// **'The minimum order from this warehouse is {amount}.'**
  String orderBelowMinimum(String amount);

  /// No description provided for @orderAboveMaximum.
  ///
  /// In en, this message translates to:
  /// **'The maximum order from this warehouse is {amount}.'**
  String orderAboveMaximum(String amount);

  /// No description provided for @loadingOrderLimits.
  ///
  /// In en, this message translates to:
  /// **'Updating the order limits'**
  String get loadingOrderLimits;

  /// No description provided for @returnableSectionTitle.
  ///
  /// In en, this message translates to:
  /// **'Orders eligible for return'**
  String get returnableSectionTitle;

  /// No description provided for @returnableSectionSubtitle.
  ///
  /// In en, this message translates to:
  /// **'You can request a return within 24 hours of delivery'**
  String get returnableSectionSubtitle;

  /// No description provided for @returnableDeliveredOnLabel.
  ///
  /// In en, this message translates to:
  /// **'Delivered {date}'**
  String returnableDeliveredOnLabel(String date);

  /// No description provided for @returnableOrderNumber.
  ///
  /// In en, this message translates to:
  /// **'Order #{number}'**
  String returnableOrderNumber(String number);

  /// No description provided for @returnableHoursLeft.
  ///
  /// In en, this message translates to:
  /// **'{hours}h left'**
  String returnableHoursLeft(String hours);

  /// No description provided for @returnableEndingSoon.
  ///
  /// In en, this message translates to:
  /// **'Ending soon'**
  String get returnableEndingSoon;

  /// No description provided for @returnableRequestButton.
  ///
  /// In en, this message translates to:
  /// **'Request a return'**
  String get returnableRequestButton;

  /// No description provided for @returnableMoreItems.
  ///
  /// In en, this message translates to:
  /// **'+{count} more'**
  String returnableMoreItems(String count);

  /// No description provided for @returnWindowExpired.
  ///
  /// In en, this message translates to:
  /// **'A return must be requested within 24 hours of delivery.'**
  String get returnWindowExpired;

  /// No description provided for @privacyPolicy.
  ///
  /// In en, this message translates to:
  /// **'Privacy Policy'**
  String get privacyPolicy;

  /// No description provided for @privacyPolicyLastUpdated.
  ///
  /// In en, this message translates to:
  /// **'Last updated: {date}'**
  String privacyPolicyLastUpdated(String date);

  /// No description provided for @complaintsTitle.
  ///
  /// In en, this message translates to:
  /// **'Complaints'**
  String get complaintsTitle;

  /// No description provided for @complaintsProfileSubtitle.
  ///
  /// In en, this message translates to:
  /// **'File a complaint about a warehouse and follow its status'**
  String get complaintsProfileSubtitle;

  /// No description provided for @complaintsCountSubtitle.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, zero{No complaints yet} one{1 complaint} other{{count} complaints}}'**
  String complaintsCountSubtitle(int count);

  /// No description provided for @noComplaintsYet.
  ///
  /// In en, this message translates to:
  /// **'You haven\'t filed any complaints yet.'**
  String get noComplaintsYet;

  /// No description provided for @noComplaintsYetHint.
  ///
  /// In en, this message translates to:
  /// **'If you run into a problem with a warehouse, you can file a complaint for the administration to review.'**
  String get noComplaintsYetHint;

  /// No description provided for @submitComplaintCta.
  ///
  /// In en, this message translates to:
  /// **'Submit a complaint'**
  String get submitComplaintCta;

  /// No description provided for @submitComplaintTitle.
  ///
  /// In en, this message translates to:
  /// **'Submit a complaint'**
  String get submitComplaintTitle;

  /// No description provided for @submitComplaintButton.
  ///
  /// In en, this message translates to:
  /// **'Submit complaint'**
  String get submitComplaintButton;

  /// No description provided for @complaintSubmittedMessage.
  ///
  /// In en, this message translates to:
  /// **'Your complaint has been submitted. The administration will review it.'**
  String get complaintSubmittedMessage;

  /// No description provided for @complaintWarehouseLabel.
  ///
  /// In en, this message translates to:
  /// **'Warehouse'**
  String get complaintWarehouseLabel;

  /// No description provided for @complaintWarehouseHint.
  ///
  /// In en, this message translates to:
  /// **'Choose the warehouse this complaint is about'**
  String get complaintWarehouseHint;

  /// No description provided for @complaintSubjectLabel.
  ///
  /// In en, this message translates to:
  /// **'Complaint subject'**
  String get complaintSubjectLabel;

  /// No description provided for @complaintSubjectHint.
  ///
  /// In en, this message translates to:
  /// **'Summarize the issue in a short sentence'**
  String get complaintSubjectHint;

  /// No description provided for @complaintDescriptionLabel.
  ///
  /// In en, this message translates to:
  /// **'Complaint details'**
  String get complaintDescriptionLabel;

  /// No description provided for @complaintDescriptionHint.
  ///
  /// In en, this message translates to:
  /// **'Describe the problem in detail'**
  String get complaintDescriptionHint;

  /// No description provided for @complaintOrderNumberLabel.
  ///
  /// In en, this message translates to:
  /// **'Related order number (optional)'**
  String get complaintOrderNumberLabel;

  /// No description provided for @complaintOrderNumberHint.
  ///
  /// In en, this message translates to:
  /// **'Enter the order number if this complaint is about an order'**
  String get complaintOrderNumberHint;

  /// No description provided for @complaintExtraDetailsLabel.
  ///
  /// In en, this message translates to:
  /// **'Additional details (optional)'**
  String get complaintExtraDetailsLabel;

  /// No description provided for @complaintExtraDetailsHint.
  ///
  /// In en, this message translates to:
  /// **'Any other information that could help resolve the complaint'**
  String get complaintExtraDetailsHint;

  /// No description provided for @complaintFormFooterHint.
  ///
  /// In en, this message translates to:
  /// **'Your warehouse\'s information is attached to the complaint automatically.'**
  String get complaintFormFooterHint;

  /// No description provided for @complaintDetailTitle.
  ///
  /// In en, this message translates to:
  /// **'Complaint details'**
  String get complaintDetailTitle;

  /// No description provided for @complaintYourComplaintTitle.
  ///
  /// In en, this message translates to:
  /// **'Your complaint'**
  String get complaintYourComplaintTitle;

  /// No description provided for @complaintResponseTitle.
  ///
  /// In en, this message translates to:
  /// **'Response'**
  String get complaintResponseTitle;

  /// No description provided for @complaintNumberLabel.
  ///
  /// In en, this message translates to:
  /// **'Complaint #{number}'**
  String complaintNumberLabel(String number);

  /// No description provided for @complaintFiledOnLabel.
  ///
  /// In en, this message translates to:
  /// **'Filed on {date}'**
  String complaintFiledOnLabel(String date);

  /// No description provided for @complaintRelatedOrderLabel.
  ///
  /// In en, this message translates to:
  /// **'Related order: #{number}'**
  String complaintRelatedOrderLabel(String number);

  /// No description provided for @complaintAboutWarehouseLabel.
  ///
  /// In en, this message translates to:
  /// **'About this warehouse'**
  String get complaintAboutWarehouseLabel;

  /// No description provided for @complaintHasResponseHint.
  ///
  /// In en, this message translates to:
  /// **'Reply received'**
  String get complaintHasResponseHint;

  /// No description provided for @complaintNoResponseYet.
  ///
  /// In en, this message translates to:
  /// **'The administration hasn\'t responded yet. You\'ll be notified when a reply arrives.'**
  String get complaintNoResponseYet;

  /// No description provided for @complaintAdminResponseLabel.
  ///
  /// In en, this message translates to:
  /// **'Administration\'s response'**
  String get complaintAdminResponseLabel;

  /// No description provided for @complaintRespondedOnLabel.
  ///
  /// In en, this message translates to:
  /// **'Responded on {date}'**
  String complaintRespondedOnLabel(String date);

  /// No description provided for @complaintRespondedByLabel.
  ///
  /// In en, this message translates to:
  /// **'Responded by {name}'**
  String complaintRespondedByLabel(String name);

  /// No description provided for @complaintStatusPending.
  ///
  /// In en, this message translates to:
  /// **'Pending'**
  String get complaintStatusPending;

  /// No description provided for @complaintStatusInReview.
  ///
  /// In en, this message translates to:
  /// **'In review'**
  String get complaintStatusInReview;

  /// No description provided for @complaintStatusResolved.
  ///
  /// In en, this message translates to:
  /// **'Resolved'**
  String get complaintStatusResolved;

  /// No description provided for @complaintStatusClosed.
  ///
  /// In en, this message translates to:
  /// **'Closed'**
  String get complaintStatusClosed;

  /// No description provided for @errorComplaintWarehouseRequired.
  ///
  /// In en, this message translates to:
  /// **'Please choose the warehouse this complaint is about.'**
  String get errorComplaintWarehouseRequired;

  /// No description provided for @errorComplaintSubjectRequired.
  ///
  /// In en, this message translates to:
  /// **'Please enter a subject for the complaint.'**
  String get errorComplaintSubjectRequired;

  /// No description provided for @errorComplaintDescriptionRequired.
  ///
  /// In en, this message translates to:
  /// **'Please describe the complaint.'**
  String get errorComplaintDescriptionRequired;

  /// No description provided for @errorComplaintOrderNotFound.
  ///
  /// In en, this message translates to:
  /// **'No order with that number was found for this warehouse.'**
  String get errorComplaintOrderNotFound;

  /// No description provided for @errorComplaintTooLong.
  ///
  /// In en, this message translates to:
  /// **'One of the fields is longer than allowed. Please shorten it.'**
  String get errorComplaintTooLong;

  /// No description provided for @errorComplaintNotFound.
  ///
  /// In en, this message translates to:
  /// **'This complaint could not be found.'**
  String get errorComplaintNotFound;

  /// No description provided for @errorComplaintContextMismatch.
  ///
  /// In en, this message translates to:
  /// **'This complaint can\'t be linked to that warehouse.'**
  String get errorComplaintContextMismatch;

  /// No description provided for @submitComplaintOnWarehouseTitle.
  ///
  /// In en, this message translates to:
  /// **'Complaint about warehouse'**
  String get submitComplaintOnWarehouseTitle;

  /// No description provided for @submitComplaintAboutOrderTitle.
  ///
  /// In en, this message translates to:
  /// **'Complaint about order'**
  String get submitComplaintAboutOrderTitle;

  /// No description provided for @complaintContextGeneral.
  ///
  /// In en, this message translates to:
  /// **'General complaint'**
  String get complaintContextGeneral;

  /// No description provided for @complaintGeneralContextNote.
  ///
  /// In en, this message translates to:
  /// **'This isn\'t about a specific warehouse or order.'**
  String get complaintGeneralContextNote;

  /// No description provided for @complaintOnWarehouseLabel.
  ///
  /// In en, this message translates to:
  /// **'Complaint about'**
  String get complaintOnWarehouseLabel;

  /// No description provided for @complaintAboutOrderLabel.
  ///
  /// In en, this message translates to:
  /// **'Complaint about order'**
  String get complaintAboutOrderLabel;

  /// No description provided for @complaintOrderWarehouseLine.
  ///
  /// In en, this message translates to:
  /// **'Warehouse: {name}'**
  String complaintOrderWarehouseLine(String name);

  /// No description provided for @submitComplaintOnWarehouseCta.
  ///
  /// In en, this message translates to:
  /// **'File a complaint about this warehouse'**
  String get submitComplaintOnWarehouseCta;

  /// No description provided for @submitComplaintAboutOrderCta.
  ///
  /// In en, this message translates to:
  /// **'File a complaint about this order'**
  String get submitComplaintAboutOrderCta;

  /// No description provided for @orderComplaintsSectionTitle.
  ///
  /// In en, this message translates to:
  /// **'Complaints about this order'**
  String get orderComplaintsSectionTitle;

  /// No description provided for @orderComplaintsEmptyPrompt.
  ///
  /// In en, this message translates to:
  /// **'Have a problem with this order? You can file a complaint and the administration will review it.'**
  String get orderComplaintsEmptyPrompt;

  /// No description provided for @updateAvailable.
  ///
  /// In en, this message translates to:
  /// **'New Update Available'**
  String get updateAvailable;

  /// No description provided for @updateAvailableMessage.
  ///
  /// In en, this message translates to:
  /// **'A new version of Feniq is available. Update now to get the latest features and improvements.'**
  String get updateAvailableMessage;

  /// No description provided for @updateRequired.
  ///
  /// In en, this message translates to:
  /// **'Mandatory Update'**
  String get updateRequired;

  /// No description provided for @updateRequiredMessage.
  ///
  /// In en, this message translates to:
  /// **'Your current version of Feniq is no longer supported. Please update the application to continue.'**
  String get updateRequiredMessage;

  /// No description provided for @updateNow.
  ///
  /// In en, this message translates to:
  /// **'Update Now'**
  String get updateNow;

  /// No description provided for @later.
  ///
  /// In en, this message translates to:
  /// **'Later'**
  String get later;

  /// No description provided for @updateOpenStoreFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not download the update or open the Android installer. Check your connection and free space, then retry.'**
  String get updateOpenStoreFailed;

  /// No description provided for @deliverySealRequiredTitle.
  ///
  /// In en, this message translates to:
  /// **'Confirm delivery'**
  String get deliverySealRequiredTitle;

  /// No description provided for @deliverySealRequiredMessage.
  ///
  /// In en, this message translates to:
  /// **'This warehouse asks for a photo of the shipment seal before the order is completed. Take a clear photo of the seal/stamp on the package.'**
  String get deliverySealRequiredMessage;

  /// No description provided for @takeSealPhoto.
  ///
  /// In en, this message translates to:
  /// **'Add seal photo'**
  String get takeSealPhoto;

  /// No description provided for @retakeSealPhoto.
  ///
  /// In en, this message translates to:
  /// **'Retake photo'**
  String get retakeSealPhoto;

  /// No description provided for @confirmDeliveryButton.
  ///
  /// In en, this message translates to:
  /// **'Confirm delivery'**
  String get confirmDeliveryButton;

  /// No description provided for @sealPhotoLabel.
  ///
  /// In en, this message translates to:
  /// **'Delivery seal photo'**
  String get sealPhotoLabel;

  /// No description provided for @deliverySealConfirmedOn.
  ///
  /// In en, this message translates to:
  /// **'Delivery confirmed on {date}'**
  String deliverySealConfirmedOn(String date);

  /// No description provided for @errorDeliverySealPhotoRequired.
  ///
  /// In en, this message translates to:
  /// **'A seal photo is required to confirm delivery.'**
  String get errorDeliverySealPhotoRequired;

  /// No description provided for @errorInvalidDeliverySealPhoto.
  ///
  /// In en, this message translates to:
  /// **'That file isn\'t a valid image. Please choose another photo.'**
  String get errorInvalidDeliverySealPhoto;

  /// No description provided for @errorOrderNotAwaitingDelivery.
  ///
  /// In en, this message translates to:
  /// **'This order isn\'t awaiting a delivery confirmation right now.'**
  String get errorOrderNotAwaitingDelivery;

  /// No description provided for @statementTitle.
  ///
  /// In en, this message translates to:
  /// **'Account statement'**
  String get statementTitle;

  /// No description provided for @statementEmpty.
  ///
  /// In en, this message translates to:
  /// **'No activity yet.'**
  String get statementEmpty;

  /// No description provided for @statementOpening.
  ///
  /// In en, this message translates to:
  /// **'Opening balance'**
  String get statementOpening;

  /// No description provided for @statementCharges.
  ///
  /// In en, this message translates to:
  /// **'Charged'**
  String get statementCharges;

  /// No description provided for @statementPayments.
  ///
  /// In en, this message translates to:
  /// **'Paid'**
  String get statementPayments;

  /// No description provided for @statementReturnCredits.
  ///
  /// In en, this message translates to:
  /// **'Returned'**
  String get statementReturnCredits;

  /// No description provided for @statementKindCharge.
  ///
  /// In en, this message translates to:
  /// **'Order delivered'**
  String get statementKindCharge;

  /// No description provided for @statementKindChargeReversal.
  ///
  /// In en, this message translates to:
  /// **'Delivery reversed'**
  String get statementKindChargeReversal;

  /// No description provided for @statementKindPayment.
  ///
  /// In en, this message translates to:
  /// **'Payment received'**
  String get statementKindPayment;

  /// No description provided for @statementKindPaymentReversal.
  ///
  /// In en, this message translates to:
  /// **'Payment reversed'**
  String get statementKindPaymentReversal;

  /// No description provided for @statementKindReturnCredit.
  ///
  /// In en, this message translates to:
  /// **'Return credited'**
  String get statementKindReturnCredit;

  /// No description provided for @statementKindReturnCreditReversal.
  ///
  /// In en, this message translates to:
  /// **'Return credit reversed'**
  String get statementKindReturnCreditReversal;

  /// No description provided for @statementKindManualCredit.
  ///
  /// In en, this message translates to:
  /// **'Credit added'**
  String get statementKindManualCredit;

  /// No description provided for @statementKindManualDebit.
  ///
  /// In en, this message translates to:
  /// **'Charge added'**
  String get statementKindManualDebit;

  /// No description provided for @statementKindOther.
  ///
  /// In en, this message translates to:
  /// **'Adjustment'**
  String get statementKindOther;

  /// No description provided for @statementInvoiceRef.
  ///
  /// In en, this message translates to:
  /// **'Invoice INV-{number}'**
  String statementInvoiceRef(String number);

  /// No description provided for @statementPaymentRef.
  ///
  /// In en, this message translates to:
  /// **'Payment PAY-{number}'**
  String statementPaymentRef(String number);

  /// No description provided for @creditBalanceShort.
  ///
  /// In en, this message translates to:
  /// **'Credit: {amount}'**
  String creditBalanceShort(String amount);

  /// Bottom-navigation label for the Offers & Ads tab. Deliberately shorter than the screen's own title (offersAndAdsTitle) so it fits a five-tab bar in both languages, matching the app's other one-word tab labels.
  ///
  /// In en, this message translates to:
  /// **'Offers'**
  String get navOffers;

  /// No description provided for @offersAndAdsTitle.
  ///
  /// In en, this message translates to:
  /// **'Exceptional offers & ads'**
  String get offersAndAdsTitle;

  /// No description provided for @promotionsCountSubtitle.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, zero{Nothing running right now} one{1 running now} other{{count} running now}}'**
  String promotionsCountSubtitle(int count);

  /// No description provided for @promotionsAllTitle.
  ///
  /// In en, this message translates to:
  /// **'All exceptional offers & packages'**
  String get promotionsAllTitle;

  /// No description provided for @promotionsFilterAllTypes.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get promotionsFilterAllTypes;

  /// No description provided for @promotionsFilterOffers.
  ///
  /// In en, this message translates to:
  /// **'Exceptional offers'**
  String get promotionsFilterOffers;

  /// No description provided for @promotionsFilterPackages.
  ///
  /// In en, this message translates to:
  /// **'Packages'**
  String get promotionsFilterPackages;

  /// No description provided for @promotionsAllWarehouses.
  ///
  /// In en, this message translates to:
  /// **'All warehouses'**
  String get promotionsAllWarehouses;

  /// No description provided for @promotionsWarehouseFilterTitle.
  ///
  /// In en, this message translates to:
  /// **'Filter by warehouse'**
  String get promotionsWarehouseFilterTitle;

  /// No description provided for @promotionsPackageBadge.
  ///
  /// In en, this message translates to:
  /// **'Package'**
  String get promotionsPackageBadge;

  /// No description provided for @promotionsEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No exceptional offers right now'**
  String get promotionsEmptyTitle;

  /// No description provided for @promotionsEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'Offers and packages from your warehouses will show up here.'**
  String get promotionsEmptyMessage;

  /// No description provided for @promotionsNoFilterResults.
  ///
  /// In en, this message translates to:
  /// **'Nothing matches these filters.'**
  String get promotionsNoFilterResults;

  /// No description provided for @promotionsClearFilters.
  ///
  /// In en, this message translates to:
  /// **'Clear filters'**
  String get promotionsClearFilters;

  /// No description provided for @promotionsError.
  ///
  /// In en, this message translates to:
  /// **'Offers couldn\'t be loaded.'**
  String get promotionsError;

  /// No description provided for @offerDiscountPercent.
  ///
  /// In en, this message translates to:
  /// **'{percent}% off'**
  String offerDiscountPercent(int percent);

  /// No description provided for @offerEndsOn.
  ///
  /// In en, this message translates to:
  /// **'Until {date}'**
  String offerEndsOn(String date);

  /// No description provided for @offerPermanent.
  ///
  /// In en, this message translates to:
  /// **'Ongoing'**
  String get offerPermanent;

  /// The add button on a catalog list row, which used to be a bare + icon. The grid tile and the quantity sheet keep the shorter addToCartButton.
  ///
  /// In en, this message translates to:
  /// **'Add to cart'**
  String get addToCartFullButton;

  /// Title of the screen a tapped Offer card on the Offers & Ads tab opens: the offers of that offer's own warehouse.
  ///
  /// In en, this message translates to:
  /// **'Warehouse\'s exceptional offers'**
  String get warehouseOffersTitle;

  /// No description provided for @discountCodeFieldLabel.
  ///
  /// In en, this message translates to:
  /// **'Discount code'**
  String get discountCodeFieldLabel;

  /// No description provided for @discountCodeHint.
  ///
  /// In en, this message translates to:
  /// **'Enter a discount code'**
  String get discountCodeHint;

  /// No description provided for @discountCodeApply.
  ///
  /// In en, this message translates to:
  /// **'Apply'**
  String get discountCodeApply;

  /// No description provided for @discountCodeRemove.
  ///
  /// In en, this message translates to:
  /// **'Remove'**
  String get discountCodeRemove;

  /// No description provided for @discountCodeApplied.
  ///
  /// In en, this message translates to:
  /// **'Code {code} applied'**
  String discountCodeApplied(String code);

  /// No description provided for @discountCodeLine.
  ///
  /// In en, this message translates to:
  /// **'Discount code ({code})'**
  String discountCodeLine(String code);

  /// No description provided for @loyaltyDiscountLine.
  ///
  /// In en, this message translates to:
  /// **'Warehouse loyalty discount'**
  String get loyaltyDiscountLine;

  /// No description provided for @creditUsedLine.
  ///
  /// In en, this message translates to:
  /// **'From your credit with the warehouse'**
  String get creditUsedLine;

  /// No description provided for @discountCodeUpdating.
  ///
  /// In en, this message translates to:
  /// **'Updating the discount'**
  String get discountCodeUpdating;

  /// No description provided for @discountCodeChangedTitle.
  ///
  /// In en, this message translates to:
  /// **'Discount code changed'**
  String get discountCodeChangedTitle;

  /// No description provided for @discountCodeRemovedMessage.
  ///
  /// In en, this message translates to:
  /// **'{reason} The code was removed from your cart - check the total, then submit again.'**
  String discountCodeRemovedMessage(String reason);

  /// No description provided for @discountCodeEditedMessage.
  ///
  /// In en, this message translates to:
  /// **'The discount code {code} changed. The discount is now {discount} and the total {total}.'**
  String discountCodeEditedMessage(String code, String discount, String total);

  /// No description provided for @errorDiscountCodeInvalid.
  ///
  /// In en, this message translates to:
  /// **'This discount code is not valid.'**
  String get errorDiscountCodeInvalid;

  /// No description provided for @errorDiscountCodeNotStarted.
  ///
  /// In en, this message translates to:
  /// **'This discount code is not active yet.'**
  String get errorDiscountCodeNotStarted;

  /// No description provided for @errorDiscountCodeExpired.
  ///
  /// In en, this message translates to:
  /// **'This discount code has expired.'**
  String get errorDiscountCodeExpired;

  /// No description provided for @errorDiscountCodeLimitReached.
  ///
  /// In en, this message translates to:
  /// **'This discount code has reached its usage limit.'**
  String get errorDiscountCodeLimitReached;

  /// No description provided for @errorDiscountCodePharmacyLimitReached.
  ///
  /// In en, this message translates to:
  /// **'You have already used this code the maximum number of times.'**
  String get errorDiscountCodePharmacyLimitReached;

  /// No description provided for @errorDiscountCodeNotForPharmacy.
  ///
  /// In en, this message translates to:
  /// **'This code is not for your pharmacy.'**
  String get errorDiscountCodeNotForPharmacy;

  /// No description provided for @errorDiscountCodeNotForWarehouse.
  ///
  /// In en, this message translates to:
  /// **'This code does not work on orders to this warehouse.'**
  String get errorDiscountCodeNotForWarehouse;

  /// No description provided for @errorDiscountCodePendingApproval.
  ///
  /// In en, this message translates to:
  /// **'This discount code is still waiting for approval.'**
  String get errorDiscountCodePendingApproval;

  /// No description provided for @errorDiscountCodeStopped.
  ///
  /// In en, this message translates to:
  /// **'This discount code has been stopped.'**
  String get errorDiscountCodeStopped;

  /// No description provided for @errorDiscountCodeEdited.
  ///
  /// In en, this message translates to:
  /// **'The terms of this discount code changed.'**
  String get errorDiscountCodeEdited;

  /// No description provided for @cartQuoteUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t work out the total.'**
  String get cartQuoteUnavailable;

  /// No description provided for @changePasswordTitle.
  ///
  /// In en, this message translates to:
  /// **'Change password'**
  String get changePasswordTitle;

  /// No description provided for @changePasswordSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Choose a new password only you know.'**
  String get changePasswordSubtitle;

  /// No description provided for @changePasswordForcedMessage.
  ///
  /// In en, this message translates to:
  /// **'Your password was reset by support. Please choose a new password to continue.'**
  String get changePasswordForcedMessage;

  /// No description provided for @currentPasswordLabel.
  ///
  /// In en, this message translates to:
  /// **'Current password'**
  String get currentPasswordLabel;

  /// No description provided for @currentPasswordForcedLabel.
  ///
  /// In en, this message translates to:
  /// **'Temporary password'**
  String get currentPasswordForcedLabel;

  /// No description provided for @newPasswordLabel.
  ///
  /// In en, this message translates to:
  /// **'New password'**
  String get newPasswordLabel;

  /// No description provided for @confirmNewPasswordLabel.
  ///
  /// In en, this message translates to:
  /// **'Confirm new password'**
  String get confirmNewPasswordLabel;

  /// No description provided for @changePasswordAction.
  ///
  /// In en, this message translates to:
  /// **'Save new password'**
  String get changePasswordAction;

  /// No description provided for @changePasswordSuccess.
  ///
  /// In en, this message translates to:
  /// **'Password changed. Other devices have been signed out.'**
  String get changePasswordSuccess;

  /// No description provided for @newPasswordSameAsCurrent.
  ///
  /// In en, this message translates to:
  /// **'The new password must be different from the current one.'**
  String get newPasswordSameAsCurrent;

  /// No description provided for @errorPasswordUnchanged.
  ///
  /// In en, this message translates to:
  /// **'The new password must be different from the current one.'**
  String get errorPasswordUnchanged;

  /// No description provided for @errorPasswordMismatch.
  ///
  /// In en, this message translates to:
  /// **'Passwords do not match.'**
  String get errorPasswordMismatch;

  /// No description provided for @errorInvalidPassword.
  ///
  /// In en, this message translates to:
  /// **'This password does not meet the requirements.'**
  String get errorInvalidPassword;

  /// No description provided for @cartOtherWarehousesHint.
  ///
  /// In en, this message translates to:
  /// **'You have a cart at each of these warehouses. Each one is sent as its own order, with its own invoice:'**
  String get cartOtherWarehousesHint;

  /// No description provided for @submitAllButton.
  ///
  /// In en, this message translates to:
  /// **'Send all orders ({count})'**
  String submitAllButton(int count);

  /// No description provided for @submitAllTitle.
  ///
  /// In en, this message translates to:
  /// **'Send all orders?'**
  String get submitAllTitle;

  /// No description provided for @submitAllConfirmation.
  ///
  /// In en, this message translates to:
  /// **'Each warehouse gets its own order, with its own invoice:\n{names}'**
  String submitAllConfirmation(String names);

  /// No description provided for @submitAllDone.
  ///
  /// In en, this message translates to:
  /// **'All orders sent ({count}).'**
  String submitAllDone(int count);

  /// No description provided for @submitAllPartial.
  ///
  /// In en, this message translates to:
  /// **'Sent {sent} of {total}. The orders not sent stay in the cart with the reason.'**
  String submitAllPartial(int sent, int total);

  /// No description provided for @submitThisWarehouseOnly.
  ///
  /// In en, this message translates to:
  /// **'Send only this warehouse\'s order'**
  String get submitThisWarehouseOnly;

  /// No description provided for @exceptionalOfferBadge.
  ///
  /// In en, this message translates to:
  /// **'Special offer'**
  String get exceptionalOfferBadge;

  /// No description provided for @packageContentsTitle.
  ///
  /// In en, this message translates to:
  /// **'What\'s in the package'**
  String get packageContentsTitle;

  /// No description provided for @packageFixedNote.
  ///
  /// In en, this message translates to:
  /// **'A package is fixed: it is ordered whole, as the warehouse set it up - you only choose how many copies.'**
  String get packageFixedNote;

  /// No description provided for @packageShowContents.
  ///
  /// In en, this message translates to:
  /// **'Show what\'s inside'**
  String get packageShowContents;

  /// No description provided for @packageAddToCart.
  ///
  /// In en, this message translates to:
  /// **'Add the package to the cart'**
  String get packageAddToCart;

  /// No description provided for @repNavPharmacies.
  ///
  /// In en, this message translates to:
  /// **'My pharmacies'**
  String get repNavPharmacies;

  /// No description provided for @repNavVisits.
  ///
  /// In en, this message translates to:
  /// **'My visits'**
  String get repNavVisits;

  /// No description provided for @repSearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search by name, owner, phone or address'**
  String get repSearchHint;

  /// No description provided for @repScanAction.
  ///
  /// In en, this message translates to:
  /// **'Scan visit code'**
  String get repScanAction;

  /// No description provided for @repNoPharmaciesTitle.
  ///
  /// In en, this message translates to:
  /// **'No pharmacies assigned to you yet'**
  String get repNoPharmaciesTitle;

  /// No description provided for @repNoPharmaciesSubtitle.
  ///
  /// In en, this message translates to:
  /// **'The warehouse assigns your pharmacies - they appear here as soon as it does.'**
  String get repNoPharmaciesSubtitle;

  /// No description provided for @repNoSearchResults.
  ///
  /// In en, this message translates to:
  /// **'No pharmacy matches your search'**
  String get repNoSearchResults;

  /// No description provided for @repNeverVisited.
  ///
  /// In en, this message translates to:
  /// **'Never visited'**
  String get repNeverVisited;

  /// No description provided for @repLastVisitAgo.
  ///
  /// In en, this message translates to:
  /// **'{days, plural, =0{Last visit: today} =1{Last visit: yesterday} other{Last visit: {days} days ago}}'**
  String repLastVisitAgo(int days);

  /// No description provided for @repMonthOrdersCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =0{No orders this month} =1{1 order this month} other{{count} orders this month}}'**
  String repMonthOrdersCount(int count);

  /// No description provided for @repStatPharmacies.
  ///
  /// In en, this message translates to:
  /// **'Pharmacies'**
  String get repStatPharmacies;

  /// No description provided for @repStatVisitsWeek.
  ///
  /// In en, this message translates to:
  /// **'Visits, 7 days'**
  String get repStatVisitsWeek;

  /// No description provided for @repStatOrdersMonth.
  ///
  /// In en, this message translates to:
  /// **'Orders this month'**
  String get repStatOrdersMonth;

  /// No description provided for @repStatSalesMonth.
  ///
  /// In en, this message translates to:
  /// **'Their value'**
  String get repStatSalesMonth;

  /// No description provided for @repStatCommissionMonth.
  ///
  /// In en, this message translates to:
  /// **'Your commission this month'**
  String get repStatCommissionMonth;

  /// No description provided for @repCommissionHint.
  ///
  /// In en, this message translates to:
  /// **'You earn {rate} of the value of delivered orders from your pharmacies placed through Feniq.'**
  String repCommissionHint(String rate);

  /// No description provided for @repOwnerLabel.
  ///
  /// In en, this message translates to:
  /// **'Owner'**
  String get repOwnerLabel;

  /// No description provided for @repCallAction.
  ///
  /// In en, this message translates to:
  /// **'Call'**
  String get repCallAction;

  /// No description provided for @repLogVisitAction.
  ///
  /// In en, this message translates to:
  /// **'Log a visit'**
  String get repLogVisitAction;

  /// No description provided for @repNoLocationWarning.
  ///
  /// In en, this message translates to:
  /// **'This pharmacy has not set its map location yet, so a visit here cannot be verified.'**
  String get repNoLocationWarning;

  /// No description provided for @repRecentOrders.
  ///
  /// In en, this message translates to:
  /// **'Latest orders'**
  String get repRecentOrders;

  /// No description provided for @repNoOrdersYet.
  ///
  /// In en, this message translates to:
  /// **'No orders from this pharmacy yet'**
  String get repNoOrdersYet;

  /// No description provided for @repRecentVisits.
  ///
  /// In en, this message translates to:
  /// **'Your latest visits here'**
  String get repRecentVisits;

  /// No description provided for @repNoVisitsHere.
  ///
  /// In en, this message translates to:
  /// **'You have not visited this pharmacy yet'**
  String get repNoVisitsHere;

  /// No description provided for @repVisitsTitle.
  ///
  /// In en, this message translates to:
  /// **'My visits'**
  String get repVisitsTitle;

  /// No description provided for @repNoVisitsTitle.
  ///
  /// In en, this message translates to:
  /// **'No visits logged yet'**
  String get repNoVisitsTitle;

  /// No description provided for @repNoVisitsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Scan the QR code at a pharmacy to log your visit.'**
  String get repNoVisitsSubtitle;

  /// No description provided for @repVisitVerified.
  ///
  /// In en, this message translates to:
  /// **'Verified'**
  String get repVisitVerified;

  /// No description provided for @repVisitOutOfRange.
  ///
  /// In en, this message translates to:
  /// **'Out of range'**
  String get repVisitOutOfRange;

  /// No description provided for @repVisitMockLocation.
  ///
  /// In en, this message translates to:
  /// **'Spoofed location'**
  String get repVisitMockLocation;

  /// No description provided for @repVisitNoPharmacyLocation.
  ///
  /// In en, this message translates to:
  /// **'Pharmacy has no location'**
  String get repVisitNoPharmacyLocation;

  /// No description provided for @repDistanceMeters.
  ///
  /// In en, this message translates to:
  /// **'{meters} m away'**
  String repDistanceMeters(int meters);

  /// No description provided for @repScanTitle.
  ///
  /// In en, this message translates to:
  /// **'Scan visit code'**
  String get repScanTitle;

  /// No description provided for @repScanHint.
  ///
  /// In en, this message translates to:
  /// **'Point the camera at the Feniq QR code at the pharmacy.'**
  String get repScanHint;

  /// No description provided for @repScanNotFeniq.
  ///
  /// In en, this message translates to:
  /// **'That is not a Feniq visit code.'**
  String get repScanNotFeniq;

  /// No description provided for @repScanLocating.
  ///
  /// In en, this message translates to:
  /// **'Finding your location...'**
  String get repScanLocating;

  /// No description provided for @repScanSubmitting.
  ///
  /// In en, this message translates to:
  /// **'Logging the visit...'**
  String get repScanSubmitting;

  /// No description provided for @repScanVerifiedTitle.
  ///
  /// In en, this message translates to:
  /// **'Visit verified'**
  String get repScanVerifiedTitle;

  /// No description provided for @repScanDuplicateTitle.
  ///
  /// In en, this message translates to:
  /// **'Already logged a moment ago'**
  String get repScanDuplicateTitle;

  /// No description provided for @repScanUnverifiedTitle.
  ///
  /// In en, this message translates to:
  /// **'Visit logged, not verified'**
  String get repScanUnverifiedTitle;

  /// No description provided for @repScanOutOfRangeMessage.
  ///
  /// In en, this message translates to:
  /// **'Your phone is {meters} m from the pharmacy. Go to the pharmacy and scan again to verify.'**
  String repScanOutOfRangeMessage(int meters);

  /// No description provided for @repScanMockMessage.
  ///
  /// In en, this message translates to:
  /// **'Your phone reports a spoofed location, so the visit cannot be verified.'**
  String get repScanMockMessage;

  /// No description provided for @repScanNoLocationMessage.
  ///
  /// In en, this message translates to:
  /// **'The pharmacy has not set its location yet, so the visit cannot be verified.'**
  String get repScanNoLocationMessage;

  /// No description provided for @repScanAnother.
  ///
  /// In en, this message translates to:
  /// **'Scan another code'**
  String get repScanAnother;

  /// No description provided for @repScanTryAgain.
  ///
  /// In en, this message translates to:
  /// **'Try again'**
  String get repScanTryAgain;

  /// No description provided for @repLocationServiceOff.
  ///
  /// In en, this message translates to:
  /// **'Turn on location (GPS) on your phone, then try again.'**
  String get repLocationServiceOff;

  /// No description provided for @repLocationDenied.
  ///
  /// In en, this message translates to:
  /// **'Location permission is needed to verify the visit.'**
  String get repLocationDenied;

  /// No description provided for @repLocationDeniedForever.
  ///
  /// In en, this message translates to:
  /// **'Location permission is blocked. Allow it from the app settings.'**
  String get repLocationDeniedForever;

  /// No description provided for @repLocationUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Could not find your location. Check that GPS is on and try again.'**
  String get repLocationUnavailable;

  /// No description provided for @repOpenSettings.
  ///
  /// In en, this message translates to:
  /// **'Open settings'**
  String get repOpenSettings;

  /// No description provided for @repCameraDenied.
  ///
  /// In en, this message translates to:
  /// **'Camera permission is needed to scan the code. Allow it from the app settings.'**
  String get repCameraDenied;

  /// No description provided for @repCameraUnavailable.
  ///
  /// In en, this message translates to:
  /// **'The camera could not be started.'**
  String get repCameraUnavailable;

  /// No description provided for @repWarehouseLabel.
  ///
  /// In en, this message translates to:
  /// **'Warehouse'**
  String get repWarehouseLabel;

  /// No description provided for @repProfileHint.
  ///
  /// In en, this message translates to:
  /// **'You are signed in as a rep. Your warehouse manages your pharmacies.'**
  String get repProfileHint;

  /// No description provided for @errorRepPharmacyNotAssigned.
  ///
  /// In en, this message translates to:
  /// **'This pharmacy is not assigned to you.'**
  String get errorRepPharmacyNotAssigned;

  /// No description provided for @errorRepVisitCodeUnknown.
  ///
  /// In en, this message translates to:
  /// **'No pharmacy has this visit code.'**
  String get errorRepVisitCodeUnknown;

  /// No description provided for @errorRepVisitCodeInvalid.
  ///
  /// In en, this message translates to:
  /// **'That is not a Feniq visit code.'**
  String get errorRepVisitCodeInvalid;

  /// No description provided for @errorRepInactive.
  ///
  /// In en, this message translates to:
  /// **'Your rep account has been switched off by the warehouse.'**
  String get errorRepInactive;

  /// No description provided for @errorRepInvalidLocation.
  ///
  /// In en, this message translates to:
  /// **'Could not read your location. Try again.'**
  String get errorRepInvalidLocation;

  /// No description provided for @pharmacyVisitCodeTitle.
  ///
  /// In en, this message translates to:
  /// **'Visit code'**
  String get pharmacyVisitCodeTitle;

  /// No description provided for @pharmacyVisitCodeSubtitle.
  ///
  /// In en, this message translates to:
  /// **'For reps who visit you'**
  String get pharmacyVisitCodeSubtitle;

  /// No description provided for @pharmacyVisitCodeIntro.
  ///
  /// In en, this message translates to:
  /// **'Show this code to the warehouse rep so they can scan it when they visit. The visit is verified only if their phone is at your pharmacy.'**
  String get pharmacyVisitCodeIntro;

  /// No description provided for @panelHomeTitle.
  ///
  /// In en, this message translates to:
  /// **'Control panel'**
  String get panelHomeTitle;

  /// No description provided for @panelHomeGreeting.
  ///
  /// In en, this message translates to:
  /// **'Hello {name}'**
  String panelHomeGreeting(String name);

  /// No description provided for @panelHomeBody.
  ///
  /// In en, this message translates to:
  /// **'Open the control panel to manage your work. Available tools and data depend on your account role and permissions.'**
  String get panelHomeBody;

  /// No description provided for @panelHomeOpenPanel.
  ///
  /// In en, this message translates to:
  /// **'Open the control panel'**
  String get panelHomeOpenPanel;

  /// No description provided for @panelHomeOpenFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not open the panel. Open {url} in your browser.'**
  String panelHomeOpenFailed(String url);

  /// No description provided for @warehouseNavOrders.
  ///
  /// In en, this message translates to:
  /// **'Orders'**
  String get warehouseNavOrders;

  /// No description provided for @warehouseNavAccount.
  ///
  /// In en, this message translates to:
  /// **'Account'**
  String get warehouseNavAccount;

  /// No description provided for @warehouseFilterAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get warehouseFilterAll;

  /// No description provided for @warehouseMarkDelivered.
  ///
  /// In en, this message translates to:
  /// **'Mark as delivered'**
  String get warehouseMarkDelivered;

  /// No description provided for @warehouseConfirmApproveTitle.
  ///
  /// In en, this message translates to:
  /// **'Send this order on its way?'**
  String get warehouseConfirmApproveTitle;

  /// No description provided for @warehouseConfirmApproveBody.
  ///
  /// In en, this message translates to:
  /// **'Order #{number} leaves for the pharmacy, and its items can no longer be changed.'**
  String warehouseConfirmApproveBody(int number);

  /// No description provided for @warehouseOrderTitle.
  ///
  /// In en, this message translates to:
  /// **'Order #{number}'**
  String warehouseOrderTitle(int number);

  /// No description provided for @warehouseOrderItemsCount.
  ///
  /// In en, this message translates to:
  /// **'Items: {count}'**
  String warehouseOrderItemsCount(int count);

  /// No description provided for @warehouseNoOrdersTitle.
  ///
  /// In en, this message translates to:
  /// **'No orders here'**
  String get warehouseNoOrdersTitle;

  /// No description provided for @warehouseNoOrdersSubtitle.
  ///
  /// In en, this message translates to:
  /// **'New orders show up here as soon as they arrive, with a notification.'**
  String get warehouseNoOrdersSubtitle;

  /// No description provided for @warehouseSectionPharmacy.
  ///
  /// In en, this message translates to:
  /// **'Pharmacy'**
  String get warehouseSectionPharmacy;

  /// No description provided for @warehouseSectionItems.
  ///
  /// In en, this message translates to:
  /// **'Items'**
  String get warehouseSectionItems;

  /// No description provided for @warehouseSectionMoney.
  ///
  /// In en, this message translates to:
  /// **'Amounts'**
  String get warehouseSectionMoney;

  /// No description provided for @warehouseSectionHistory.
  ///
  /// In en, this message translates to:
  /// **'Order history'**
  String get warehouseSectionHistory;

  /// No description provided for @warehouseSectionNotes.
  ///
  /// In en, this message translates to:
  /// **'Pharmacy\'s notes'**
  String get warehouseSectionNotes;

  /// No description provided for @warehouseCall.
  ///
  /// In en, this message translates to:
  /// **'Call'**
  String get warehouseCall;

  /// No description provided for @warehouseFreeUnits.
  ///
  /// In en, this message translates to:
  /// **'+{count} free'**
  String warehouseFreeUnits(int count);

  /// No description provided for @warehousePackageLine.
  ///
  /// In en, this message translates to:
  /// **'In a package'**
  String get warehousePackageLine;

  /// No description provided for @warehouseSubtotal.
  ///
  /// In en, this message translates to:
  /// **'Subtotal'**
  String get warehouseSubtotal;

  /// No description provided for @warehouseDiscounts.
  ///
  /// In en, this message translates to:
  /// **'Discounts'**
  String get warehouseDiscounts;

  /// No description provided for @warehousePharmacyPays.
  ///
  /// In en, this message translates to:
  /// **'Pharmacy pays'**
  String get warehousePharmacyPays;

  /// No description provided for @warehouseFeniqShare.
  ///
  /// In en, this message translates to:
  /// **'Feniq\'s share'**
  String get warehouseFeniqShare;

  /// No description provided for @warehouseYouKeep.
  ///
  /// In en, this message translates to:
  /// **'You keep'**
  String get warehouseYouKeep;

  /// No description provided for @warehouseRepCommissionTitle.
  ///
  /// In en, this message translates to:
  /// **'Rep commission ({rate}%)'**
  String warehouseRepCommissionTitle(String rate);

  /// No description provided for @warehouseRepShare.
  ///
  /// In en, this message translates to:
  /// **'To the rep'**
  String get warehouseRepShare;

  /// No description provided for @warehouseRepSaving.
  ///
  /// In en, this message translates to:
  /// **'Your saving'**
  String get warehouseRepSaving;

  /// No description provided for @warehouseEditItems.
  ///
  /// In en, this message translates to:
  /// **'Edit items'**
  String get warehouseEditItems;

  /// No description provided for @warehouseSaveEdits.
  ///
  /// In en, this message translates to:
  /// **'Save changes'**
  String get warehouseSaveEdits;

  /// No description provided for @warehouseRemoveLine.
  ///
  /// In en, this message translates to:
  /// **'Remove'**
  String get warehouseRemoveLine;

  /// No description provided for @warehouseRestoreLine.
  ///
  /// In en, this message translates to:
  /// **'Restore'**
  String get warehouseRestoreLine;

  /// No description provided for @warehouseEditHint.
  ///
  /// In en, this message translates to:
  /// **'Adding a product or changing a package is done in the warehouse panel.'**
  String get warehouseEditHint;

  /// No description provided for @warehouseConfirmSaveTitle.
  ///
  /// In en, this message translates to:
  /// **'Save the changes?'**
  String get warehouseConfirmSaveTitle;

  /// No description provided for @warehouseConfirmSaveBody.
  ///
  /// In en, this message translates to:
  /// **'The order is repriced, and the pharmacy is notified of the change.'**
  String get warehouseConfirmSaveBody;

  /// No description provided for @warehouseCannotEmpty.
  ///
  /// In en, this message translates to:
  /// **'You can\'t remove every item. If the order can\'t go ahead, talk to the pharmacy.'**
  String get warehouseCannotEmpty;

  /// No description provided for @warehouseWaitingSeal.
  ///
  /// In en, this message translates to:
  /// **'Waiting for the pharmacy\'s seal photo before delivery.'**
  String get warehouseWaitingSeal;

  /// No description provided for @warehouseHasReturn.
  ///
  /// In en, this message translates to:
  /// **'Has a return'**
  String get warehouseHasReturn;

  /// No description provided for @warehouseCancelReason.
  ///
  /// In en, this message translates to:
  /// **'Cancel reason: {reason}'**
  String warehouseCancelReason(String reason);

  /// No description provided for @warehouseAccountPanelHint.
  ///
  /// In en, this message translates to:
  /// **'Products, offers, reps and reports are in the warehouse panel.'**
  String get warehouseAccountPanelHint;

  /// No description provided for @warehouseOrderAdvanced.
  ///
  /// In en, this message translates to:
  /// **'Order #{number} is now: {status}'**
  String warehouseOrderAdvanced(int number, String status);

  /// No description provided for @errorCannotRemoveLastItem.
  ///
  /// In en, this message translates to:
  /// **'You can\'t remove the order\'s last item.'**
  String get errorCannotRemoveLastItem;

  /// No description provided for @errorOrderAlreadyAdvanced.
  ///
  /// In en, this message translates to:
  /// **'The order already moved on. Refresh the page.'**
  String get errorOrderAlreadyAdvanced;

  /// No description provided for @errorOrderNotAdvanceable.
  ///
  /// In en, this message translates to:
  /// **'This order can\'t move to another stage.'**
  String get errorOrderNotAdvanceable;

  /// No description provided for @errorOrderNotEditable.
  ///
  /// In en, this message translates to:
  /// **'The order was sent, so its items can no longer be changed.'**
  String get errorOrderNotEditable;

  /// No description provided for @errorPackageItemsLocked.
  ///
  /// In en, this message translates to:
  /// **'A package\'s items are changed in the warehouse panel.'**
  String get errorPackageItemsLocked;

  /// No description provided for @warehouseNavReturns.
  ///
  /// In en, this message translates to:
  /// **'Returns'**
  String get warehouseNavReturns;

  /// No description provided for @warehouseNavAccounts.
  ///
  /// In en, this message translates to:
  /// **'Accounts'**
  String get warehouseNavAccounts;

  /// No description provided for @warehouseNavReps.
  ///
  /// In en, this message translates to:
  /// **'Reps'**
  String get warehouseNavReps;

  /// No description provided for @warehouseReturnTitle.
  ///
  /// In en, this message translates to:
  /// **'Return on order #{number}'**
  String warehouseReturnTitle(int number);

  /// No description provided for @warehouseReturnNoOrder.
  ///
  /// In en, this message translates to:
  /// **'Return'**
  String get warehouseReturnNoOrder;

  /// No description provided for @warehouseReturnUnits.
  ///
  /// In en, this message translates to:
  /// **'{count} units'**
  String warehouseReturnUnits(int count);

  /// No description provided for @warehouseNoReturnsTitle.
  ///
  /// In en, this message translates to:
  /// **'No returns here'**
  String get warehouseNoReturnsTitle;

  /// No description provided for @warehouseNoReturnsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Return requests from pharmacies show up here.'**
  String get warehouseNoReturnsSubtitle;

  /// No description provided for @warehouseReturnPhotos.
  ///
  /// In en, this message translates to:
  /// **'Photos'**
  String get warehouseReturnPhotos;

  /// No description provided for @warehouseReturnPharmacyNotes.
  ///
  /// In en, this message translates to:
  /// **'Pharmacy\'s notes'**
  String get warehouseReturnPharmacyNotes;

  /// No description provided for @warehouseReturnCreditPreview.
  ///
  /// In en, this message translates to:
  /// **'If you approve, the pharmacy is credited: {amount}'**
  String warehouseReturnCreditPreview(String amount);

  /// No description provided for @warehouseReturnCredited.
  ///
  /// In en, this message translates to:
  /// **'Credited to the pharmacy: {amount}'**
  String warehouseReturnCredited(String amount);

  /// No description provided for @warehouseReturnApprove.
  ///
  /// In en, this message translates to:
  /// **'Approve'**
  String get warehouseReturnApprove;

  /// No description provided for @warehouseReturnReject.
  ///
  /// In en, this message translates to:
  /// **'Reject'**
  String get warehouseReturnReject;

  /// No description provided for @warehouseReturnApproveTitle.
  ///
  /// In en, this message translates to:
  /// **'Approve this return?'**
  String get warehouseReturnApproveTitle;

  /// No description provided for @warehouseReturnApproveBody.
  ///
  /// In en, this message translates to:
  /// **'The amount is credited to the pharmacy\'s account, and can\'t be undone from the app.'**
  String get warehouseReturnApproveBody;

  /// No description provided for @warehouseReturnRejectTitle.
  ///
  /// In en, this message translates to:
  /// **'Reject the return'**
  String get warehouseReturnRejectTitle;

  /// No description provided for @warehouseReturnRejectHint.
  ///
  /// In en, this message translates to:
  /// **'Write why - the pharmacy sees it.'**
  String get warehouseReturnRejectHint;

  /// No description provided for @warehouseReturnResolved.
  ///
  /// In en, this message translates to:
  /// **'The return is now: {status}'**
  String warehouseReturnResolved(String status);

  /// No description provided for @warehouseNoAccountsTitle.
  ///
  /// In en, this message translates to:
  /// **'No accounts yet'**
  String get warehouseNoAccountsTitle;

  /// No description provided for @warehouseNoAccountsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'A pharmacy\'s account shows up here after its first delivered order.'**
  String get warehouseNoAccountsSubtitle;

  /// No description provided for @warehouseAccountsSearch.
  ///
  /// In en, this message translates to:
  /// **'Search by pharmacy name or phone'**
  String get warehouseAccountsSearch;

  /// No description provided for @warehouseAccountOwes.
  ///
  /// In en, this message translates to:
  /// **'Owes {amount}'**
  String warehouseAccountOwes(String amount);

  /// No description provided for @warehouseAccountInCredit.
  ///
  /// In en, this message translates to:
  /// **'In credit {amount}'**
  String warehouseAccountInCredit(String amount);

  /// No description provided for @warehouseAccountSettled.
  ///
  /// In en, this message translates to:
  /// **'Settled'**
  String get warehouseAccountSettled;

  /// No description provided for @warehouseRecordPayment.
  ///
  /// In en, this message translates to:
  /// **'Record a payment'**
  String get warehouseRecordPayment;

  /// No description provided for @warehouseRecordPaymentTitle.
  ///
  /// In en, this message translates to:
  /// **'Payment from the pharmacy'**
  String get warehouseRecordPaymentTitle;

  /// No description provided for @warehousePaymentAmount.
  ///
  /// In en, this message translates to:
  /// **'Amount ({currency})'**
  String warehousePaymentAmount(String currency);

  /// No description provided for @warehousePaymentMethod.
  ///
  /// In en, this message translates to:
  /// **'Method'**
  String get warehousePaymentMethod;

  /// No description provided for @warehousePaymentMethodCash.
  ///
  /// In en, this message translates to:
  /// **'Cash'**
  String get warehousePaymentMethodCash;

  /// No description provided for @warehousePaymentMethodBank.
  ///
  /// In en, this message translates to:
  /// **'Transfer'**
  String get warehousePaymentMethodBank;

  /// No description provided for @warehousePaymentMethodCheque.
  ///
  /// In en, this message translates to:
  /// **'Cheque'**
  String get warehousePaymentMethodCheque;

  /// No description provided for @warehousePaymentMethodOther.
  ///
  /// In en, this message translates to:
  /// **'Other'**
  String get warehousePaymentMethodOther;

  /// No description provided for @warehousePaymentNote.
  ///
  /// In en, this message translates to:
  /// **'Note (optional)'**
  String get warehousePaymentNote;

  /// No description provided for @warehousePaymentConfirm.
  ///
  /// In en, this message translates to:
  /// **'Record {amount} from {pharmacy}?'**
  String warehousePaymentConfirm(String amount, String pharmacy);

  /// No description provided for @warehousePaymentRecorded.
  ///
  /// In en, this message translates to:
  /// **'Payment recorded.'**
  String get warehousePaymentRecorded;

  /// No description provided for @warehousePaymentReverseHint.
  ///
  /// In en, this message translates to:
  /// **'To reverse a wrong payment, use the warehouse panel.'**
  String get warehousePaymentReverseHint;

  /// No description provided for @warehouseNoRepsTitle.
  ///
  /// In en, this message translates to:
  /// **'No reps yet'**
  String get warehouseNoRepsTitle;

  /// No description provided for @warehouseNoRepsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Add a rep - they sign in to the Feniq app with their number and password.'**
  String get warehouseNoRepsSubtitle;

  /// No description provided for @warehouseAddRep.
  ///
  /// In en, this message translates to:
  /// **'Add a rep'**
  String get warehouseAddRep;

  /// No description provided for @warehouseRepName.
  ///
  /// In en, this message translates to:
  /// **'Name'**
  String get warehouseRepName;

  /// No description provided for @warehouseRepPhone.
  ///
  /// In en, this message translates to:
  /// **'Mobile number'**
  String get warehouseRepPhone;

  /// No description provided for @warehouseRepPassword.
  ///
  /// In en, this message translates to:
  /// **'Password (8+ characters)'**
  String get warehouseRepPassword;

  /// No description provided for @warehouseRepRate.
  ///
  /// In en, this message translates to:
  /// **'Commission rate (%)'**
  String get warehouseRepRate;

  /// No description provided for @warehouseRepRateHint.
  ///
  /// In en, this message translates to:
  /// **'Half to the rep, a quarter to Feniq, the rest you save. Between 0 and 10.'**
  String get warehouseRepRateHint;

  /// No description provided for @warehouseRepInactive.
  ///
  /// In en, this message translates to:
  /// **'Switched off'**
  String get warehouseRepInactive;

  /// No description provided for @warehouseRepStats.
  ///
  /// In en, this message translates to:
  /// **'{pharmacies} pharmacies · {visits} visits in 30 days'**
  String warehouseRepStats(int pharmacies, int visits);

  /// No description provided for @warehouseRepMonth.
  ///
  /// In en, this message translates to:
  /// **'This month: {orders} orders · commission {amount}'**
  String warehouseRepMonth(int orders, String amount);

  /// No description provided for @warehouseRepEditRate.
  ///
  /// In en, this message translates to:
  /// **'Edit commission'**
  String get warehouseRepEditRate;

  /// No description provided for @warehouseRepEditRateHint.
  ///
  /// In en, this message translates to:
  /// **'Applies to new orders only.'**
  String get warehouseRepEditRateHint;

  /// No description provided for @warehouseRepDeactivate.
  ///
  /// In en, this message translates to:
  /// **'Switch the rep off'**
  String get warehouseRepDeactivate;

  /// No description provided for @warehouseRepActivate.
  ///
  /// In en, this message translates to:
  /// **'Switch the rep on'**
  String get warehouseRepActivate;

  /// No description provided for @warehouseRepResetPassword.
  ///
  /// In en, this message translates to:
  /// **'New password'**
  String get warehouseRepResetPassword;

  /// No description provided for @warehouseRepPasswordReset.
  ///
  /// In en, this message translates to:
  /// **'Password changed. Tell the rep.'**
  String get warehouseRepPasswordReset;

  /// No description provided for @warehouseRepSaved.
  ///
  /// In en, this message translates to:
  /// **'Saved.'**
  String get warehouseRepSaved;

  /// No description provided for @warehouseRepPharmacies.
  ///
  /// In en, this message translates to:
  /// **'Their pharmacies'**
  String get warehouseRepPharmacies;

  /// No description provided for @warehouseRepNoPharmacies.
  ///
  /// In en, this message translates to:
  /// **'No pharmacies yet. Pharmacies are assigned in the warehouse panel.'**
  String get warehouseRepNoPharmacies;

  /// No description provided for @warehouseRepVisits.
  ///
  /// In en, this message translates to:
  /// **'Their visits'**
  String get warehouseRepVisits;

  /// No description provided for @warehouseRepNoVisits.
  ///
  /// In en, this message translates to:
  /// **'No visits logged yet.'**
  String get warehouseRepNoVisits;

  /// No description provided for @warehouseRepLastVisit.
  ///
  /// In en, this message translates to:
  /// **'Last visit: {date}'**
  String warehouseRepLastVisit(String date);

  /// No description provided for @warehouseRepNeverVisited.
  ///
  /// In en, this message translates to:
  /// **'Never visited'**
  String get warehouseRepNeverVisited;

  /// No description provided for @warehouseFieldRequired.
  ///
  /// In en, this message translates to:
  /// **'This field is required'**
  String get warehouseFieldRequired;

  /// No description provided for @warehouseInvalidNumber.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid number'**
  String get warehouseInvalidNumber;

  /// No description provided for @errorInvalidCommissionRate.
  ///
  /// In en, this message translates to:
  /// **'The commission rate must be between 0 and 10.'**
  String get errorInvalidCommissionRate;

  /// No description provided for @errorInvalidPaymentAmount.
  ///
  /// In en, this message translates to:
  /// **'That amount isn\'t valid.'**
  String get errorInvalidPaymentAmount;

  /// No description provided for @errorInvalidPhoneFormat.
  ///
  /// In en, this message translates to:
  /// **'That mobile number isn\'t valid.'**
  String get errorInvalidPhoneFormat;

  /// No description provided for @errorInvalidRepName.
  ///
  /// In en, this message translates to:
  /// **'Enter the rep\'s name.'**
  String get errorInvalidRepName;

  /// No description provided for @errorNoTradingRelationship.
  ///
  /// In en, this message translates to:
  /// **'You have no dealings with this pharmacy yet.'**
  String get errorNoTradingRelationship;

  /// No description provided for @errorRepNotFound.
  ///
  /// In en, this message translates to:
  /// **'That rep wasn\'t found.'**
  String get errorRepNotFound;

  /// No description provided for @errorReturnAlreadyResolved.
  ///
  /// In en, this message translates to:
  /// **'This return was already resolved. Refresh the page.'**
  String get errorReturnAlreadyResolved;

  /// No description provided for @warehouseLoyaltyTitle.
  ///
  /// In en, this message translates to:
  /// **'Loyalty discount'**
  String get warehouseLoyaltyTitle;

  /// No description provided for @warehouseLoyaltyIntro.
  ///
  /// In en, this message translates to:
  /// **'A fixed amount off an order by its size. You set the tiers and you pay for it; Feniq takes its share of what is left.'**
  String get warehouseLoyaltyIntro;

  /// No description provided for @warehouseLoyaltyEnabled.
  ///
  /// In en, this message translates to:
  /// **'Turn the loyalty discount on'**
  String get warehouseLoyaltyEnabled;

  /// No description provided for @warehouseLoyaltyMin.
  ///
  /// In en, this message translates to:
  /// **'Order from'**
  String get warehouseLoyaltyMin;

  /// No description provided for @warehouseLoyaltyDiscount.
  ///
  /// In en, this message translates to:
  /// **'Discount'**
  String get warehouseLoyaltyDiscount;

  /// No description provided for @warehouseLoyaltyAddTier.
  ///
  /// In en, this message translates to:
  /// **'Add a tier'**
  String get warehouseLoyaltyAddTier;

  /// No description provided for @warehouseLoyaltySave.
  ///
  /// In en, this message translates to:
  /// **'Save the loyalty discount'**
  String get warehouseLoyaltySave;

  /// No description provided for @warehouseLoyaltySaved.
  ///
  /// In en, this message translates to:
  /// **'Loyalty discount saved.'**
  String get warehouseLoyaltySaved;

  /// No description provided for @warehouseLoyaltyExample.
  ///
  /// In en, this message translates to:
  /// **'Example: an order of 100,000 or more -> 2,000 off.'**
  String get warehouseLoyaltyExample;

  /// No description provided for @warehouseLoyaltyTierError.
  ///
  /// In en, this message translates to:
  /// **'Each tier needs an order value above zero and a smaller discount.'**
  String get warehouseLoyaltyTierError;

  /// No description provided for @warehouseLoyaltyOff.
  ///
  /// In en, this message translates to:
  /// **'Off'**
  String get warehouseLoyaltyOff;

  /// No description provided for @warehouseLoyaltyOnTiers.
  ///
  /// In en, this message translates to:
  /// **'On · {count} tiers'**
  String warehouseLoyaltyOnTiers(int count);

  /// No description provided for @warehouseLoyaltyLine.
  ///
  /// In en, this message translates to:
  /// **'Loyalty discount'**
  String get warehouseLoyaltyLine;

  /// No description provided for @warehouseCreditUsedLine.
  ///
  /// In en, this message translates to:
  /// **'From the pharmacy\'s credit'**
  String get warehouseCreditUsedLine;

  /// No description provided for @warehouseRepPharmacyShare.
  ///
  /// In en, this message translates to:
  /// **'Pharmacy credit'**
  String get warehouseRepPharmacyShare;

  /// No description provided for @warehouseRepWarehouseShare.
  ///
  /// In en, this message translates to:
  /// **'Your quarter'**
  String get warehouseRepWarehouseShare;

  /// No description provided for @warehouseRepWarehouseShareToRep.
  ///
  /// In en, this message translates to:
  /// **'Your quarter (to the rep)'**
  String get warehouseRepWarehouseShareToRep;

  /// No description provided for @warehouseRepShareToRep.
  ///
  /// In en, this message translates to:
  /// **'Give my quarter to the rep'**
  String get warehouseRepShareToRep;

  /// No description provided for @warehouseRepShareToRepOn.
  ///
  /// In en, this message translates to:
  /// **'Your quarter now goes to the rep on new orders.'**
  String get warehouseRepShareToRepOn;

  /// No description provided for @warehouseRepShareToRepOff.
  ///
  /// In en, this message translates to:
  /// **'Your quarter is yours again on new orders.'**
  String get warehouseRepShareToRepOff;

  /// No description provided for @warehouseRepShareGiven.
  ///
  /// In en, this message translates to:
  /// **'Your quarter to the rep'**
  String get warehouseRepShareGiven;

  /// No description provided for @warehouseRepQuartersHint.
  ///
  /// In en, this message translates to:
  /// **'A quarter to Feniq, a quarter as pharmacy credit, a quarter to the rep, and the last quarter yours or the rep\'s. Between 0 and 10.'**
  String get warehouseRepQuartersHint;

  /// No description provided for @errorInvalidLoyaltyTiers.
  ///
  /// In en, this message translates to:
  /// **'Each tier needs an order value above zero and a smaller discount, with no two on the same value.'**
  String get errorInvalidLoyaltyTiers;

  /// No description provided for @errorLoyaltyTiersRequired.
  ///
  /// In en, this message translates to:
  /// **'Add at least one tier before turning the loyalty discount on.'**
  String get errorLoyaltyTiersRequired;

  /// No description provided for @stageAccepted.
  ///
  /// In en, this message translates to:
  /// **'Accepted'**
  String get stageAccepted;

  /// No description provided for @stageAcceptedDesc.
  ///
  /// In en, this message translates to:
  /// **'The warehouse accepted your order'**
  String get stageAcceptedDesc;

  /// No description provided for @warehouseAccept.
  ///
  /// In en, this message translates to:
  /// **'Accept'**
  String get warehouseAccept;

  /// No description provided for @warehouseSendOnWay.
  ///
  /// In en, this message translates to:
  /// **'Send on its way'**
  String get warehouseSendOnWay;

  /// No description provided for @warehouseCollectTitle.
  ///
  /// In en, this message translates to:
  /// **'Delivering order #{number} - did you collect?'**
  String warehouseCollectTitle(int number);

  /// No description provided for @warehouseCollectTotal.
  ///
  /// In en, this message translates to:
  /// **'Amount: {amount}'**
  String warehouseCollectTotal(String amount);

  /// No description provided for @warehouseCollectFull.
  ///
  /// In en, this message translates to:
  /// **'All of it'**
  String get warehouseCollectFull;

  /// No description provided for @warehouseCollectPartial.
  ///
  /// In en, this message translates to:
  /// **'Part'**
  String get warehouseCollectPartial;

  /// No description provided for @warehouseCollectLater.
  ///
  /// In en, this message translates to:
  /// **'Later'**
  String get warehouseCollectLater;

  /// No description provided for @warehouseCollectPaidLabel.
  ///
  /// In en, this message translates to:
  /// **'Paid now ({currency})'**
  String warehouseCollectPaidLabel(String currency);

  /// No description provided for @warehouseCollectLeft.
  ///
  /// In en, this message translates to:
  /// **'Left: {amount}'**
  String warehouseCollectLeft(String amount);

  /// No description provided for @warehouseCollectSave.
  ///
  /// In en, this message translates to:
  /// **'Deliver and save'**
  String get warehouseCollectSave;

  /// No description provided for @warehouseCollectPartialInvalid.
  ///
  /// In en, this message translates to:
  /// **'Enter an amount above zero and below the total.'**
  String get warehouseCollectPartialInvalid;

  /// No description provided for @warehouseCollectRecorded.
  ///
  /// In en, this message translates to:
  /// **'Delivered, and {amount} recorded as paid'**
  String warehouseCollectRecorded(String amount);

  /// No description provided for @warehouseCollectFailed.
  ///
  /// In en, this message translates to:
  /// **'Delivery succeeded, but collection is unconfirmed. Retry the payment from the warehouse alert.'**
  String get warehouseCollectFailed;

  /// No description provided for @warehouseCollectNote.
  ///
  /// In en, this message translates to:
  /// **'Paid on delivery of order #{number}'**
  String warehouseCollectNote(int number);

  /// No description provided for @warehouseAccountPurchases.
  ///
  /// In en, this message translates to:
  /// **'Bought {amount}'**
  String warehouseAccountPurchases(String amount);

  /// No description provided for @warehouseAccountPaid.
  ///
  /// In en, this message translates to:
  /// **'Paid {amount}'**
  String warehouseAccountPaid(String amount);

  /// No description provided for @warehouseAccountLastPayment.
  ///
  /// In en, this message translates to:
  /// **'Last payment {date}'**
  String warehouseAccountLastPayment(String date);

  /// No description provided for @warehouseAccountNoPayment.
  ///
  /// In en, this message translates to:
  /// **'No payments yet'**
  String get warehouseAccountNoPayment;

  /// No description provided for @warehouseAccountPayFull.
  ///
  /// In en, this message translates to:
  /// **'Pay in full'**
  String get warehouseAccountPayFull;

  /// No description provided for @warehouseAccountPayPartial.
  ///
  /// In en, this message translates to:
  /// **'Part payment'**
  String get warehouseAccountPayPartial;

  /// No description provided for @warehouseAccountPayFullConfirm.
  ///
  /// In en, this message translates to:
  /// **'Record a cash payment of {amount}?'**
  String warehouseAccountPayFullConfirm(String amount);

  /// No description provided for @warehouseAccountPayOwes.
  ///
  /// In en, this message translates to:
  /// **'Owes: {amount}'**
  String warehouseAccountPayOwes(String amount);

  /// No description provided for @warehouseAccountPaySave.
  ///
  /// In en, this message translates to:
  /// **'Record payment'**
  String get warehouseAccountPaySave;

  /// No description provided for @warehouseAccountPayInvalid.
  ///
  /// In en, this message translates to:
  /// **'Enter an amount above zero and below the amount owed.'**
  String get warehouseAccountPayInvalid;

  /// No description provided for @warehouseAccountPayRecorded.
  ///
  /// In en, this message translates to:
  /// **'Recorded a payment of {amount}'**
  String warehouseAccountPayRecorded(String amount);

  /// No description provided for @warehouseAccountPayFailed.
  ///
  /// In en, this message translates to:
  /// **'Payment is unconfirmed. Retry to confirm the same payment safely.'**
  String get warehouseAccountPayFailed;

  /// No description provided for @warehouseVoiceTitle.
  ///
  /// In en, this message translates to:
  /// **'Record a payment by voice'**
  String get warehouseVoiceTitle;

  /// No description provided for @warehouseVoiceHint.
  ///
  /// In en, this message translates to:
  /// **'Say, in Arabic, for example: Al-Noor pharmacy paid fifty thousand, or Al-Amal paid the full amount.'**
  String get warehouseVoiceHint;

  /// No description provided for @warehouseVoiceSpeak.
  ///
  /// In en, this message translates to:
  /// **'Tap and speak'**
  String get warehouseVoiceSpeak;

  /// No description provided for @warehouseVoiceStop.
  ///
  /// In en, this message translates to:
  /// **'Stop'**
  String get warehouseVoiceStop;

  /// No description provided for @warehouseVoiceHeard.
  ///
  /// In en, this message translates to:
  /// **'What was heard (you can edit it)'**
  String get warehouseVoiceHeard;

  /// No description provided for @warehouseVoiceNoMic.
  ///
  /// In en, this message translates to:
  /// **'Voice isn\'t available on this phone. Type the sentence in the box.'**
  String get warehouseVoiceNoMic;

  /// No description provided for @warehouseVoiceNotUnderstood.
  ///
  /// In en, this message translates to:
  /// **'I did not understand. Try: pharmacy name + paid + the amount.'**
  String get warehouseVoiceNotUnderstood;

  /// No description provided for @warehouseVoiceNoPharmacy.
  ///
  /// In en, this message translates to:
  /// **'No pharmacy found for that name. Edit the name.'**
  String get warehouseVoiceNoPharmacy;

  /// No description provided for @warehouseVoiceOwes.
  ///
  /// In en, this message translates to:
  /// **'owes {amount}'**
  String warehouseVoiceOwes(String amount);

  /// No description provided for @warehouseVoiceWillRecord.
  ///
  /// In en, this message translates to:
  /// **'A payment of {amount} will be recorded'**
  String warehouseVoiceWillRecord(String amount);

  /// No description provided for @warehouseVoiceLeftAfter.
  ///
  /// In en, this message translates to:
  /// **'It will still owe {amount}'**
  String warehouseVoiceLeftAfter(String amount);

  /// No description provided for @warehouseVoiceCannotRecord.
  ///
  /// In en, this message translates to:
  /// **'That amount does not fit this pharmacy\'s account (zero, or more than it owes).'**
  String get warehouseVoiceCannotRecord;

  /// No description provided for @warehouseVoiceConfirm.
  ///
  /// In en, this message translates to:
  /// **'OK, record it'**
  String get warehouseVoiceConfirm;

  /// No description provided for @warehouseSummaryTitle.
  ///
  /// In en, this message translates to:
  /// **'Warehouse summary'**
  String get warehouseSummaryTitle;

  /// No description provided for @warehouseSummaryToday.
  ///
  /// In en, this message translates to:
  /// **'Today'**
  String get warehouseSummaryToday;

  /// No description provided for @warehouseSummaryWeek.
  ///
  /// In en, this message translates to:
  /// **'Last 7 days'**
  String get warehouseSummaryWeek;

  /// No description provided for @warehouseSummaryMonth.
  ///
  /// In en, this message translates to:
  /// **'This month'**
  String get warehouseSummaryMonth;

  /// No description provided for @warehouseSummarySales.
  ///
  /// In en, this message translates to:
  /// **'Sales'**
  String get warehouseSummarySales;

  /// No description provided for @warehouseSummaryCollections.
  ///
  /// In en, this message translates to:
  /// **'Collected'**
  String get warehouseSummaryCollections;

  /// No description provided for @warehouseSummaryReturns.
  ///
  /// In en, this message translates to:
  /// **'Returns'**
  String get warehouseSummaryReturns;

  /// No description provided for @warehouseSummaryTotalDebts.
  ///
  /// In en, this message translates to:
  /// **'Total debts'**
  String get warehouseSummaryTotalDebts;

  /// No description provided for @warehouseSummaryInvoices.
  ///
  /// In en, this message translates to:
  /// **'{count} invoices'**
  String warehouseSummaryInvoices(int count);

  /// No description provided for @warehouseSummaryPayments.
  ///
  /// In en, this message translates to:
  /// **'{count} payments'**
  String warehouseSummaryPayments(int count);

  /// No description provided for @warehouseSummaryDebtors.
  ///
  /// In en, this message translates to:
  /// **'{count} pharmacies owe you'**
  String warehouseSummaryDebtors(int count);

  /// No description provided for @warehouseSummaryCreditHeld.
  ///
  /// In en, this message translates to:
  /// **'Credit held for pharmacies: {amount}'**
  String warehouseSummaryCreditHeld(String amount);

  /// No description provided for @warehouseSummaryChangeUp.
  ///
  /// In en, this message translates to:
  /// **'Up {percent}% vs previous period'**
  String warehouseSummaryChangeUp(int percent);

  /// No description provided for @warehouseSummaryChangeDown.
  ///
  /// In en, this message translates to:
  /// **'Down {percent}% vs previous period'**
  String warehouseSummaryChangeDown(int percent);

  /// No description provided for @warehouseSummaryChangeFlat.
  ///
  /// In en, this message translates to:
  /// **'Same as the previous period'**
  String get warehouseSummaryChangeFlat;

  /// No description provided for @warehouseSummaryChangeNew.
  ///
  /// In en, this message translates to:
  /// **'Nothing in the previous period'**
  String get warehouseSummaryChangeNew;

  /// No description provided for @warehouseSummaryTopBuyers.
  ///
  /// In en, this message translates to:
  /// **'Top buyers'**
  String get warehouseSummaryTopBuyers;

  /// No description provided for @warehouseSummaryTopDebtors.
  ///
  /// In en, this message translates to:
  /// **'Biggest debts'**
  String get warehouseSummaryTopDebtors;

  /// No description provided for @warehouseSummaryNoBuyers.
  ///
  /// In en, this message translates to:
  /// **'No sales in this period.'**
  String get warehouseSummaryNoBuyers;

  /// No description provided for @warehouseSummaryNoDebtors.
  ///
  /// In en, this message translates to:
  /// **'No outstanding debts.'**
  String get warehouseSummaryNoDebtors;

  /// No description provided for @warehouseSummaryDeliveredNote.
  ///
  /// In en, this message translates to:
  /// **'Sales count delivered orders only.'**
  String get warehouseSummaryDeliveredNote;

  /// No description provided for @paymentUnconfirmed.
  ///
  /// In en, this message translates to:
  /// **'Payment is unconfirmed. Retry to confirm the same payment safely.'**
  String get paymentUnconfirmed;

  /// No description provided for @dataLastUpdated.
  ///
  /// In en, this message translates to:
  /// **'Last updated: {time}'**
  String dataLastUpdated(String time);

  /// No description provided for @dataCached.
  ///
  /// In en, this message translates to:
  /// **'Showing the last successfully loaded data.'**
  String get dataCached;

  /// No description provided for @updateDownloading.
  ///
  /// In en, this message translates to:
  /// **'Downloading update'**
  String get updateDownloading;

  /// No description provided for @updateInstallPermission.
  ///
  /// In en, this message translates to:
  /// **'Allow Feniq to install apps in Android settings, then return and tap Update now. The downloaded file will be reused.'**
  String get updateInstallPermission;

  /// No description provided for @updateCancelDownload.
  ///
  /// In en, this message translates to:
  /// **'Cancel download'**
  String get updateCancelDownload;

  /// No description provided for @offlineCatalogsReady.
  ///
  /// In en, this message translates to:
  /// **'Saved for offline browsing: {ready}/{total}'**
  String offlineCatalogsReady(String ready, String total);

  /// No description provided for @offlineCatalogsSaving.
  ///
  /// In en, this message translates to:
  /// **'Saving catalogs on this device…'**
  String get offlineCatalogsSaving;

  /// No description provided for @offlineCatalogsRetry.
  ///
  /// In en, this message translates to:
  /// **'Saving is incomplete. Connect to the internet and ensure enough storage; the previous copy is kept.'**
  String get offlineCatalogsRetry;

  /// No description provided for @offlineCatalogsLastSync.
  ///
  /// In en, this message translates to:
  /// **'Last sync: {time}'**
  String offlineCatalogsLastSync(String time);

  /// No description provided for @locationPermissionPurpose.
  ///
  /// In en, this message translates to:
  /// **'Location helps identify pharmacy premises and verify a visit when its code is scanned. Browsing remains available without permission; we do not track your movements in the background.'**
  String get locationPermissionPurpose;

  /// No description provided for @locationPermissionPermanent.
  ///
  /// In en, this message translates to:
  /// **'Location permission is blocked. In app settings, allow location while using the app to verify visits.'**
  String get locationPermissionPermanent;

  /// No description provided for @locationServiceDisabled.
  ///
  /// In en, this message translates to:
  /// **'Location services are off. Enable GPS before recording a visit.'**
  String get locationServiceDisabled;

  /// No description provided for @locationOpenSettings.
  ///
  /// In en, this message translates to:
  /// **'Open settings'**
  String get locationOpenSettings;

  /// No description provided for @locationAllow.
  ///
  /// In en, this message translates to:
  /// **'Allow location'**
  String get locationAllow;

  /// No description provided for @repVisitLocationUnapproved.
  ///
  /// In en, this message translates to:
  /// **'Pharmacy location awaiting approval'**
  String get repVisitLocationUnapproved;

  /// No description provided for @repVisitPoorAccuracy.
  ///
  /// In en, this message translates to:
  /// **'Location accuracy insufficient'**
  String get repVisitPoorAccuracy;

  /// No description provided for @repVisitStaleLocation.
  ///
  /// In en, this message translates to:
  /// **'Location reading expired'**
  String get repVisitStaleLocation;

  /// No description provided for @repScanLocationUnapprovedMessage.
  ///
  /// In en, this message translates to:
  /// **'This pharmacy location is not approved yet. Contact Feniq to confirm its premises; this attempt is not a verified visit.'**
  String get repScanLocationUnapprovedMessage;

  /// No description provided for @repScanPoorAccuracyMessage.
  ///
  /// In en, this message translates to:
  /// **'GPS accuracy is insufficient. Move near the pharmacy entrance or an open area, then scan again.'**
  String get repScanPoorAccuracyMessage;

  /// No description provided for @repScanStaleLocationMessage.
  ///
  /// In en, this message translates to:
  /// **'The location reading expired. Enable automatic time and location on the phone, then scan again for a fresh reading.'**
  String get repScanStaleLocationMessage;

  /// No description provided for @warehouseLoyaltyMode.
  ///
  /// In en, this message translates to:
  /// **'Loyalty method'**
  String get warehouseLoyaltyMode;

  /// No description provided for @warehouseLoyaltyPerOrder.
  ///
  /// In en, this message translates to:
  /// **'Per-order value'**
  String get warehouseLoyaltyPerOrder;

  /// No description provided for @warehouseLoyaltyMonthly.
  ///
  /// In en, this message translates to:
  /// **'Monthly purchase total'**
  String get warehouseLoyaltyMonthly;

  /// No description provided for @warehouseMonthlyLoyaltyHelp.
  ///
  /// In en, this message translates to:
  /// **'Delivered invoices count at their net amount after discounts and credit, within a Damascus calendar month. Only the incremental reward is credited for the next order. Returns reduce entitlement; a spent reward offsets future loyalty, without taking commission credit or creating cash debt. Monthly tiers freeze at the first delivery.'**
  String get warehouseMonthlyLoyaltyHelp;

  /// No description provided for @pharmacyMonthlyLoyaltyProgress.
  ///
  /// In en, this message translates to:
  /// **'Delivered purchases this month: {amount}. Incremental loyalty is credited after delivery for your next order; returns reduce entitlement.'**
  String pharmacyMonthlyLoyaltyProgress(String amount);

  /// No description provided for @warehouseMonthlyLoyaltyExample.
  ///
  /// In en, this message translates to:
  /// **'Example: 100,000 delivered net purchases → 1,000 credit; at 200,000 → 5,000 total, so only 4,000 more.'**
  String get warehouseMonthlyLoyaltyExample;

  /// No description provided for @warehouseMonthlyLoyaltyMin.
  ///
  /// In en, this message translates to:
  /// **'Monthly total from'**
  String get warehouseMonthlyLoyaltyMin;

  /// No description provided for @warehouseMonthlyLoyaltyReward.
  ///
  /// In en, this message translates to:
  /// **'Total reward credit'**
  String get warehouseMonthlyLoyaltyReward;

  /// No description provided for @pharmacyMonthlyLoyaltyOffset.
  ///
  /// In en, this message translates to:
  /// **'Previously spent reward on returned goods: {amount}. This offsets future loyalty; it is not a cash debt.'**
  String pharmacyMonthlyLoyaltyOffset(String amount);

  /// No description provided for @errorLoyaltyChanged.
  ///
  /// In en, this message translates to:
  /// **'Loyalty settings changed. Go back and reopen settings before saving.'**
  String get errorLoyaltyChanged;

  /// No description provided for @warehouseInsightsTitle.
  ///
  /// In en, this message translates to:
  /// **'Warehouse performance and follow-up'**
  String get warehouseInsightsTitle;

  /// No description provided for @warehouseInsightsScope.
  ///
  /// In en, this message translates to:
  /// **'These figures cover Feniq transactions only. Net sales after returns are not profit; inventory costs and expenses are excluded.'**
  String get warehouseInsightsScope;

  /// No description provided for @warehouseInsightsNetSales.
  ///
  /// In en, this message translates to:
  /// **'Net sales'**
  String get warehouseInsightsNetSales;

  /// No description provided for @warehouseInsightsCollections.
  ///
  /// In en, this message translates to:
  /// **'Collections'**
  String get warehouseInsightsCollections;

  /// No description provided for @warehouseInsightsReturns.
  ///
  /// In en, this message translates to:
  /// **'Returns'**
  String get warehouseInsightsReturns;

  /// No description provided for @warehouseInsightsDebts.
  ///
  /// In en, this message translates to:
  /// **'Current receivables'**
  String get warehouseInsightsDebts;

  /// No description provided for @warehouseInsightsTrend.
  ///
  /// In en, this message translates to:
  /// **'Sales and collections over time'**
  String get warehouseInsightsTrend;

  /// No description provided for @warehouseInsightsInspectDay.
  ///
  /// In en, this message translates to:
  /// **'Select a day to inspect'**
  String get warehouseInsightsInspectDay;

  /// No description provided for @warehouseInsightsPeriod.
  ///
  /// In en, this message translates to:
  /// **'Period'**
  String get warehouseInsightsPeriod;

  /// No description provided for @warehouseInsightsRefresh.
  ///
  /// In en, this message translates to:
  /// **'Refresh'**
  String get warehouseInsightsRefresh;

  /// No description provided for @warehouseInsightsAsOf.
  ///
  /// In en, this message translates to:
  /// **'Updated:'**
  String get warehouseInsightsAsOf;

  /// No description provided for @warehouseInsightsDamascus.
  ///
  /// In en, this message translates to:
  /// **'Damascus time'**
  String get warehouseInsightsDamascus;

  /// No description provided for @warehouseInsightsAging.
  ///
  /// In en, this message translates to:
  /// **'Receivable age — days'**
  String get warehouseInsightsAging;

  /// No description provided for @warehouseInsightsAgingMethod.
  ///
  /// In en, this message translates to:
  /// **'Oldest debits are settled first. Returns reduce their original invoice; reversing a payment restores its original debt age. This is a monitoring allocation; payments are not invoice-specific.'**
  String get warehouseInsightsAgingMethod;

  /// No description provided for @warehouseInsightsDailyTable.
  ///
  /// In en, this message translates to:
  /// **'Daily detail table'**
  String get warehouseInsightsDailyTable;

  /// No description provided for @warehouseInsightsDate.
  ///
  /// In en, this message translates to:
  /// **'Date'**
  String get warehouseInsightsDate;

  /// No description provided for @warehouseInsightsPharmacy.
  ///
  /// In en, this message translates to:
  /// **'Pharmacy'**
  String get warehouseInsightsPharmacy;

  /// No description provided for @warehouseInsightsPhone.
  ///
  /// In en, this message translates to:
  /// **'Phone'**
  String get warehouseInsightsPhone;

  /// No description provided for @warehouseInsightsCity.
  ///
  /// In en, this message translates to:
  /// **'City'**
  String get warehouseInsightsCity;

  /// No description provided for @warehouseInsightsDays.
  ///
  /// In en, this message translates to:
  /// **'Days'**
  String get warehouseInsightsDays;

  /// No description provided for @warehouseInsightsAction.
  ///
  /// In en, this message translates to:
  /// **'Action'**
  String get warehouseInsightsAction;

  /// No description provided for @warehouseInsightsOpenStatement.
  ///
  /// In en, this message translates to:
  /// **'Open statement'**
  String get warehouseInsightsOpenStatement;

  /// No description provided for @warehouseInsightsOpenStatements.
  ///
  /// In en, this message translates to:
  /// **'Account statements'**
  String get warehouseInsightsOpenStatements;

  /// No description provided for @warehouseInsightsSettings.
  ///
  /// In en, this message translates to:
  /// **'Debt and inactivity thresholds'**
  String get warehouseInsightsSettings;

  /// No description provided for @warehouseInsightsOverdueDays.
  ///
  /// In en, this message translates to:
  /// **'Receivables overdue after — days'**
  String get warehouseInsightsOverdueDays;

  /// No description provided for @warehouseInsightsInactiveDays.
  ///
  /// In en, this message translates to:
  /// **'No pharmacy orders for — days'**
  String get warehouseInsightsInactiveDays;

  /// No description provided for @warehouseInsightsSaveSettings.
  ///
  /// In en, this message translates to:
  /// **'Save thresholds'**
  String get warehouseInsightsSaveSettings;

  /// No description provided for @warehouseInsightsEmpty.
  ///
  /// In en, this message translates to:
  /// **'No follow-up cases match this threshold.'**
  String get warehouseInsightsEmpty;

  /// No description provided for @warehouseInsightsLoadMore.
  ///
  /// In en, this message translates to:
  /// **'Load more'**
  String get warehouseInsightsLoadMore;

  /// No description provided for @warehouseInsightsInactiveFeature.
  ///
  /// In en, this message translates to:
  /// **'These features are not active for this warehouse. Contact Feniq to activate them.'**
  String get warehouseInsightsInactiveFeature;

  /// No description provided for @warehouseInsightsNoAlerts.
  ///
  /// In en, this message translates to:
  /// **'No follow-up alerts right now.'**
  String get warehouseInsightsNoAlerts;

  /// No description provided for @warehouseInsightsOverview.
  ///
  /// In en, this message translates to:
  /// **'Overview'**
  String get warehouseInsightsOverview;

  /// No description provided for @warehouseInsightsOverdue.
  ///
  /// In en, this message translates to:
  /// **'Overdue'**
  String get warehouseInsightsOverdue;

  /// No description provided for @warehouseInsightsInactive.
  ///
  /// In en, this message translates to:
  /// **'Inactive pharmacies'**
  String get warehouseInsightsInactive;

  /// No description provided for @warehouseInsightsAlerts.
  ///
  /// In en, this message translates to:
  /// **'Follow-up alerts'**
  String get warehouseInsightsAlerts;

  /// No description provided for @warehouseInsightsInvalidDays.
  ///
  /// In en, this message translates to:
  /// **'Choose 1–180 days.'**
  String get warehouseInsightsInvalidDays;

  /// No description provided for @warehouseInsightsSaved.
  ///
  /// In en, this message translates to:
  /// **'Follow-up thresholds saved.'**
  String get warehouseInsightsSaved;

  /// No description provided for @warehouseInsightsResults.
  ///
  /// In en, this message translates to:
  /// **'Results: {count}'**
  String warehouseInsightsResults(String count);

  /// No description provided for @warehouseInsightsNoPreviousOrder.
  ///
  /// In en, this message translates to:
  /// **'No previous orders; days count from assignment.'**
  String get warehouseInsightsNoPreviousOrder;

  /// No description provided for @errorFeatureUnavailable.
  ///
  /// In en, this message translates to:
  /// **'These features are not active for this warehouse. Contact Feniq to activate them.'**
  String get errorFeatureUnavailable;

  /// No description provided for @errorFollowUpChanged.
  ///
  /// In en, this message translates to:
  /// **'Follow-up thresholds changed. Refresh before saving.'**
  String get errorFollowUpChanged;

  /// No description provided for @warehouseInsightsAlertOrders.
  ///
  /// In en, this message translates to:
  /// **'Orders pending for 48 hours: {count}'**
  String warehouseInsightsAlertOrders(String count);

  /// No description provided for @warehouseInsightsAlertReturns.
  ///
  /// In en, this message translates to:
  /// **'Returns awaiting a decision for 48 hours: {count}'**
  String warehouseInsightsAlertReturns(String count);

  /// No description provided for @warehouseInsightsAlertOverdue.
  ///
  /// In en, this message translates to:
  /// **'Pharmacies with overdue balances: {count}'**
  String warehouseInsightsAlertOverdue(String count);

  /// No description provided for @warehouseInsightsAlertInactive.
  ///
  /// In en, this message translates to:
  /// **'Pharmacies needing order follow-up: {count}'**
  String warehouseInsightsAlertInactive(String count);

  /// No description provided for @warehouseInsightsScopeShort.
  ///
  /// In en, this message translates to:
  /// **'Feniq transactions only; net sales are not profit.'**
  String get warehouseInsightsScopeShort;

  /// No description provided for @warehouseInsightsAbout.
  ///
  /// In en, this message translates to:
  /// **'About these figures'**
  String get warehouseInsightsAbout;

  /// No description provided for @warehouseInsightsOverdueAmount.
  ///
  /// In en, this message translates to:
  /// **'Overdue amount'**
  String get warehouseInsightsOverdueAmount;

  /// No description provided for @deliveryTitle.
  ///
  /// In en, this message translates to:
  /// **'Delivery regions and schedules'**
  String get deliveryTitle;

  /// No description provided for @deliveryExplanation.
  ///
  /// In en, this message translates to:
  /// **'Enable estimates after setting regions and assigning pharmacies. Damascus time, ±12 hours, frozen when submitted; not a guaranteed arrival time.'**
  String get deliveryExplanation;

  /// No description provided for @deliveryEnable.
  ///
  /// In en, this message translates to:
  /// **'Show delivery estimate to pharmacies'**
  String get deliveryEnable;

  /// No description provided for @deliveryFeatureOff.
  ///
  /// In en, this message translates to:
  /// **'This feature is not active for this warehouse. Earlier promises are preserved.'**
  String get deliveryFeatureOff;

  /// No description provided for @deliveryZoneName.
  ///
  /// In en, this message translates to:
  /// **'Delivery region name'**
  String get deliveryZoneName;

  /// No description provided for @deliveryPreparation.
  ///
  /// In en, this message translates to:
  /// **'Preparation hours'**
  String get deliveryPreparation;

  /// No description provided for @deliveryZoneActive.
  ///
  /// In en, this message translates to:
  /// **'Region active'**
  String get deliveryZoneActive;

  /// No description provided for @deliveryDay.
  ///
  /// In en, this message translates to:
  /// **'Dispatch weekday'**
  String get deliveryDay;

  /// No description provided for @deliveryDepartureTime.
  ///
  /// In en, this message translates to:
  /// **'Departure — Damascus'**
  String get deliveryDepartureTime;

  /// No description provided for @deliveryArrivalHours.
  ///
  /// In en, this message translates to:
  /// **'Arrival hours after departure'**
  String get deliveryArrivalHours;

  /// No description provided for @deliveryCutoffHours.
  ///
  /// In en, this message translates to:
  /// **'Order cutoff hours before departure'**
  String get deliveryCutoffHours;

  /// No description provided for @deliveryAddTrip.
  ///
  /// In en, this message translates to:
  /// **'Add dispatch day'**
  String get deliveryAddTrip;

  /// No description provided for @deliveryRemoveTrip.
  ///
  /// In en, this message translates to:
  /// **'Remove dispatch day'**
  String get deliveryRemoveTrip;

  /// No description provided for @deliveryExceptions.
  ///
  /// In en, this message translates to:
  /// **'Date exceptions'**
  String get deliveryExceptions;

  /// No description provided for @deliveryDate.
  ///
  /// In en, this message translates to:
  /// **'Date — YYYY-MM-DD'**
  String get deliveryDate;

  /// No description provided for @deliveryCancelTrip.
  ///
  /// In en, this message translates to:
  /// **'Cancel this date\'s trip'**
  String get deliveryCancelTrip;

  /// No description provided for @deliveryRemoveException.
  ///
  /// In en, this message translates to:
  /// **'Remove exception'**
  String get deliveryRemoveException;

  /// No description provided for @deliveryAddException.
  ///
  /// In en, this message translates to:
  /// **'Add date exception'**
  String get deliveryAddException;

  /// No description provided for @deliveryPauseZone.
  ///
  /// In en, this message translates to:
  /// **'Pause region'**
  String get deliveryPauseZone;

  /// No description provided for @deliveryAddZone.
  ///
  /// In en, this message translates to:
  /// **'Add region'**
  String get deliveryAddZone;

  /// No description provided for @deliverySave.
  ///
  /// In en, this message translates to:
  /// **'Save schedule'**
  String get deliverySave;

  /// No description provided for @deliverySaved.
  ///
  /// In en, this message translates to:
  /// **'Saved'**
  String get deliverySaved;

  /// No description provided for @deliveryReload.
  ///
  /// In en, this message translates to:
  /// **'Reload settings'**
  String get deliveryReload;

  /// No description provided for @deliveryAssignTitle.
  ///
  /// In en, this message translates to:
  /// **'Assign pharmacies to delivery regions'**
  String get deliveryAssignTitle;

  /// No description provided for @deliveryAssignHint.
  ///
  /// In en, this message translates to:
  /// **'Save the schedule first, then find the pharmacy and choose its region. This assignment does not hide warehouses in the catalog.'**
  String get deliveryAssignHint;

  /// No description provided for @deliverySearch.
  ///
  /// In en, this message translates to:
  /// **'Pharmacy name or phone'**
  String get deliverySearch;

  /// No description provided for @deliverySearchButton.
  ///
  /// In en, this message translates to:
  /// **'Search'**
  String get deliverySearchButton;

  /// No description provided for @deliveryUnassigned.
  ///
  /// In en, this message translates to:
  /// **'No region — arrival unspecified'**
  String get deliveryUnassigned;

  /// No description provided for @deliveryPaused.
  ///
  /// In en, this message translates to:
  /// **'Paused'**
  String get deliveryPaused;

  /// No description provided for @deliveryArrivalTitle.
  ///
  /// In en, this message translates to:
  /// **'Estimated delivery'**
  String get deliveryArrivalTitle;

  /// No description provided for @deliveryUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Delivery time is not currently specified for this pharmacy.'**
  String get deliveryUnavailable;

  /// No description provided for @deliveryPreview.
  ///
  /// In en, this message translates to:
  /// **'Preview; the estimate is fixed when you submit the order.'**
  String get deliveryPreview;

  /// No description provided for @deliveryRange.
  ///
  /// In en, this message translates to:
  /// **'Expected between'**
  String get deliveryRange;

  /// No description provided for @deliveryLate.
  ///
  /// In en, this message translates to:
  /// **'Past the arrival window. Contact the warehouse; the timer ending does not mean delivered.'**
  String get deliveryLate;

  /// No description provided for @deliveryDelivered.
  ///
  /// In en, this message translates to:
  /// **'Delivered'**
  String get deliveryDelivered;

  /// No description provided for @deliveryCancelled.
  ///
  /// In en, this message translates to:
  /// **'Order cancelled — arrival estimate ended'**
  String get deliveryCancelled;

  /// No description provided for @deliveryUntil.
  ///
  /// In en, this message translates to:
  /// **'Time until the end of the window'**
  String get deliveryUntil;

  /// No description provided for @deliveryReschedule.
  ///
  /// In en, this message translates to:
  /// **'Change this order\'s estimate'**
  String get deliveryReschedule;

  /// No description provided for @deliveryNewTime.
  ///
  /// In en, this message translates to:
  /// **'New arrival — Damascus time'**
  String get deliveryNewTime;

  /// No description provided for @deliveryReason.
  ///
  /// In en, this message translates to:
  /// **'Reason for change — visible to the pharmacy'**
  String get deliveryReason;

  /// No description provided for @deliveryChanged.
  ///
  /// In en, this message translates to:
  /// **'Estimate changed'**
  String get deliveryChanged;

  /// No description provided for @deliveryInvalid.
  ///
  /// In en, this message translates to:
  /// **'Check region names, days and times. Hours 0–168, arrival up to 72. Do not repeat a weekday within a region.'**
  String get deliveryInvalid;

  /// No description provided for @deliveryUnsaved.
  ///
  /// In en, this message translates to:
  /// **'You have unsaved changes. Save or reload before assigning pharmacies.'**
  String get deliveryUnsaved;

  /// No description provided for @deliveryNoResults.
  ///
  /// In en, this message translates to:
  /// **'No matching pharmacies'**
  String get deliveryNoResults;

  /// No description provided for @deliveryDays0.
  ///
  /// In en, this message translates to:
  /// **'Sunday'**
  String get deliveryDays0;

  /// No description provided for @deliveryDays1.
  ///
  /// In en, this message translates to:
  /// **'Monday'**
  String get deliveryDays1;

  /// No description provided for @deliveryDays2.
  ///
  /// In en, this message translates to:
  /// **'Tuesday'**
  String get deliveryDays2;

  /// No description provided for @deliveryDays3.
  ///
  /// In en, this message translates to:
  /// **'Wednesday'**
  String get deliveryDays3;

  /// No description provided for @deliveryDays4.
  ///
  /// In en, this message translates to:
  /// **'Thursday'**
  String get deliveryDays4;

  /// No description provided for @deliveryDays5.
  ///
  /// In en, this message translates to:
  /// **'Friday'**
  String get deliveryDays5;

  /// No description provided for @deliveryDays6.
  ///
  /// In en, this message translates to:
  /// **'Saturday'**
  String get deliveryDays6;

  /// No description provided for @deliveryHoursMinutes.
  ///
  /// In en, this message translates to:
  /// **'{hours} hours {minutes} minutes'**
  String deliveryHoursMinutes(String hours, String minutes);

  /// No description provided for @warehouseInsightsUnknownAge.
  ///
  /// In en, this message translates to:
  /// **'Balance without a verified invoice age; included in total debt, excluded from aging bands until a reliable date is available.'**
  String get warehouseInsightsUnknownAge;

  /// No description provided for @manualAddressLabel.
  ///
  /// In en, this message translates to:
  /// **'Street address'**
  String get manualAddressLabel;

  /// No description provided for @areaNameLabel.
  ///
  /// In en, this message translates to:
  /// **'Area or village'**
  String get areaNameLabel;

  /// No description provided for @optionalLocationLabel.
  ///
  /// In en, this message translates to:
  /// **'Pharmacy map location (optional)'**
  String get optionalLocationLabel;

  /// No description provided for @registrationUnconfirmed.
  ///
  /// In en, this message translates to:
  /// **'We could not confirm registration. Your account may exist; try signing in with the same phone and password before registering again.'**
  String get registrationUnconfirmed;

  /// No description provided for @editProfileTitle.
  ///
  /// In en, this message translates to:
  /// **'Edit pharmacy profile'**
  String get editProfileTitle;

  /// No description provided for @saveProfileButton.
  ///
  /// In en, this message translates to:
  /// **'Save profile'**
  String get saveProfileButton;

  /// No description provided for @launchUnknown.
  ///
  /// In en, this message translates to:
  /// **'Operating status is unavailable. You can browse; ordering is paused until it can be checked.'**
  String get launchUnknown;

  /// No description provided for @launchPreparing.
  ///
  /// In en, this message translates to:
  /// **'Registration and browsing are open. Ordering has not started yet.'**
  String get launchPreparing;

  /// No description provided for @launchRetry.
  ///
  /// In en, this message translates to:
  /// **'Check again'**
  String get launchRetry;

  /// No description provided for @featurePreferencesTitle.
  ///
  /// In en, this message translates to:
  /// **'Feature preferences'**
  String get featurePreferencesTitle;

  /// No description provided for @featurePreferencesHelp.
  ///
  /// In en, this message translates to:
  /// **'Preferences cannot grant access. Availability depends on your account permissions, warehouse entitlements and platform settings. Advanced accounting is pending; core payment recording remains available to accounting operators.'**
  String get featurePreferencesHelp;

  /// No description provided for @featurePreferencesOwnerOnly.
  ///
  /// In en, this message translates to:
  /// **'Only the warehouse owner can edit these preferences.'**
  String get featurePreferencesOwnerOnly;

  /// No description provided for @featurePreferencesSaved.
  ///
  /// In en, this message translates to:
  /// **'Preferences saved and availability refreshed.'**
  String get featurePreferencesSaved;

  /// No description provided for @featurePreferencesAvailable.
  ///
  /// In en, this message translates to:
  /// **'Currently available'**
  String get featurePreferencesAvailable;

  /// No description provided for @featurePreferencesUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Currently unavailable'**
  String get featurePreferencesUnavailable;

  /// No description provided for @featurePreferencesReason.
  ///
  /// In en, this message translates to:
  /// **'Reason for change'**
  String get featurePreferencesReason;

  /// No description provided for @featurePreferencesSave.
  ///
  /// In en, this message translates to:
  /// **'Save preferences'**
  String get featurePreferencesSave;

  /// No description provided for @featurePreferencesRepTracking.
  ///
  /// In en, this message translates to:
  /// **'Rep visit tracking'**
  String get featurePreferencesRepTracking;

  /// No description provided for @featurePreferencesLoyalty.
  ///
  /// In en, this message translates to:
  /// **'Loyalty'**
  String get featurePreferencesLoyalty;

  /// No description provided for @featurePreferencesAccounting.
  ///
  /// In en, this message translates to:
  /// **'Advanced accounting — scope pending'**
  String get featurePreferencesAccounting;

  /// No description provided for @featurePreferencesSalesReports.
  ///
  /// In en, this message translates to:
  /// **'Sales reports'**
  String get featurePreferencesSalesReports;

  /// No description provided for @featurePreferencesOwnerInsights.
  ///
  /// In en, this message translates to:
  /// **'Owner report'**
  String get featurePreferencesOwnerInsights;

  /// No description provided for @featurePreferencesOverdue.
  ///
  /// In en, this message translates to:
  /// **'Overdue receivables'**
  String get featurePreferencesOverdue;

  /// No description provided for @featurePreferencesInactive.
  ///
  /// In en, this message translates to:
  /// **'Inactive pharmacies'**
  String get featurePreferencesInactive;

  /// No description provided for @featurePreferencesAlerts.
  ///
  /// In en, this message translates to:
  /// **'In-screen owner alerts'**
  String get featurePreferencesAlerts;

  /// No description provided for @featurePreferencesDelivery.
  ///
  /// In en, this message translates to:
  /// **'Delivery scheduling'**
  String get featurePreferencesDelivery;

  /// No description provided for @errorFeatureControlChanged.
  ///
  /// In en, this message translates to:
  /// **'Feature settings changed. Reload before saving.'**
  String get errorFeatureControlChanged;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['ar', 'en'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'ar':
      return AppLocalizationsAr();
    case 'en':
      return AppLocalizationsEn();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
