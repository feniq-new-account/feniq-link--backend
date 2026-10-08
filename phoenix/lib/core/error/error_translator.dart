import 'package:feniq/core/error/failure.dart';
import 'package:feniq/generated/app_localizations.dart';

// Maps an error `code` - either a backend domain code (see
// backend/src/utils/ApiError.js) or one of [FailureCode] for a transport
// error the client raised itself - to a localized, user-facing string via
// the existing .arb/AppLocalizations system. Falls back to the raw English
// `fallbackMessage` only for a code this hasn't been taught yet (endpoints
// still on the message-only pattern, e.g. most of auth).
//
// This is the single place a technical error becomes a sentence the user
// sees. Pass the result to FailureWidget / a SnackBar - never a raw
// exception or Failure.errMessage.
//
// Cart's STOCK_CHECK_FAILED is deliberately not handled here: its per-item
// `details.problems` need product names the client already holds locally
// (see features/cart/presentation/utils/cart_error_translator.dart), which
// this generic single-string translator has no access to.
String translateErrorCode(AppLocalizations l10n, String? code, String fallbackMessage) {
  switch (code) {
    // --- Transport / HTTP-status failures (FailureCode + synthesised HTTP_*).
    case FailureCode.network:
      return l10n.errorNetwork;
    case FailureCode.timeout:
      return l10n.errorTimeout;
    case 'HTTP_401':
      return l10n.errorSessionExpired;
    case 'HTTP_403':
      return l10n.errorNoPermission;
    case 'HTTP_404':
      return l10n.errorNotFound;
    case 'HTTP_500':
    case 'HTTP_502':
    case 'HTTP_503':
      return l10n.errorServer;

    // --- Auth domain codes.
    //
    // PHONE_ALREADY_REGISTERED is what registration now returns for a phone
    // that already has an account (409). It used to silently log that account
    // back in without checking the password - an authentication bypass, audit
    // C-1 - so this message is the whole of the redirect: it tells the user to
    // sign in, and RegistrationView already shows a link to the sign-in screen.
    case 'PHONE_ALREADY_REGISTERED':
      return l10n.errorPhoneAlreadyRegistered;
    // Wrong current password on change-password / delete-account. Distinct
    // from a failed sign-in, which stays deliberately vague (audit H-1): here
    // the user is already authenticated, so there is nothing to enumerate.
    case 'INVALID_CURRENT_PASSWORD':
      return l10n.errorInvalidCurrentPassword;
    // The rest of change-password's refusals (auth.controller.js /
    // auth.service.js). ChangePasswordView validates the same things in the
    // form first, so these only surface if the two ever disagree.
    case 'PASSWORD_UNCHANGED':
      return l10n.errorPasswordUnchanged;
    case 'PASSWORD_MISMATCH':
      return l10n.errorPasswordMismatch;
    case 'INVALID_PASSWORD':
      return l10n.errorInvalidPassword;

    // --- Backend domain codes.
    // Auth. Before F-01/F-02 the backend sent no `code` on any auth error,
    // so every one of these fell through to `default` and an Arabic-locale
    // pharmacist read the raw English sentence off the wire.
    case 'INVALID_CREDENTIALS':
      return l10n.errorInvalidCredentials;
    case 'ACCOUNT_BLOCKED':
      return l10n.errorAccountBlocked;
    case 'ACCOUNT_NOT_FOUND':
      return l10n.errorAccountNotFound;
    case 'CART_EMPTY':
      return l10n.cartEmptyMessage;
    case 'INVALID_PRODUCT':
    case 'INVALID_QUANTITY':
    case 'INVALID_WAREHOUSE':
      return l10n.errorInvalidRequest;
    // A cart line above the server's per-item ceiling (order.controller.js
    // MAX_ITEM_QUANTITY) - almost always an extra zero typed by mistake.
    case 'QUANTITY_TOO_LARGE':
      return l10n.errorQuantityTooLarge;
    case 'PHARMACY_NOT_FOUND':
      return l10n.errorPharmacyNotFound;
    case 'WAREHOUSE_NOT_FOUND':
      return l10n.errorWarehouseNotFound;
    case 'EXCHANGE_RATE_UNAVAILABLE':
      return l10n.errorExchangeRateUnavailable;
    // 409 from POST /orders: the order was converted at a rate that has since
    // moved. CartView answers this with its own dialog (the new total and a
    // fresh confirmation); this is the fallback for any other caller.
    case 'RATE_CHANGED':
      return l10n.errorRateChangedTitle;
    case 'STOCK_CHECK_FAILED':
      return l10n.errorStockCheckFailedGeneric;
    // 400 from POST /orders: a product's bonus changed since it was added to
    // the cart (catalog overhaul Phase 8). CartView answers with its own
    // confirmation; this is the fallback.
    case 'BONUS_CHANGED':
    case 'BONUS_CHANGE_UNCONFIRMED':
      return l10n.errorBonusChangedGeneric;
    case 'PACKAGE_UNAVAILABLE':
      return l10n.errorPackageUnavailable;
    // 409 from POST /orders: the idempotency key already placed an order from
    // a different cart (order.service.js). CartCubit drops the key with it, so
    // submitting again places the edited cart as a new order.
    case 'IDEMPOTENCY_KEY_REUSED':
      return l10n.errorIdempotencyKeyReused;
    // Discount codes - from POST /discount-codes/preview (the cart's Apply) as
    // the code itself, and from POST /orders as details.reason of a 409
    // DISCOUNT_CODE_CHANGED (the code stopped working after it was applied).
    case 'DISCOUNT_CODE_INVALID':
      return l10n.errorDiscountCodeInvalid;
    case 'DISCOUNT_CODE_NOT_STARTED':
      return l10n.errorDiscountCodeNotStarted;
    case 'DISCOUNT_CODE_EXPIRED':
      return l10n.errorDiscountCodeExpired;
    case 'DISCOUNT_CODE_LIMIT_REACHED':
      return l10n.errorDiscountCodeLimitReached;
    case 'DISCOUNT_CODE_PHARMACY_LIMIT_REACHED':
      return l10n.errorDiscountCodePharmacyLimitReached;
    case 'DISCOUNT_CODE_NOT_FOR_PHARMACY':
      return l10n.errorDiscountCodeNotForPharmacy;
    case 'DISCOUNT_CODE_NOT_FOR_WAREHOUSE':
      return l10n.errorDiscountCodeNotForWarehouse;
    case 'DISCOUNT_CODE_PENDING_APPROVAL':
      return l10n.errorDiscountCodePendingApproval;
    case 'DISCOUNT_CODE_STOPPED':
      return l10n.errorDiscountCodeStopped;
    case 'DISCOUNT_CODE_EDITED':
      return l10n.errorDiscountCodeEdited;
    // CartView answers this with its own dialog naming the reason; this is
    // the fallback for any other caller.
    case 'DISCOUNT_CODE_CHANGED':
      return l10n.discountCodeChangedTitle;
    case 'ORDER_NOT_FOUND':
      return l10n.errorOrderNotFound;
    case 'ORDER_NOT_CANCELLABLE':
      return l10n.errorOrderNotCancellable;
    case 'ORDER_NOT_DELIVERED':
      return l10n.errorOrderNotDelivered;
    case 'ORDER_NOT_REORDERABLE':
      return l10n.errorOrderNotReorderable;
    case 'ORDER_ITEM_NOT_FOUND':
      return l10n.errorOrderItemNotFound;
    case 'DELIVERY_SEAL_PHOTO_REQUIRED':
      return l10n.errorDeliverySealPhotoRequired;
    case 'INVALID_DELIVERY_SEAL_PHOTO':
      return l10n.errorInvalidDeliverySealPhoto;
    case 'ORDER_NOT_AWAITING_DELIVERY':
      return l10n.errorOrderNotAwaitingDelivery;
    case 'RETURN_QUANTITY_EXCEEDS_ORDERED':
      return l10n.errorReturnQuantityExceeded;
    case 'INVALID_REASON_TYPE':
      return l10n.errorInvalidRequest;
    case 'CUSTOM_REASON_REQUIRED':
      return l10n.errorCustomReasonRequired;
    case 'TOO_MANY_RETURN_PHOTOS':
      return l10n.errorTooManyReturnPhotos;
    case 'INVALID_RETURN_PHOTO':
      return l10n.errorInvalidReturnPhoto;
    case 'RETURN_ALREADY_EXISTS':
      return l10n.errorReturnAlreadyExists;
    case 'RETURN_NOT_EDITABLE':
      return l10n.errorReturnNotEditable;
    case 'RETURN_ITEMS_EMPTY':
      return l10n.errorReturnItemsEmpty;
    case 'DUPLICATE_RETURN_ITEM':
      return l10n.errorDuplicateReturnItem;
    case 'REJECTION_NOTE_REQUIRED':
      return l10n.errorRejectionNoteRequired;
    case 'RETURN_NOT_FOUND':
      return l10n.errorInvalidRequest;
    case 'INVALID_RATING':
      return l10n.errorInvalidRequest;
    case 'ALREADY_REVIEWED':
      return l10n.errorAlreadyReviewed;

    // --- Complaint system.
    case 'COMPLAINT_WAREHOUSE_REQUIRED':
    case 'COMPLAINT_INVALID_WAREHOUSE':
      return l10n.errorComplaintWarehouseRequired;
    case 'COMPLAINT_SUBJECT_REQUIRED':
      return l10n.errorComplaintSubjectRequired;
    case 'COMPLAINT_DESCRIPTION_REQUIRED':
      return l10n.errorComplaintDescriptionRequired;
    case 'COMPLAINT_INVALID_ORDER':
    case 'COMPLAINT_ORDER_NOT_FOUND':
      return l10n.errorComplaintOrderNotFound;
    case 'COMPLAINT_CONTEXT_MISMATCH':
      return l10n.errorComplaintContextMismatch;
    case 'COMPLAINT_SUBJECT_REQUIRED_TOO_LONG':
    case 'COMPLAINT_DESCRIPTION_REQUIRED_TOO_LONG':
    case 'COMPLAINT_EXTRA_TOO_LONG':
      return l10n.errorComplaintTooLong;
    case 'COMPLAINT_NOT_FOUND':
      return l10n.errorComplaintNotFound;

    // Field reps (backend/src/services/repPortal.service.js).
    case 'PHARMACY_NOT_ASSIGNED':
      return l10n.errorRepPharmacyNotAssigned;
    case 'VISIT_CODE_NOT_FOUND':
      return l10n.errorRepVisitCodeUnknown;
    case 'INVALID_VISIT_CODE':
      return l10n.errorRepVisitCodeInvalid;
    case 'REP_INACTIVE':
      return l10n.errorRepInactive;
    case 'INVALID_LOCATION':
      return l10n.errorRepInvalidLocation;

    // A warehouse working its orders in the app (warehouseOrder.service.js).
    case 'CANNOT_REMOVE_LAST_ITEM':
      return l10n.errorCannotRemoveLastItem;
    case 'ORDER_ALREADY_ADVANCED':
      return l10n.errorOrderAlreadyAdvanced;
    case 'ORDER_NOT_ADVANCEABLE':
      return l10n.errorOrderNotAdvanceable;
    case 'ORDER_NOT_ON_THE_WAY':
      return l10n.errorOrderNotOnTheWay;
    case 'ORDER_NOT_EDITABLE':
      return l10n.errorOrderNotEditable;
    case 'PACKAGE_ITEMS_LOCKED':
      return l10n.errorPackageItemsLocked;
    case 'INVALID_LOYALTY_TIERS':
      return l10n.errorInvalidLoyaltyTiers;
    case 'LOYALTY_TIERS_REQUIRED':
      return l10n.errorLoyaltyTiersRequired;
    case 'INVALID_COMMISSION_RATE':
      return l10n.errorInvalidCommissionRate;
    case 'INVALID_PAYMENT_AMOUNT':
      return l10n.errorInvalidPaymentAmount;
    case 'INVALID_PHONE_FORMAT':
      return l10n.errorInvalidPhoneFormat;
    case 'INVALID_REP_NAME':
      return l10n.errorInvalidRepName;
    case 'NO_TRADING_RELATIONSHIP':
      return l10n.errorNoTradingRelationship;
    case 'REP_NOT_FOUND':
      return l10n.errorRepNotFound;
    case 'RETURN_ALREADY_RESOLVED':
      return l10n.errorReturnAlreadyResolved;

    case 'UNEXPECTED_ERROR':
      return l10n.errorState;
    default:
      return fallbackMessage;
  }
}
