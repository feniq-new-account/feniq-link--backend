# Graph Report - feniq-backend  (2026-09-29)

## Corpus Check
- Large corpus: 1141 files · ~923,272 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 6243 nodes · 12293 edges · 201 communities (196 shown, 5 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 561 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- app: auth + shared
- app: warehouse_selection + app: profile
- api: productCatalog (services) + api: importSynonyms (config)
- app: catalog + app: promotions
- api: adminCatalog (controllers) + api: admin (controllers)
- app: returns + app: account_history
- web: ImagePicker + web: cameraCapture
- app: cart + shared
- web: AdminBannersPage + web: WarehouseImportResultsPage
- shared + app: complaints
- api: order (services) + api: warehouseOrder (services)
- app: promotions + app: core
- api: warehouseProduct (controllers) + api: warehouseDiscountCode (controllers)
- api: manufacturer (services) + api: catalogMerge (services)
- api: auth (middlewares) + api: warehouseOrder (routes)
- api: adminAdvertisement (controllers) + api: warehouseAdvertisement (controllers)
- app: returns + shared
- app: catalog + shared
- app: debts + shared
- app: my_orders + app: order_tracking
- api: warehouseProduct (services) + api: imageAsset (services)
- app: main.dart + shared
- api: warehouse (routes) + api: validateRequest (middlewares)
- api: order (viewmodels) + api: advertisement (viewmodels)
- api: adminOffer (services) + api: warehouseOffer (services)
- web: ProductFormModal + web: exchangeRate
- web: warehouseNav + web: WarehouseBannersPage
- app: cart + shared
- app: cart + shared
- api: warehouseImport (services) + api: warehouseManufacturer (services)
- app: core + shared
- api: upload (middlewares) + api: order (routes)
- api: manufacturerDiscount (services) + api: product (services)
- app: promotions + app: catalog
- app: notifications + shared
- web: client + web: clientRefresh
- app: auth + shared
- app: order_tracking + shared
- api: ledgerAdjustment (services) + api: category (services)
- api: index (routes)
- app: debts
- api: discountCode (services) + api: discountCodePharmacyUsage (models)
- web: payments + web: WarehouseDebtsPage
- app: notifications + shared
- shared + app: auth
- app: banners + shared
- app: complaints
- api: warehouseBanner (services) + api: advertisement (services)
- app: catalog + shared
- shared + api: firebase (config)
- api: adminCategory (controllers) + api: warehouseSettlement (controllers)
- api: admin (services) + api: refreshToken (models)
- app: cart
- app: core + shared
- app: cart
- api: auth (services)
- api: warehouseOrder (controllers) + api: ApiError (utils)
- api: admin (routes) + api: adminComplaint (routes)
- app: advertisements + app: cart
- app: complaints + app: reviews
- app: core
- app: returns + shared
- app: notifications + app: cart
- app: cart + app: order_tracking
- app: core + app: settings
- api: auth (controllers) + api: phone (utils)
- app: core + shared
- api: adminLedger (controllers) + api: pharmacyDebt (controllers)
- app: core + shared
- web: discountCodesFilters + web: AdminDiscountCodesPage
- app: core + shared
- app: auth + shared
- api: adminProduct (services) + api: product (models)
- app: debts + shared
- app: warehouse_selection + shared
- web: unreadBadges + web: UnreadBadgesProvider
- api: commissionCollection (services) + api: commissionCollection (models)
- api: payment (services) + api: idempotency (utils)
- app: complaints + app: core
- app: core
- app: warehouse_selection
- api: rateLimiter (middlewares) + api: auth (routes)
- api: adminAdvertisement (services) + api: index (realtime)
- app: returns + shared
- app: warehouse_selection + shared
- app: catalog + app: reviews
- shared + api: ledgerVerifier (services)
- app: complaints + app: catalog
- api: order (controllers)
- api: businessTime (utils) + api: settlement (services)
- app: auth + shared
- app: catalog + shared
- app: routes
- app: routes
- web: businessDate + web: AdminCommissionPage
- api: index (realtime) + api: events (realtime)
- app: catalog + app: core
- app: core + shared
- app: cart + app: warehouse_selection
- app: app_update + shared
- api: exchangeRate (services) + api: exchangeRate (models)
- api: return (services) + api: return (models)
- api: catalogRequest (services) + api: nameLanguage (utils)
- api: ledger (services)
- api: warehouseReturn (services) + api: return (services)
- api: warehouseAdvertisement (services)
- app: complaints + shared
- app: advertisements
- app: returns
- app: offers
- web: realtimeClient + shared
- web: CatalogPickers + web: ProductPicker
- api: adminBanner (services)
- api: adminDiscountCode (services)
- api: warehouseOrder (viewmodels) + api: admin (viewmodels)
- app: core + shared
- app: order_tracking + app: reviews
- app: debts + shared
- app: account_history + shared
- api: review (services) + api: order (models)
- web: accountsFilters + web: AccountsPage
- api: orderLedger (services) + api: ledgerEntry (models)
- api: warehouseDiscountCode (services) + api: discountCode (models)
- api: complaint (services) + api: user (models)
- app: exchange_rate + shared
- app: core + shared
- app: returns
- api: warehouseCatalog (controllers) + api: productCatalog (viewmodels)
- app: warehouse_selection + shared
- app: core + shared
- app: legal + shared
- api: notification (services) + api: notification (models)
- api: accountStatement (services)
- app: cart + app: returns
- app: core + shared
- api: warehouseBalance (controllers)
- api: warehouseComplaint (services) + api: complaint (services)
- api: sms (services)
- api: warehouse (services) + api: cityMatch (utils)
- app: core + shared
- app: core + shared
- api: adminCommission (controllers) + api: commissionCollection (viewmodels)
- api: adminOffer (controllers) + api: adminOffer (viewmodels)
- api: return (controllers)
- api: adminComplaint (services)
- api: discountCode (viewmodels) + api: invoice (viewmodels)
- app: core + shared
- app: cart
- api: otp (services) + api: otp (models)
- api: warehouseReview (services) + api: pharmacy (models)
- api: complaint (viewmodels)
- app: core + shared
- app: core + app: exchange_rate
- app: advertisements + shared
- api: review (controllers) + api: review (viewmodels)
- api: returnCredit (services) + api: orderItem (models)
- app: core + shared
- app: complaints
- app: returns
- web: offersFilters + web: WarehouseOffersPage
- api: adminExchangeRate (controllers) + api: exchangeRate (viewmodels)
- api: warehousePayment (controllers) + api: payment (viewmodels)
- api: warehouseReview (controllers) + api: warehouseReview (viewmodels)
- api: warehouseReturn (viewmodels) + api: return (viewmodels)
- app: core + shared
- app: core + shared
- api: adminDiscountCode (controllers)
- api: warehouse (controllers) + api: warehouse (viewmodels)
- app: settings + shared
- app: auth + shared
- app: core + shared
- app: my_orders
- api: complaint (controllers)
- api: financialAudit (services) + api: financialAuditLog (models)
- app: banners + shared
- app: core + shared
- app: core + shared
- app: core + shared
- app: core + shared
- api: adminDiscountCode (routes) + api: adminLedger (routes)
- shared + app: core
- app: core + app: config
- app: core + shared
- app: core + shared
- app: core + shared
- api: banner (models) + api: banner (services)
- api: idempotency (utils) + api: payment (services)
- app: core + shared
- app: core + shared
- api: warehouseOffer (viewmodels)
- app: core + shared
- app: core
- api: adminBanner (viewmodels)
- api: manufacturerDiscount (viewmodels)
- app: catalog
- app: exchange_rate
- api: payment (models)
- app: core
- app: core

## God Nodes (most connected - your core abstractions)
1. `ApiError` - 87 edges
2. `loadWarehouseOrThrow()` - 65 edges
3. `parseCursorQuery()` - 61 edges
4. `paginationMeta()` - 61 edges
5. `displayName()` - 56 edges
6. `parseObjectIdCursor()` - 55 edges
7. `usePaginatedData()` - 51 edges
8. `normalizeText()` - 50 edges
9. `LoadMoreControl()` - 50 edges
10. `authenticate` - 46 edges

## Surprising Connections (you probably didn't know these)
- `list` --calls--> `loadWarehouseOrThrow()`  [EXTRACTED]
  backend/src/controllers/warehouseAdvertisement.controller.js → backend/src/utils/loadWarehouse.js
- `remove` --calls--> `loadWarehouseOrThrow()`  [EXTRACTED]
  backend/src/controllers/warehouseAdvertisement.controller.js → backend/src/utils/loadWarehouse.js
- `updateAvailability` --calls--> `loadWarehouseOrThrow()`  [EXTRACTED]
  backend/src/controllers/warehouseAdvertisement.controller.js → backend/src/utils/loadWarehouse.js
- `getOne` --calls--> `loadWarehouseOrThrow()`  [EXTRACTED]
  backend/src/controllers/warehouseBalance.controller.js → backend/src/utils/loadWarehouse.js
- `invoice` --calls--> `loadWarehouseOrThrow()`  [EXTRACTED]
  backend/src/controllers/warehouseBalance.controller.js → backend/src/utils/loadWarehouse.js

## Import Cycles
- None detected.

## Communities (201 total, 5 thin omitted)

### Community 0 - "app: auth + shared"
Cohesion: 0.02
Nodes (129): Animation, Color, FormState, Key, package:feniq/core/utils/validators.dart, package:feniq/core/widgets/app_text_field.dart, package:feniq/core/widgets/brand_logo.dart, package:feniq/core/widgets/phone_text_field.dart (+121 more)

### Community 1 - "app: warehouse_selection + app: profile"
Cohesion: 0.03
Nodes (99): package:feniq/core/constants/app_padding.dart, package:feniq/core/theme/app_text_theme.dart, package:feniq/core/widgets/custom_card.dart, package:feniq/core/widgets/whatsapp_button.dart, package:feniq/features/catalog/presentation/widgets/manufacturer_avatar.dart, package:feniq/features/complaints/presentation/managers/complaint_detail_cubit.dart, package:feniq/features/complaints/presentation/managers/complaint_detail_state.dart, package:feniq/features/complaints/presentation/utils/complaint_labels.dart (+91 more)

### Community 2 - "api: productCatalog (services) + api: importSynonyms (config)"
Cohesion: 0.04
Nodes (93): CURRENCY_BY_TOKEN, CURRENCY_SYNONYMS, currencyForText(), FIELD_SYNONYMS, fieldForHeader(), HEADER_TO_FIELD, IMPORT_COLUMN_SETS, IMPORT_FIELDS (+85 more)

### Community 3 - "app: catalog + app: promotions"
Cohesion: 0.03
Nodes (90): package:feniq/core/constants/app_radius.dart, package:feniq/core/utils/whatsapp_launcher.dart, package:feniq/core/widgets/app_network_image.dart, package:feniq/features/advertisements/presentation/utils/advertisement_cart_launcher.dart, package:feniq/features/catalog/data/models/bonus_tier.dart, package:feniq/features/exchange_rate/presentation/managers/exchange_rate_cubit.dart, build, phone (+82 more)

### Community 4 - "api: adminCatalog (controllers) + api: admin (controllers)"
Cohesion: 0.03
Nodes (84): adminService, adminViewModel, { ApiError }, approveAccount, { asyncHandler }, blockAccount, broadcastNotification, createWarehouse (+76 more)

### Community 5 - "app: returns + app: account_history"
Cohesion: 0.03
Nodes (85): Cubit, package:feniq/core/widgets/app_skeleton.dart, package:feniq/core/widgets/failure_widget.dart, package:feniq/features/account_history/presentation/managers/savings_cubit.dart, package:feniq/features/account_history/presentation/managers/savings_state.dart, package:feniq/features/debts/presentation/managers/debts_cubit.dart, package:feniq/features/debts/presentation/managers/debts_state.dart, package:feniq/features/debts/presentation/widgets/debts_overview.dart (+77 more)

### Community 6 - "web: ImagePicker + web: cameraCapture"
Cohesion: 0.04
Nodes (53): ref_i18next, ref_i18next_browser_languagedetector, ref_react_dom, ref_vitest, CameraModal(), ImagePicker(), LIVE_STATUSES, camera() (+45 more)

### Community 7 - "app: cart + shared"
Cohesion: 0.03
Nodes (81): package:feniq/core/error/error_translator.dart, package:feniq/core/widgets/add_to_cart_button.dart, package:feniq/core/widgets/app_dialog.dart, package:feniq/features/cart/presentation/managers/cart_cubit.dart, package:feniq/features/cart/presentation/managers/cart_state.dart, package:feniq/features/cart/presentation/utils/cart_error_translator.dart, package:feniq/features/cart/presentation/widgets/cart_item_tile.dart, package:feniq/features/cart/presentation/widgets/discount_code_field.dart (+73 more)

### Community 8 - "web: AdminBannersPage + web: WarehouseImportResultsPage"
Cohesion: 0.08
Nodes (60): ref_react, ref_react_i18next, ref_react_router_dom, api, ProductPicker(), ExchangeRateCard(), LanguageToggle(), LoadMoreControl() (+52 more)

### Community 9 - "shared + app: complaints"
Cohesion: 0.03
Nodes (79): app_page_transition.dart, complaint_detail_state.dart, GoRouter, my_complaints_state.dart, package:feniq/features/account_history/data/repositories/savings_repository.dart, package:feniq/features/account_history/presentation/views/account_history_view.dart, package:feniq/features/advertisements/data/repositories/advertisements_repository.dart, package:feniq/features/auth/presentation/views/approval_pending_view.dart (+71 more)

### Community 10 - "api: order (services) + api: warehouseOrder (services)"
Cohesion: 0.04
Nodes (79): codeDiscountSyp(), computeDiscountedPriceUsd(), computeFinalPrice(), stackedDiscountSyp(), advertisementDiscountSyp(), { ApiError }, { applyResolvedIdentity }, attachDeliverySealPhoto() (+71 more)

### Community 11 - "app: promotions + app: core"
Cohesion: 0.03
Nodes (76): EdgeInsets, package:feniq/core/constants/app_sizes.dart, package:flutter/material.dart, PageController, VoidCallback, AddToCartButton, available, build (+68 more)

### Community 12 - "api: warehouseProduct (controllers) + api: warehouseDiscountCode (controllers)"
Cohesion: 0.04
Nodes (70): { asyncHandler }, create, discountService, discountViewModel, list, { loadWarehouseOrThrow }, remove, update (+62 more)

### Community 13 - "api: manufacturer (services) + api: catalogMerge (services)"
Cohesion: 0.03
Nodes (65): advertisementItemSchema, advertisementSchema, { Schema, model }, catalogDuplicateReviewSchema, { Schema, model }, importBatchSchema, { Schema, model }, IMPORT_ROW_BUCKETS (+57 more)

### Community 14 - "api: auth (middlewares) + api: warehouseOrder (routes)"
Cohesion: 0.04
Nodes (58): { ApiError }, { asyncHandler }, authenticate, authenticateToken(), authorize(), env, jwt, requireActiveStatus() (+50 more)

### Community 15 - "api: adminAdvertisement (controllers) + api: warehouseAdvertisement (controllers)"
Cohesion: 0.04
Nodes (67): { ApiError }, approve, { asyncHandler }, listAll, listPending, normalizeAdvertisementBody(), { parseCursorQuery, parseObjectIdCursor, paginationMeta }, reject (+59 more)

### Community 16 - "app: returns + shared"
Cohesion: 0.03
Nodes (70): dart:typed_data, ImageSource, package:feniq/core/constants/image_upload.dart, package:feniq/features/cart/data/models/order_line_item.dart, package:feniq/features/order_tracking/presentation/managers/order_tracking_cubit.dart, package:feniq/features/returns/presentation/managers/request_return_cubit.dart, package:feniq/features/returns/presentation/managers/request_return_state.dart, package:permission_handler/permission_handler.dart (+62 more)

### Community 17 - "app: catalog + shared"
Cohesion: 0.04
Nodes (67): manufacturers_state.dart, package:feniq/features/cart/presentation/widgets/cart_button.dart, package:feniq/features/catalog/data/models/catalog_route_args.dart, package:feniq/features/catalog/data/repositories/catalog_repository.dart, package:feniq/features/catalog/presentation/managers/catalog_cubit.dart, package:feniq/features/catalog/presentation/managers/catalog_state.dart, package:feniq/features/catalog/presentation/managers/manufacturers_cubit.dart, package:feniq/features/catalog/presentation/managers/manufacturers_state.dart (+59 more)

### Community 18 - "app: debts + shared"
Cohesion: 0.04
Nodes (58): package:feniq/core/constants/app_colors.dart, package:feniq/core/extensions/build_context_extensions.dart, package:feniq/core/utils/currency_formatter.dart, package:feniq/core/utils/date_formatter.dart, package:feniq/core/widgets/status_badge.dart, package:feniq/features/cart/data/models/order_status_history_entry.dart, package:feniq/features/cart/presentation/utils/order_status_label.dart, package:feniq/features/cart/presentation/widgets/reorder_button.dart (+50 more)

### Community 19 - "app: my_orders + app: order_tracking"
Cohesion: 0.04
Nodes (60): AnimationController, package:feniq/features/my_orders/presentation/managers/my_orders_cubit.dart, package:feniq/features/my_orders/presentation/managers/my_orders_state.dart, package:feniq/features/my_orders/presentation/widgets/order_list_tile.dart, _openOrderTracking, SkeletonPulse, _SkeletonPulseState, QuantityStepper (+52 more)

### Community 20 - "api: warehouseProduct (services) + api: imageAsset (services)"
Cohesion: 0.06
Nodes (58): unitNameAr(), unitNameEn(), clearImage, uploadImage, { asyncHandler }, clearLogo, manufacturerService, merge (+50 more)

### Community 21 - "app: main.dart + shared"
Cohesion: 0.03
Nodes (60): package:feniq/core/theme/dark_theme.dart, package:feniq/core/theme/light_theme.dart, package:feniq/features/account_history/data/repositories/savings_repository_impl.dart, package:feniq/features/advertisements/data/repositories/advertisements_repository_impl.dart, package:feniq/features/app_update/presentation/app_update_gate.dart, package:feniq/features/banners/data/repositories/banners_repository_impl.dart, package:feniq/features/cart/data/repositories/order_repository_impl.dart, package:feniq/features/catalog/data/repositories/catalog_repository_impl.dart (+52 more)

### Community 22 - "api: warehouse (routes) + api: validateRequest (middlewares)"
Cohesion: 0.05
Nodes (48): catalogImportUpload, singleImageUpload, { ApiError }, isObjectId(), objectIdParam(), objectIdParams(), stringQueryOnly(), { authenticate, authorize } (+40 more)

### Community 23 - "api: order (viewmodels) + api: advertisement (viewmodels)"
Cohesion: 0.06
Nodes (48): catalogImage(), effectiveImage(), { serializeAdvertisement }, serializePendingAdvertisement(), toAdvertisementsResponse(), toPendingAdvertisementsResponse(), { effectiveImage }, serializeAdminProduct() (+40 more)

### Community 24 - "api: adminOffer (services) + api: warehouseOffer (services)"
Cohesion: 0.06
Nodes (54): adminDeleteOffer(), adminUpdateOffer(), { ApiError }, applyPendingUpdate(), { applyResolvedIdentity }, approveOffer(), assertExpectedVersion(), attachRefs() (+46 more)

### Community 25 - "web: ProductFormModal + web: exchangeRate"
Cohesion: 0.12
Nodes (41): AdvertisementFormModal(), EMPTY_FORM, toDateInputValue(), AdvertisementModal(), EMPTY_FORM, ProductPicker(), toDateInputValue(), i18nFor() (+33 more)

### Community 26 - "web: warehouseNav + web: WarehouseBannersPage"
Cohesion: 0.08
Nodes (34): AdvertisementsSubNav(), NavBadge(), AR, badges, EN, SubNav(), i18n, WarehouseGroupSubNav() (+26 more)

### Community 27 - "app: cart + shared"
Cohesion: 0.04
Nodes (52): cart_state.dart, package:uuid/uuid.dart, addPackage, addProduct, _applyBonusChanges, applyDiscountCode, _applyPriceChanges, _applyRefused (+44 more)

### Community 28 - "app: cart + shared"
Cohesion: 0.04
Nodes (52): order_line_item.dart, order_status_history_entry.dart, advertisementDiscountAmount, cancelReason, code, comment, commissionAmount, complaintNumber (+44 more)

### Community 29 - "api: warehouseImport (services) + api: warehouseManufacturer (services)"
Cohesion: 0.05
Nodes (46): UNIT_CODES, bonusTierSchema, catalogRequestSchema, { Schema, model }, { UNIT_CODES }, priceRowsInUsd(), adjustBatchCounts(), { ApiError } (+38 more)

### Community 30 - "app: core + shared"
Cohesion: 0.04
Nodes (51): AppColors, background, backgroundOf, border, borderOf, brandGradient, _brandNavy, _brandNavyDark (+43 more)

### Community 31 - "api: upload (middlewares) + api: order (routes)"
Cohesion: 0.04
Nodes (38): adminBannerMediaUpload, ALLOWED_MIME_TYPES, { ApiError }, BANNER_VIDEO_MIME_TYPES, bannerImageUpload, deliverySealPhotoUpload, GIF_SIGNATURES, MAGIC_BYTES (+30 more)

### Community 32 - "api: manufacturerDiscount (services) + api: product (services)"
Cohesion: 0.07
Nodes (45): offerSchema, offerUpdateSchema, { Schema, model }, { ApiError }, createDiscount(), deleteDiscount(), discountPercentageFor(), findOwnedDiscountOrThrow() (+37 more)

### Community 33 - "app: promotions + app: catalog"
Cohesion: 0.04
Nodes (47): int get, BonusTier, buy, format, free, freeQuantity, fromJson, hashCode (+39 more)

### Community 34 - "app: notifications + shared"
Cohesion: 0.05
Nodes (45): Offset, package:feniq/core/constants/app_duration.dart, package:feniq/core/widgets/empty_view.dart, package:feniq/features/catalog/data/models/manufacturers_route_args.dart, package:feniq/features/notifications/presentation/managers/notification_cubit.dart, package:feniq/features/notifications/presentation/managers/notification_state.dart, package:feniq/features/notifications/presentation/widgets/notification_button.dart, package:feniq/features/promotions/presentation/managers/promotions_cubit.dart (+37 more)

### Community 35 - "web: client + web: clientRefresh"
Cohesion: 0.10
Nodes (34): ApiError, buildHeaders(), fetchWithTimeout(), getRefreshToken(), getToken(), notifyTokenChanged(), onTokenChange(), performRefresh() (+26 more)

### Community 36 - "app: auth + shared"
Cohesion: 0.05
Nodes (42): package:feniq/features/auth/data/models/pharmacy_model.dart, package:feniq/features/auth/data/models/user_model.dart, AuthResponse, fromJson, pharmacy, refreshToken, token, user (+34 more)

### Community 37 - "app: order_tracking + shared"
Cohesion: 0.06
Nodes (46): package:feniq/features/order_tracking/presentation/managers/order_tracking_state.dart, package:feniq/features/order_tracking/presentation/widgets/delivery_seal_section.dart, package:feniq/features/order_tracking/presentation/widgets/order_invoice_section.dart, package:feniq/features/order_tracking/presentation/widgets/order_progress_bar.dart, package:feniq/features/order_tracking/presentation/widgets/status_history_list.dart, package:feniq/features/returns/presentation/widgets/request_return_sheet.dart, OrderTrackingCubit, OrderTrackingState (+38 more)

### Community 38 - "api: ledgerAdjustment (services) + api: category (services)"
Cohesion: 0.06
Nodes (40): categorySchema, { normalizeText }, { Schema, model }, resolveDuplicateReview(), { ApiError }, Category, findCategoryOrThrow(), mergeCategory() (+32 more)

### Community 39 - "api: index (routes)"
Cohesion: 0.04
Nodes (45): adminAdvertisementRoutes, adminBannerRoutes, adminCatalogRoutes, adminCategoryRoutes, adminCommissionRoutes, adminComplaintRoutes, adminDiscountCodeRoutes, adminExchangeRateRoutes (+37 more)

### Community 40 - "app: debts"
Cohesion: 0.04
Nodes (44): adjustmentsSyp, amountSyp, amountUsd, balanceSyp, chargesSyp, closingSyp, creditBalanceSyp, creditSyp (+36 more)

### Community 41 - "api: discountCode (services) + api: discountCodePharmacyUsage (models)"
Cohesion: 0.06
Nodes (33): discountCodePharmacyUsageSchema, { Schema, model }, { ApiError }, assertUsableForOrder(), changedError(), claimUse(), createWithGeneratedCode(), crypto (+25 more)

### Community 42 - "web: payments + web: WarehouseDebtsPage"
Cohesion: 0.09
Nodes (33): useExchangeRate(), CONFIRMED_ADVANCE_FROM_STATUS, mayAdvance(), shouldConfirmAdvance(), ADVANCEABLE_STATUSES, UNPROMPTED_STATUSES, AddPaymentForm(), BalanceAmount() (+25 more)

### Community 43 - "app: notifications + shared"
Cohesion: 0.05
Nodes (41): dart:async, notification_state.dart, package:feniq/features/notifications/data/models/notification_model.dart, package:feniq/features/notifications/data/repositories/notification_repository.dart, emitUnauthorized, instance, onUnauthorized, _unauthorizedController (+33 more)

### Community 44 - "shared + app: auth"
Cohesion: 0.07
Nodes (35): auth_repository.dart, banners_repository.dart, complaint_repository.dart, exchange_rate_repository.dart, offers_repository.dart, package:dio/dio.dart, package:feniq/core/error/failure.dart, package:feniq/core/network/api_client.dart (+27 more)

### Community 45 - "app: banners + shared"
Cohesion: 0.05
Nodes (40): package:feniq/features/banners/presentation/managers/banners_cubit.dart, package:feniq/features/banners/presentation/managers/banners_state.dart, package:video_player/video_player.dart, BannerModel, fromJson, id, imageUrl, isGif (+32 more)

### Community 46 - "app: complaints"
Cohesion: 0.05
Nodes (40): address, adminResponse, city, ComplaintModel, complaintNumber, ComplaintWarehouseRef, context, createdAt (+32 more)

### Community 47 - "api: warehouseBanner (services) + api: advertisement (services)"
Cohesion: 0.08
Nodes (39): listBanners(), listPaginatedBanners(), activeFilter(), Advertisement, { ApiError }, { applyResolvedIdentity }, isAdvertisementAvailable(), { isWarehouseAvailable } (+31 more)

### Community 48 - "app: catalog + shared"
Cohesion: 0.05
Nodes (37): catalog_repository.dart, Future, package:feniq/features/catalog/data/models/category_model.dart, package:feniq/features/catalog/data/models/manufacturer_model.dart, package:feniq/features/catalog/data/models/product_model.dart, getCategories, getManufacturers, getProducts (+29 more)

### Community 49 - "shared + api: firebase (config)"
Cohesion: 0.06
Nodes (32): { apiLimiter }, app, cors, env, express, helmet, { log }, mongoSanitize (+24 more)

### Community 50 - "api: adminCategory (controllers) + api: warehouseSettlement (controllers)"
Cohesion: 0.07
Nodes (30): { asyncHandler }, categoryService, list, merge, serializeAdminCategory(), update, { asyncHandler }, bannerService (+22 more)

### Community 51 - "api: admin (services) + api: refreshToken (models)"
Cohesion: 0.07
Nodes (33): refreshTokenSchema, { Schema, model }, disconnectUser(), emitToAdmins(), ACCOUNT_ROLES, ACCOUNT_STATUSES, { ApiError }, approveAccount() (+25 more)

### Community 52 - "app: cart"
Cohesion: 0.05
Nodes (38): amountOverMaximum, amountToReachMinimum, canSubmit, copyWith, discountCode, discountCodeErrorCode, errorCode, errorDetails (+30 more)

### Community 53 - "app: core + shared"
Cohesion: 0.05
Nodes (37): @pragma, @visibleForTesting, FirebaseMessaging get, FlutterLocalNotificationsPlugin, package:feniq/features/auth/data/repositories/auth_repository.dart, package:feniq/features/notifications/presentation/utils/discount_code_deep_link.dart, package:flutter_local_notifications/flutter_local_notifications.dart, _androidChannel (+29 more)

### Community 54 - "app: cart"
Cohesion: 0.05
Nodes (37): bonuses, CartPackageContent, copyWith, discountPriceUsd, displayName, finalPriceSyp, freeQuantity, fromPackage (+29 more)

### Community 55 - "api: auth (services)"
Cohesion: 0.09
Nodes (32): adminResetPassword(), { ApiError }, { assertPasswordPolicy }, bcrypt, changePassword(), clearFailedAttempts(), comparePasswordAgainstNothing(), crypto (+24 more)

### Community 56 - "api: warehouseOrder (controllers) + api: ApiError (utils)"
Cohesion: 0.08
Nodes (24): { ApiError }, { asyncHandler }, exchangeRateService, exchangeRateViewModel, getPublicRate, advance, { ApiError }, { asyncHandler } (+16 more)

### Community 57 - "api: admin (routes) + api: adminComplaint (routes)"
Cohesion: 0.06
Nodes (27): { authenticate, authorize }, controller, { Router }, { authenticate, authorize }, controller, { Router }, { authenticate, authorize }, controller (+19 more)

### Community 58 - "app: advertisements + app: cart"
Cohesion: 0.06
Nodes (33): bool get, isValidPassword, StringExtensions, AdvertisementCartPreparation, advertisementId, contents, fromJson, hasItems (+25 more)

### Community 59 - "app: complaints + app: reviews"
Cohesion: 0.06
Nodes (33): _int, ComplaintContext, general, order, orderId, orderNumber, orderWarehouseName, warehouse (+25 more)

### Community 60 - "app: core"
Cohesion: 0.06
Nodes (35): _, activeAdvertisements, activeBanners, activeOffers, advertisementCart, cancelOrder, cartQuote, categories (+27 more)

### Community 61 - "app: returns + shared"
Cohesion: 0.06
Nodes (31): dart:convert, dart:ui, my_returns_state.dart, package:feniq/features/returns/data/models/return_model.dart, package:feniq/features/returns/data/models/returnable_order_model.dart, package:feniq/features/returns/data/repositories/return_repository.dart, createReturn, customReason (+23 more)

### Community 62 - "app: notifications + app: cart"
Cohesion: 0.06
Nodes (31): DateTime, package:firebase_messaging/firebase_messaging.dart, DateTimeExtensions, formattedLong, formattedShort, changedAt, fromJson, OrderStatusHistoryEntry (+23 more)

### Community 63 - "app: cart + app: order_tracking"
Cohesion: 0.06
Nodes (31): order_repository.dart, package:feniq/features/cart/data/models/cart_quote.dart, package:feniq/features/cart/data/models/order_model.dart, package:feniq/features/cart/data/models/reorder_preparation.dart, package:image_picker/image_picker.dart, cancelOrder, confirmDeliveryWithSealPhoto, getOrder (+23 more)

### Community 64 - "app: core + app: settings"
Cohesion: 0.06
Nodes (31): package:feniq/core/services/logger_service.dart, package:feniq/core/services/remote_config_service.dart, package:feniq/core/services/storage_service.dart, package:feniq/core/utils/app_version.dart, package:shared_preferences/shared_preferences.dart, AppUpdateStatus, checkForUpdate, _checkInterval (+23 more)

### Community 65 - "api: auth (controllers) + api: phone (utils)"
Cohesion: 0.12
Nodes (31): adminResetPassword, { ApiError }, AREA_TYPES, { assertPasswordPolicy }, { asyncHandler }, authService, authViewModel, changePassword (+23 more)

### Community 66 - "app: core + shared"
Cohesion: 0.06
Nodes (30): Dio, Dio get, FlutterSecureStorage, Interceptor, package:feniq/config/app_config.dart, package:feniq/core/constants/storage_keys.dart, package:feniq/core/network/interceptors/auth_interceptor.dart, package:feniq/core/services/auth_event_bus.dart (+22 more)

### Community 67 - "api: adminLedger (controllers) + api: pharmacyDebt (controllers)"
Cohesion: 0.08
Nodes (27): adjustmentService, { ApiError }, { asyncHandler }, createAdjustment, parseIdempotencyKey(), rebuildBalance, respond(), reverseAdjustment (+19 more)

### Community 68 - "app: core + shared"
Cohesion: 0.06
Nodes (31): CrossAxisAlignment, EdgeInsetsGeometry, IndexedWidgetBuilder, MainAxisSize, build, child, children, _controller (+23 more)

### Community 69 - "web: discountCodesFilters + web: AdminDiscountCodesPage"
Cohesion: 0.19
Nodes (23): DiscountCodeModal(), AdminDiscountCodesPage(), ADMIN_DISCOUNT_CODE_VIEWS, buildDiscountCodePayload(), DISCOUNT_CODE_FILTERS, discountCodeEditSource(), discountCodeErrorKey(), endOfDayIso() (+15 more)

### Community 70 - "app: core + shared"
Cohesion: 0.09
Nodes (28): app_text_theme.dart, ../constants/app_colors.dart, ../constants/app_padding.dart, ../constants/app_radius.dart, ../constants/app_sizes.dart, _, DarkTheme, data (+20 more)

### Community 71 - "app: auth + shared"
Cohesion: 0.06
Nodes (30): auth_state.dart, package:feniq/core/services/fcm_service.dart, package:feniq/features/auth/data/repositories/auth_repository_impl.dart, _authRepository, checkSession, _clearLocalUserData, _clearStoredSession, close (+22 more)

### Community 72 - "api: adminProduct (services) + api: product (models)"
Cohesion: 0.07
Nodes (25): bonusTierSchema, DEACTIVATED_BY, Manufacturer, { normalizeText }, priceHistoryEntrySchema, productSchema, { Schema, model }, { UNIT_CODES } (+17 more)

### Community 73 - "app: debts + shared"
Cohesion: 0.06
Nodes (29): num get, accounts, balanceSyp, balanceUsd, creditBalanceSyp, DebtsSummaryModel, empty, fromJson (+21 more)

### Community 74 - "app: warehouse_selection + shared"
Cohesion: 0.08
Nodes (30): package:feniq/features/banners/presentation/widgets/banner_slider.dart, package:feniq/features/warehouse_selection/presentation/managers/warehouse_selection_cubit.dart, package:feniq/features/warehouse_selection/presentation/managers/warehouse_selection_state.dart, package:feniq/features/warehouse_selection/presentation/widgets/warehouse_card.dart, package:feniq/features/warehouse_selection/presentation/widgets/warehouse_city_scope_bar.dart, BannersCubit, BannerSlider, WarehouseSelectionCubit (+22 more)

### Community 75 - "web: unreadBadges + web: UnreadBadgesProvider"
Cohesion: 0.16
Nodes (25): useRealtime(), ADMIN_BUCKETS, BADGE_BUCKETS, BADGE_DISPLAY_MAX, badgeEventsFor(), bucketForEvent(), bucketsFor(), countUnder() (+17 more)

### Community 76 - "api: commissionCollection (services) + api: commissionCollection (models)"
Cohesion: 0.10
Nodes (28): commissionCollectionSchema, { Schema, model }, { ApiError }, collectedForWarehouse(), CommissionCollection, DIRECTIONS, financialAudit, getCommissionOverview() (+20 more)

### Community 77 - "api: payment (services) + api: idempotency (utils)"
Cohesion: 0.12
Nodes (28): { ApiError }, assertTradingRelationship(), { captureFxSnapshot }, Counter, createPayment(), CURRENCIES, financialAudit, findOwnedPaymentOrThrow() (+20 more)

### Community 78 - "app: complaints + app: core"
Cohesion: 0.07
Nodes (26): List, fromJson, fromJsonSkippingInvalid, hasMore, items, nextCursor, PaginatedResult, banners (+18 more)

### Community 79 - "app: core"
Cohesion: 0.07
Nodes (30): _, appName, AppStrings, counter, darkMode, email, emailLabel, emailRequired (+22 more)

### Community 80 - "app: warehouse_selection"
Cohesion: 0.07
Nodes (28): address, averageRating, city, comment, createdAt, deliveryEndTime, deliveryStartTime, deliveryType (+20 more)

### Community 81 - "api: rateLimiter (middlewares) + api: auth (routes)"
Cohesion: 0.09
Nodes (25): apiLimiter, authLimiter, discountCodeLimiter, env, identify(), IDENTITY, jwt, { normalizePhone } (+17 more)

### Community 82 - "api: adminAdvertisement (services) + api: index (realtime)"
Cohesion: 0.11
Nodes (28): emitToWarehouse(), adminDeleteAdvertisement(), adminUpdateAdvertisement(), Advertisement, { ApiError }, { applyResolvedIdentity }, approveAdvertisement(), attachRefs() (+20 more)

### Community 83 - "app: returns + shared"
Cohesion: 0.07
Nodes (27): dart:io, my_orders_state.dart, package:feniq/features/cart/data/repositories/order_repository.dart, OrderRepositoryImpl, OrderRepository, _onPressed, load, loadMore (+19 more)

### Community 84 - "app: warehouse_selection + shared"
Cohesion: 0.08
Nodes (25): package:feniq/core/session/session_scope.dart, package:feniq/features/warehouse_selection/data/models/warehouse_list_result.dart, package:feniq/features/warehouse_selection/data/models/warehouse_profile_model.dart, package:feniq/features/warehouse_selection/data/repositories/warehouse_repository.dart, getWarehouseProfile, getWarehouses, _apiClient, getWarehouseProfile (+17 more)

### Community 85 - "app: catalog + app: reviews"
Cohesion: 0.07
Nodes (25): CategoryModel, fromJson, icon, id, nameAr, nameEn, sortOrder, discountPercentage (+17 more)

### Community 86 - "shared + api: ledgerVerifier (services)"
Cohesion: 0.10
Nodes (24): connectDB(), env, mongoose, app, { connectDB }, { ensureDiscountCodeIndexes }, { ensureFinancialIndexes }, env (+16 more)

### Community 87 - "app: complaints + app: catalog"
Cohesion: 0.09
Nodes (26): package:feniq/core/widgets/app_snackbar.dart, package:feniq/core/widgets/primary_button.dart, package:feniq/core/widgets/quantity_stepper.dart, package:feniq/features/complaints/presentation/managers/submit_complaint_cubit.dart, package:feniq/features/complaints/presentation/managers/submit_complaint_state.dart, build, createState, initialQuantity (+18 more)

### Community 88 - "api: order (controllers)"
Cohesion: 0.12
Nodes (26): { ApiError }, { asyncHandler }, cancel, create, discountCodeViewModel, getOne, { getRate }, list (+18 more)

### Community 89 - "api: businessTime (utils) + api: settlement (services)"
Cohesion: 0.15
Nodes (24): resolvePeriod(), platformCompensationOf(), commissionClawbackFor(), compensationClawbackFor(), getSettlementForWarehouse(), LedgerEntry, mongoose, Order (+16 more)

### Community 90 - "app: auth + shared"
Cohesion: 0.08
Nodes (26): LatLng, package:flutter_map/flutter_map.dart, package:geolocator/geolocator.dart, package:latlong2/latlong.dart, build, _center, createState, _debounce (+18 more)

### Community 91 - "app: catalog + shared"
Cohesion: 0.07
Nodes (26): package:feniq/core/utils/pricing.dart, bonuses, categoryId, discountPriceUsd, finalPriceSyp, finalSypAt, fromJson, hasActiveOffer (+18 more)

### Community 92 - "app: routes"
Cohesion: 0.07
Nodes (27): _, accountHistory, approvalPending, cart, catalog, complaintDetail, complaints, debtDetail (+19 more)

### Community 93 - "app: routes"
Cohesion: 0.07
Nodes (27): _, accountHistory, approvalPending, cart, catalog, complaintDetail, complaints, debtDetail (+19 more)

### Community 94 - "web: businessDate + web: AdminCommissionPage"
Cohesion: 0.19
Nodes (22): AdminCommissionPage(), CollectionHistory(), OutstandingAmount(), RecordCollectionForm(), ReverseCollectionModal(), StatCard(), WarehouseCommissionDetail(), handleCallPharmacyViaWhatsApp() (+14 more)

### Community 95 - "api: index (realtime) + api: events (realtime)"
Cohesion: 0.12
Nodes (23): backend_src_realtime_events_admin_room, EVENTS, warehouseRoom(), { authenticateToken }, emitToRoom(), env, { EVENTS, warehouseRoom, ADMIN_ROOM }, extractToken() (+15 more)

### Community 96 - "app: catalog + app: core"
Cohesion: 0.08
Nodes (24): catalog_state.dart, Duration, package:feniq/core/utils/debouncer.dart, cancel, Debouncer, duration, run, _timer (+16 more)

### Community 97 - "app: core + shared"
Cohesion: 0.08
Nodes (25): FocusNode, build, _commitTyped, compact, _controller, createState, decrementTooltip, didUpdateWidget (+17 more)

### Community 98 - "app: cart + app: warehouse_selection"
Cohesion: 0.08
Nodes (24): num?, CartQuote, code, discountSyp, finalSyp, fromJson, hasCode, platformDiscountSyp (+16 more)

### Community 99 - "app: app_update + shared"
Cohesion: 0.09
Nodes (24): package:feniq/core/services/app_update_service.dart, package:feniq/core/services/navigation_service.dart, package:feniq/features/app_update/presentation/app_update_dialog.dart, AppUpdateService, _AppUpdateDialog, _AppUpdateDialogState, build, createState (+16 more)

### Community 100 - "api: exchangeRate (services) + api: exchangeRate (models)"
Cohesion: 0.13
Nodes (21): exchangeRateSchema, { Schema, model }, exchangeRateHistorySchema, { Schema, model }, { ApiError }, attemptRefresh(), ExchangeRate, ExchangeRateHistory (+13 more)

### Community 101 - "api: return (services) + api: return (models)"
Cohesion: 0.12
Nodes (23): returnItemSchema, returnSchema, { Schema, model }, listReturnableOrders(), { ApiError }, assertDelivered(), assertWithinReturnWindow(), createReturn() (+15 more)

### Community 102 - "api: catalogRequest (services) + api: nameLanguage (utils)"
Cohesion: 0.11
Nodes (22): announce(), { ApiError }, approveRequest(), { buildProductWrite }, CatalogRequest, Category, { emitToAdmins, emitToWarehouse, EVENTS }, findPendingRequestOrThrow() (+14 more)

### Community 103 - "api: ledger (services)"
Cohesion: 0.14
Nodes (21): { ApiError }, Counter, DIRECTION_REQUIRED_KINDS, LedgerAccount, LedgerEntry, mongoose, nextEntryNumber(), openingBalanceFor() (+13 more)

### Community 104 - "api: warehouseReturn (services) + api: return (services)"
Cohesion: 0.11
Nodes (24): attachOrderContext(), listReturnsForPharmacy(), { ApiError }, approveReturn(), attachContextAndPharmacy(), { attachOrderContext }, discountCodes, { emitToWarehouse, EVENTS } (+16 more)

### Community 105 - "api: warehouseAdvertisement (services)"
Cohesion: 0.14
Nodes (24): Advertisement, { ApiError }, { applyResolvedIdentity }, { assertRateUsedIsCurrent }, attachProducts(), buildAdvertisementFields(), Counter, createAdvertisement() (+16 more)

### Community 106 - "app: complaints + shared"
Cohesion: 0.10
Nodes (24): package:feniq/features/complaints/presentation/managers/my_complaints_cubit.dart, package:feniq/features/complaints/presentation/managers/my_complaints_state.dart, package:feniq/features/complaints/presentation/widgets/complaint_list_tile.dart, _openComplaintDetail, MyComplaintsCubit, MyComplaintsState, build, createState (+16 more)

### Community 107 - "app: advertisements"
Cohesion: 0.08
Nodes (24): AdvertisementItemModel, fromJson, hasSaving, id, image, imageUrl, isAvailable, items (+16 more)

### Community 108 - "app: returns"
Cohesion: 0.08
Nodes (24): createdAt, creditSyp, creditUsd, customReason, fromJson, id, images, isApproved (+16 more)

### Community 109 - "app: offers"
Cohesion: 0.08
Nodes (23): discountPercentage, discountPriceUsd, endDate, fromJson, hasSaving, id, image, isAvailable (+15 more)

### Community 110 - "web: realtimeClient + shared"
Cohesion: 0.14
Nodes (6): ref_socket_io_client, realtimeClient, safely(), factory(), makeFakeSocket(), newClient()

### Community 111 - "web: CatalogPickers + web: ProductPicker"
Cohesion: 0.17
Nodes (15): CatalogItemPicker(), ManufacturerPicker(), ProductPicker(), useLatestSearch(), initialForm(), OfferModal(), toDateInputValue(), i18nFor() (+7 more)

### Community 112 - "api: adminBanner (services)"
Cohesion: 0.15
Nodes (21): { ApiError }, { applyResolvedIdentity }, approveBanner(), Banner, Counter, createAdminBanner(), deleteBanner(), deleteBannerImage() (+13 more)

### Community 113 - "api: adminDiscountCode (services)"
Cohesion: 0.17
Nodes (20): { ApiError }, approveCode(), assertExpectedVersion(), assertPharmacyIsApproved(), codeNotFound(), core, createCode(), DiscountCode (+12 more)

### Community 114 - "api: warehouseOrder (viewmodels) + api: admin (viewmodels)"
Cohesion: 0.19
Nodes (18): { serializeUser, serializePharmacy, serializeWarehouse }, toAccountItem(), toAccountsResponse(), toPendingAccountItem(), toPendingAccountsResponse(), serializePharmacy(), serializeUser(), serializeWarehouse() (+10 more)

### Community 115 - "app: core + shared"
Cohesion: 0.09
Nodes (21): BorderRadius?, BoxFit, package:cached_network_image/cached_network_image.dart, AppNetworkImage, borderRadius, build, _clip, crop (+13 more)

### Community 116 - "app: order_tracking + app: reviews"
Cohesion: 0.10
Nodes (19): dart:developer, order_tracking_state.dart, package:feniq/features/reviews/data/models/review_model.dart, package:feniq/features/reviews/data/repositories/review_repository.dart, pharmacy_reviews_state.dart, cancel, confirmDelivery, load (+11 more)

### Community 117 - "app: debts + shared"
Cohesion: 0.10
Nodes (18): debt_detail_state.dart, debt_repository.dart, debts_state.dart, package:feniq/features/debts/data/models/debt_detail_model.dart, package:feniq/features/debts/data/models/warehouse_debt_model.dart, package:feniq/features/debts/data/repositories/debt_repository.dart, DebtRepository, getDebtDetail (+10 more)

### Community 118 - "app: account_history + shared"
Cohesion: 0.09
Nodes (19): package:feniq/features/account_history/data/models/savings_summary.dart, advertisementSyp, discountCodeSyp, empty, fromJson, offerAndManufacturerSyp, platformDiscountSyp, SavingsSummary (+11 more)

### Community 119 - "api: review (services) + api: order (models)"
Cohesion: 0.10
Nodes (17): orderDiscountCodeSchema, orderPackageGroupSchema, orderPackageItemSchema, orderPackageSnapshotSchema, orderSchema, { Schema, model }, statusHistoryEntrySchema, reviewSchema (+9 more)

### Community 120 - "web: accountsFilters + web: AccountsPage"
Cohesion: 0.19
Nodes (13): ACCOUNT_TYPES, coerceStatusForType(), PHARMACY_STATUSES, statusOptionsForType(), WAREHOUSE_STATUSES, accountName(), ResetPasswordModal(), translateResetError() (+5 more)

### Community 121 - "api: orderLedger (services) + api: ledgerEntry (models)"
Cohesion: 0.11
Nodes (14): counterSchema, { Schema, model }, ENTRY_KINDS, ledgerEntrySchema, { Schema, model }, chargeMetadata(), Counter, financialAudit (+6 more)

### Community 122 - "api: warehouseDiscountCode (services) + api: discountCode (models)"
Cohesion: 0.13
Nodes (16): discountCodeSchema, discountCodeUpdateSchema, { Schema, model }, ledgerAccountSchema, { Schema, model }, { ApiError }, assertPharmacyIsCustomer(), core (+8 more)

### Community 123 - "api: complaint (services) + api: user (models)"
Cohesion: 0.12
Nodes (18): deviceTokenSchema, { Schema, model }, userSchema, { ApiError }, cleanOptionalExtra(), Complaint, Counter, createComplaint() (+10 more)

### Community 124 - "app: exchange_rate + shared"
Cohesion: 0.10
Nodes (18): exchange_rate_state.dart, package:feniq/features/exchange_rate/data/models/exchange_rate_model.dart, package:feniq/features/exchange_rate/data/repositories/exchange_rate_repository.dart, ExchangeRateRepository, getExchangeRate, ExchangeRateRepositoryImpl, _exchangeRateRepository, _fetch (+10 more)

### Community 125 - "app: core + shared"
Cohesion: 0.10
Nodes (19): int? height,
  bool, alreadyTransformed, _cloudinaryHost, cloudinaryOptimizedUrl, contains, crop, firstSegment, hasHeight (+11 more)

### Community 126 - "app: returns"
Cohesion: 0.10
Nodes (19): deliveredAt, discountPrice, finalPrice, fromJson, hoursRemaining, id, isEndingSoon, items (+11 more)

### Community 127 - "api: warehouseCatalog (controllers) + api: productCatalog (viewmodels)"
Cohesion: 0.12
Nodes (15): { ApiError }, { asyncHandler }, catalogRequestService, catalogRequestViewModel, catalogService, catalogViewModel, myRequests, { parseCursorQuery, parseObjectIdCursor, paginationMeta } (+7 more)

### Community 128 - "app: warehouse_selection + shared"
Cohesion: 0.11
Nodes (17): package:feniq/features/warehouse_selection/data/models/warehouse_model.dart, cityFilterApplied, fromJson, pharmacyCity, WarehouseListResult, warehouses, cityFilterApplied, cityScopeAvailable (+9 more)

### Community 129 - "app: core + shared"
Cohesion: 0.11
Nodes (17): package:firebase_core/firebase_core.dart, package:flutter/foundation.dart, FcmService, memberCount, _members, register, resetAll, resetForSignOut (+9 more)

### Community 130 - "app: legal + shared"
Cohesion: 0.12
Nodes (19): _, _arabicSections, _arMonths, blocks, _englishSections, _enMonths, formattedLastUpdated, items (+11 more)

### Community 131 - "api: notification (services) + api: notification (models)"
Cohesion: 0.16
Nodes (16): backend_src_config_firebase_messaging, notificationSchema, { Schema, model }, chunk(), DEAD_TOKEN_ERROR_CODES, debugLog(), isRateLimited(), mapWithConcurrency() (+8 more)

### Community 132 - "api: accountStatement (services)"
Cohesion: 0.17
Nodes (17): { ApiError }, emptySummary(), { escapeRegex }, getPharmacyAccountsSummary(), getStatement(), ledger, LedgerAccount, listAccountsForWarehouse() (+9 more)

### Community 133 - "app: cart + app: returns"
Cohesion: 0.11
Nodes (15): package:feniq/features/cart/data/models/cart_item.dart, package:feniq/generated/app_localizations.dart, describePriceProblems, describeStockProblems, describeUnavailablePackages, _findItem, join, lines (+7 more)

### Community 134 - "app: core + shared"
Cohesion: 0.12
Nodes (16): AppLocalizations get, BuildContext, ColorScheme get, double get, BuildContextExtensions, colorScheme, isDarkMode, l10n (+8 more)

### Community 135 - "api: warehouseBalance (controllers)"
Cohesion: 0.12
Nodes (16): { ApiError }, { asyncHandler }, getOne, invoice, invoiceViewModel, list, { loadWarehouseOrThrow }, mongoose (+8 more)

### Community 136 - "api: warehouseComplaint (services) + api: complaint (services)"
Cohesion: 0.16
Nodes (15): COMPLAINT_STATUSES, complaintSchema, { Schema, model }, attachComplaintContext(), getComplaintForPharmacy(), listComplaintsForPharmacy(), loadResponder(), paginateComplaints() (+7 more)

### Community 137 - "api: sms (services)"
Cohesion: 0.15
Nodes (8): ConsoleSmsProvider, { SmsProvider }, { ConsoleSmsProvider }, env, factories, instances, { SmsProvider }, SmsProvider

### Community 138 - "api: warehouse (services) + api: cityMatch (utils)"
Cohesion: 0.17
Nodes (15): { ApiError }, { canonicalCity, citiesMatch }, getWarehouseProfile(), listAvailableWarehouses(), { listReviewsForWarehouse }, mongoose, Pharmacy, User (+7 more)

### Community 139 - "app: core + shared"
Cohesion: 0.12
Nodes (16): FirebaseRemoteConfig get, package:firebase_remote_config/firebase_remote_config.dart, _defaults, _initialised, initialize, keyLatestVersion, keyMinVersion, keyUpdateUrl (+8 more)

### Community 140 - "app: core + shared"
Cohesion: 0.12
Nodes (17): Map, _, code, details, errMessage, Failure, FailureCode, fromDioError (+9 more)

### Community 141 - "api: adminCommission (controllers) + api: commissionCollection (viewmodels)"
Cohesion: 0.16
Nodes (14): { asyncHandler }, overview, { parseCursorQuery, parseObjectIdCursor }, recordCollection, reverseCollection, service, viewModel, warehouseDetail (+6 more)

### Community 142 - "api: adminOffer (controllers) + api: adminOffer (viewmodels)"
Cohesion: 0.15
Nodes (14): adminOfferService, adminOfferViewModel, approve, { asyncHandler }, listAll, listPending, { parseCursorQuery, parseObjectIdCursor, paginationMeta }, reject (+6 more)

### Community 143 - "api: return (controllers)"
Cohesion: 0.19
Nodes (15): { ApiError }, { asyncHandler }, create, list, loadPharmacyOrThrow(), { parseCursorQuery, parseObjectIdCursor, paginationMeta }, parseJsonField(), Pharmacy (+7 more)

### Community 144 - "api: adminComplaint (services)"
Cohesion: 0.21
Nodes (15): { ApiError }, assertValidStatus(), { attachComplaintContext, paginateComplaints, loadResponder }, Complaint, complaintStatuses(), { emitToAdmins, emitToWarehouse, EVENTS }, emitUpdated(), getComplaint() (+7 more)

### Community 145 - "api: discountCode (viewmodels) + api: invoice (viewmodels)"
Cohesion: 0.19
Nodes (13): displayStatusOf(), fundedByFor(), termsOf(), { displayStatusOf, fundedByFor }, serializeDiscountCode(), serializeOrderDiscountCode(), serializeRef(), serializeTerms() (+5 more)

### Community 146 - "app: core + shared"
Cohesion: 0.12
Nodes (14): ../constants/app_strings.dart, ../extensions/build_context_extensions.dart, IconData, build, EmptyView, icon, message, subtitle (+6 more)

### Community 147 - "app: cart"
Cohesion: 0.12
Nodes (15): discountPrice, freeQuantity, fromJson, hasOffer, id, lineTotal, manufacturerAr, manufacturerEn (+7 more)

### Community 148 - "api: otp (services) + api: otp (models)"
Cohesion: 0.17
Nodes (13): OTP_PURPOSES, otpSchema, { Schema, model }, { ApiError }, codesMatch(), crypto, deliverSms(), generateCode() (+5 more)

### Community 149 - "api: warehouseReview (services) + api: pharmacy (models)"
Cohesion: 0.16
Nodes (13): pharmacySchema, { Schema, model }, { ApiError }, createPharmacyReview(), getReviewStatsForWarehouse(), listPaginatedReviewsForWarehouse(), mongoose, Order (+5 more)

### Community 150 - "api: complaint (viewmodels)"
Cohesion: 0.30
Nodes (14): base(), contextTypeOf(), serializeForAdmin(), serializeForPharmacy(), serializeForWarehouse(), serializePharmacyRef(), serializeResponder(), serializeWarehouseRef() (+6 more)

### Community 151 - "app: core + shared"
Cohesion: 0.13
Nodes (15): ../constants/password_policy.dart, ../extensions/string_extensions.dart, _, minPasswordLength, _syrianPhoneRegExp, validateConfirmPassword, validateEmail, validateNewPassword (+7 more)

### Community 152 - "app: core + app: exchange_rate"
Cohesion: 0.13
Nodes (13): double?, BrandLogo, build, height, mark, _markOnly, onDark, _Variant (+5 more)

### Community 153 - "app: advertisements + shared"
Cohesion: 0.16
Nodes (11): advertisements_repository.dart, package:feniq/core/models/paginated_result.dart, package:feniq/features/advertisements/data/models/advertisement_cart_preparation.dart, package:feniq/features/advertisements/data/models/advertisement_model.dart, getActiveAdvertisements, AdvertisementsRepositoryImpl, _apiClient, getActiveAdvertisements (+3 more)

### Community 154 - "api: review (controllers) + api: review (viewmodels)"
Cohesion: 0.19
Nodes (11): { ApiError }, { asyncHandler }, create, list, loadPharmacyOrThrow(), Pharmacy, reviewService, reviewViewModel (+3 more)

### Community 155 - "api: returnCredit (services) + api: orderItem (models)"
Cohesion: 0.19
Nodes (12): orderItemSchema, { Schema, model }, { ApiError }, computeCredit(), LedgerEntry, Order, OrderItem, { platformCompensationOf } (+4 more)

### Community 156 - "app: core + shared"
Cohesion: 0.14
Nodes (13): AppTextField, build, controller, hint, inputFormatters, keyboardType, label, maxLines (+5 more)

### Community 157 - "app: complaints"
Cohesion: 0.14
Nodes (13): ComplaintInput, createComplaint, description, extraDetails, general, getComplaint, getComplaints, order (+5 more)

### Community 158 - "app: returns"
Cohesion: 0.14
Nodes (13): copyWith, errorCode, errorMessage, hasMore, isLoadingMore, loadMoreErrorCode, loadMoreErrorMessage, MyReturnsState (+5 more)

### Community 159 - "web: offersFilters + web: WarehouseOffersPage"
Cohesion: 0.32
Nodes (9): filterOffers(), isInReview(), matchesOfferFilter(), OFFER_FILTERS, offerEditSource(), reviewCount(), NOW, toNumberOrNull() (+1 more)

### Community 160 - "api: adminExchangeRate (controllers) + api: exchangeRate (viewmodels)"
Cohesion: 0.17
Nodes (10): { asyncHandler }, exchangeRateService, exchangeRateViewModel, getRate, listHistory, { parseCursorQuery, parseObjectIdCursor, paginationMeta }, resetToApi, setManualRate (+2 more)

### Community 161 - "api: warehousePayment (controllers) + api: payment (viewmodels)"
Cohesion: 0.22
Nodes (11): { ApiError }, { asyncHandler }, create, { loadWarehouseOrThrow }, parseIdempotencyKey(), paymentService, paymentViewModel, respond() (+3 more)

### Community 162 - "api: warehouseReview (controllers) + api: warehouseReview (viewmodels)"
Cohesion: 0.18
Nodes (10): { asyncHandler }, create, list, { loadWarehouseOrThrow }, { parseCursorQuery, parseObjectIdCursor, paginationMeta }, warehouseReviewService, warehouseReviewViewModel, resolveReviewerName() (+2 more)

### Community 163 - "api: warehouseReturn (viewmodels) + api: return (viewmodels)"
Cohesion: 0.26
Nodes (9): serializeReturn(), serializeReturnItem(), toReturnListItemSummary(), toReturnListResponse(), toReturnResponse(), { serializeReturn }, serializeWarehouseReturn(), toWarehouseReturnDetailResponse() (+1 more)

### Community 164 - "app: core + shared"
Cohesion: 0.15
Nodes (12): package:flutter/services.dart, build, controller, digits, label, onChanged, phoneCountryCode, phoneLocalPrefix (+4 more)

### Community 165 - "app: core + shared"
Cohesion: 0.15
Nodes (13): _, AppSizes, buttonHeight, iconSizeLarge, iconSizeMedium, iconSizeSmall, inputHeight, spacingLarge (+5 more)

### Community 166 - "api: adminDiscountCode (controllers)"
Cohesion: 0.18
Nodes (11): approve, { asyncHandler }, create, list, { parseCursorQuery, parseObjectIdCursor, paginationMeta }, queryString(), reject, service (+3 more)

### Community 167 - "api: warehouse (controllers) + api: warehouse (viewmodels)"
Cohesion: 0.21
Nodes (10): { asyncHandler }, list, profile, warehouseService, warehouseViewModel, resolveReviewerName(), serializeReview(), serializeWarehouse() (+2 more)

### Community 168 - "app: settings + shared"
Cohesion: 0.17
Nodes (11): Locale?, ProfileView, SettingsCubit, copyWith, fontScale, locale, notificationsEnabled, SettingsState (+3 more)

### Community 169 - "app: auth + shared"
Cohesion: 0.17
Nodes (11): package:feniq/features/auth/data/models/auth_response.dart, package:feniq/features/auth/data/models/me_response.dart, AuthRepository, deleteAccount, deleteDeviceToken, getMe, AuthRepositoryImpl, loginWithPassword (+3 more)

### Community 170 - "app: core + shared"
Cohesion: 0.17
Nodes (12): _, AppTextTheme, bold, dark, fontFamily, light, medium, regular (+4 more)

### Community 171 - "app: my_orders"
Cohesion: 0.17
Nodes (11): copyWith, errorCode, errorMessage, hasMore, isLoadingMore, loadMoreErrorCode, loadMoreErrorMessage, MyOrdersStatus (+3 more)

### Community 172 - "api: complaint (controllers)"
Cohesion: 0.24
Nodes (10): { ApiError }, { asyncHandler }, complaintService, complaintViewModel, create, getOne, list, loadPharmacyOrThrow() (+2 more)

### Community 173 - "api: financialAudit (services) + api: financialAuditLog (models)"
Cohesion: 0.20
Nodes (5): ACTIONS, financialAuditLogSchema, { Schema, model }, FinancialAuditLog, REASON_REQUIRED

### Community 174 - "app: banners + shared"
Cohesion: 0.20
Nodes (8): banners_state.dart, package:feniq/features/banners/data/models/banner_model.dart, package:feniq/features/banners/data/repositories/banners_repository.dart, BannersRepository, getActiveBanners, BannersRepositoryImpl, _bannersRepository, load

### Community 175 - "app: core + shared"
Cohesion: 0.22
Nodes (9): ../constants/app_duration.dart, build, child, createState, _pressed, PressScale, _PressScaleState, scale (+1 more)

### Community 176 - "app: core + shared"
Cohesion: 0.20
Nodes (9): NumberFormat, formatMoneyFromUsd, formatMoneySyp, formatSyp, _grouped, kMoneyUnavailable, syp, sypAmount (+1 more)

### Community 177 - "app: core + shared"
Cohesion: 0.20
Nodes (9): package:url_launcher/url_launcher.dart, digitsOnly, launchUrl, launchWhatsApp, normalized, normalizeSyrianPhoneForWhatsApp, supportWhatsAppPhone, uri (+1 more)

### Community 178 - "app: core + shared"
Cohesion: 0.20
Nodes (10): _, AppDuration, long, medium, pressScale, pulse, short, stageTransition (+2 more)

### Community 179 - "api: adminDiscountCode (routes) + api: adminLedger (routes)"
Cohesion: 0.21
Nodes (6): { authenticate, authorize }, controller, { Router }, { authenticate, authorize }, controller, { Router }

### Community 180 - "shared + app: core"
Cohesion: 0.25
Nodes (7): GlobalKey, NavigatorState, package:flutter/widgets.dart, instance, NavigationService, navigatorKey, static final NavigationService

### Community 181 - "app: core + app: config"
Cohesion: 0.25
Nodes (8): _, apiBaseUrl, AppConfig, _, authToken, refreshToken, StorageKeys, static const String

### Community 182 - "app: core + shared"
Cohesion: 0.25
Nodes (8): _, AppRadius, badge, full, large, medium, small, static const BorderRadius

### Community 183 - "app: core + shared"
Cohesion: 0.29
Nodes (6): Logger, package:logger/logger.dart, error, info, _logger, LoggerService

### Community 184 - "app: core + shared"
Cohesion: 0.29
Nodes (7): _, AppPadding, button, card, input, screen, static const EdgeInsets

### Community 185 - "api: banner (models) + api: banner (services)"
Cohesion: 0.33
Nodes (3): bannerSchema, { Schema, model }, Banner

### Community 186 - "api: idempotency (utils) + api: payment (services)"
Cohesion: 0.33
Nodes (5): findReplayOrReject(), { ApiError }, crypto, idempotencyKeyReusedError(), ref_crypto

### Community 187 - "app: core + shared"
Cohesion: 0.33
Nodes (5): Connectivity, package:connectivity_plus/connectivity_plus.dart, _connectivity, ConnectivityService, ensureConnected

### Community 188 - "app: core + shared"
Cohesion: 0.33
Nodes (5): num? manufacturerDiscountPercentage,
  bool, displayedPriceSyp, finalPriceSypAt, hasDiscountInputs, price

### Community 189 - "api: warehouseOffer (viewmodels)"
Cohesion: 0.70
Nodes (4): serializeOffer(), serializePendingUpdate(), toOfferListResponse(), toOfferResponse()

### Community 190 - "app: core + shared"
Cohesion: 0.40
Nodes (5): package:intl/intl.dart, _, DateFormatter, formatDate, formatDateTime

### Community 191 - "app: core"
Cohesion: 0.40
Nodes (5): _, AppVersion, compare, isLessThan, parse

### Community 192 - "api: adminBanner (viewmodels)"
Cohesion: 0.83
Nodes (3): serializeAdminBanner(), toAdminBannerResponse(), toAdminBannersResponse()

### Community 193 - "api: manufacturerDiscount (viewmodels)"
Cohesion: 0.83
Nodes (3): serializeDiscount(), toDiscountListResponse(), toDiscountResponse()

### Community 194 - "app: catalog"
Cohesion: 0.50
Nodes (3): CatalogRouteArgs, manufacturer, warehouseName

### Community 195 - "app: exchange_rate"
Cohesion: 0.50
Nodes (3): ExchangeRateModel, fromJson, usdToSyp

## Knowledge Gaps
- **3353 isolated node(s):** `express`, `cors`, `helmet`, `morgan`, `mongoSanitize` (+3348 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 3738 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `announceRecall()` connect `api: productCatalog (services) + api: importSynonyms (config)` to `api: adminAdvertisement (services) + api: index (realtime)`, `api: admin (services) + api: refreshToken (models)`, `api: index (realtime) + api: events (realtime)`?**
  _High betweenness centrality (0.000) - this node is a cross-community bridge._
- **What connects `express`, `cors`, `helmet` to the rest of the system?**
  _3353 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `app: auth + shared` be split into smaller, more focused modules?**
  _Cohesion score 0.01956882255389718 - nodes in this community are weakly interconnected._
- **Should `app: warehouse_selection + app: profile` be split into smaller, more focused modules?**
  _Cohesion score 0.02623539982030548 - nodes in this community are weakly interconnected._
- **Should `api: productCatalog (services) + api: importSynonyms (config)` be split into smaller, more focused modules?**
  _Cohesion score 0.03882741215298 - nodes in this community are weakly interconnected._
- **Should `app: catalog + app: promotions` be split into smaller, more focused modules?**
  _Cohesion score 0.025558419243986254 - nodes in this community are weakly interconnected._
- **Should `api: adminCatalog (controllers) + api: admin (controllers)` be split into smaller, more focused modules?**
  _Cohesion score 0.034161490683229816 - nodes in this community are weakly interconnected._