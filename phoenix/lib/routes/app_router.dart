import 'package:feniq/features/warehouse/presentation/views/warehouse_delivery_view.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_insights_cubit.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_insights_view.dart';
import 'package:flutter/material.dart'; // Driver shell, BuildContext and navigation diagnostics
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:feniq/core/services/navigation_service.dart';
import 'package:feniq/features/account_history/data/repositories/savings_repository.dart';
import 'package:feniq/features/account_history/presentation/managers/savings_cubit.dart';
import 'package:feniq/features/account_history/presentation/views/account_history_view.dart';
import 'package:feniq/features/advertisements/data/repositories/advertisements_repository.dart';
import 'package:feniq/features/auth/data/models/registration_draft.dart';
import 'package:feniq/features/auth/presentation/managers/auth_cubit.dart';
import 'package:feniq/features/auth/presentation/managers/auth_state.dart';
import 'package:feniq/features/auth/presentation/views/change_password_view.dart';
import 'package:feniq/features/auth/presentation/views/approval_pending_view.dart';
import 'package:feniq/features/auth/presentation/views/otp_verification_view.dart';
import 'package:feniq/features/auth/presentation/views/password_login_view.dart';
import 'package:feniq/features/auth/presentation/views/registration_view.dart';
import 'package:feniq/features/auth/presentation/views/splash_view.dart';
import 'package:feniq/features/cart/data/repositories/order_repository.dart';
import 'package:feniq/features/cart/presentation/views/cart_view.dart';
import 'package:feniq/features/catalog/data/models/catalog_route_args.dart';
import 'package:feniq/features/catalog/data/models/manufacturers_route_args.dart';
import 'package:feniq/features/catalog/data/repositories/catalog_repository.dart';
import 'package:feniq/features/catalog/presentation/managers/catalog_cubit.dart';
import 'package:feniq/features/catalog/presentation/managers/manufacturers_cubit.dart';
import 'package:feniq/features/catalog/presentation/views/catalog_view.dart';
import 'package:feniq/features/catalog/presentation/views/manufacturers_view.dart';
import 'package:feniq/features/complaints/data/models/complaint_model.dart';
import 'package:feniq/features/complaints/data/models/submit_complaint_args.dart';
import 'package:feniq/features/complaints/data/repositories/complaint_repository.dart';
import 'package:feniq/features/complaints/presentation/managers/complaint_detail_cubit.dart';
import 'package:feniq/features/complaints/presentation/managers/my_complaints_cubit.dart';
import 'package:feniq/features/complaints/presentation/managers/submit_complaint_cubit.dart';
import 'package:feniq/features/complaints/presentation/views/complaint_detail_view.dart';
import 'package:feniq/features/complaints/presentation/views/my_complaints_view.dart';
import 'package:feniq/features/complaints/presentation/views/submit_complaint_view.dart';
import 'package:feniq/features/debts/data/repositories/debt_repository.dart';
import 'package:feniq/features/debts/presentation/managers/debt_detail_cubit.dart';
import 'package:feniq/features/debts/presentation/managers/debts_cubit.dart';
import 'package:feniq/features/debts/presentation/views/debt_detail_view.dart';
import 'package:feniq/features/debts/presentation/views/my_debts_view.dart';
import 'package:feniq/features/my_orders/presentation/managers/my_orders_cubit.dart';
import 'package:feniq/features/my_orders/presentation/views/my_orders_view.dart';
import 'package:feniq/features/notifications/presentation/views/notification_center_view.dart';
import 'package:feniq/features/offers/data/repositories/offers_repository.dart';
import 'package:feniq/features/order_tracking/presentation/managers/order_tracking_cubit.dart';
import 'package:feniq/features/order_tracking/presentation/views/order_tracking_view.dart';
import 'package:feniq/features/profile/presentation/views/profile_view.dart';
import 'package:feniq/features/promotions/presentation/managers/promotions_cubit.dart';
import 'package:feniq/features/promotions/presentation/managers/warehouse_offers_cubit.dart';
import 'package:feniq/features/promotions/presentation/views/promotions_view.dart';
import 'package:feniq/features/promotions/presentation/views/warehouse_offers_view.dart';
import 'package:feniq/features/returns/data/repositories/return_repository.dart';
import 'package:feniq/features/returns/presentation/managers/my_returns_cubit.dart';
import 'package:feniq/features/returns/presentation/views/my_returns_view.dart';
import 'package:feniq/features/rep/data/repositories/rep_repository.dart';
import 'package:feniq/features/driver/data/driver_trip_repository.dart';
import 'package:feniq/features/driver/presentation/driver_trips_tab.dart';
import 'package:feniq/features/rep/data/services/location_provider.dart';
import 'package:feniq/features/rep/presentation/managers/rep_home_cubit.dart';
import 'package:feniq/features/rep/presentation/managers/rep_pharmacies_cubit.dart';
import 'package:feniq/features/rep/presentation/managers/rep_pharmacy_detail_cubit.dart';
import 'package:feniq/features/rep/presentation/managers/rep_visits_cubit.dart';
import 'package:feniq/features/rep/presentation/managers/visit_code_cubit.dart';
import 'package:feniq/features/rep/presentation/managers/visit_scan_cubit.dart';
import 'package:feniq/features/rep/presentation/views/pharmacy_visit_code_view.dart';
import 'package:feniq/features/rep/presentation/views/rep_pharmacy_detail_view.dart';
import 'package:feniq/features/rep/presentation/views/visit_scan_view.dart';
import 'package:feniq/features/rep/presentation/views/rep_shell_view.dart';
import 'package:feniq/features/panel/panel_home_view.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_management_repository.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_orders_repository.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_accounts_cubit.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_summary_cubit.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_loyalty_cubit.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_loyalty_view.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_feature_preferences_view.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_feature_preferences_repository.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_rep_detail_cubit.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_reps_cubit.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_returns_cubit.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_rep_detail_view.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_return_detail_view.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_statement_view.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_order_detail_cubit.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_orders_cubit.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_order_detail_view.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_shell_view.dart';
import 'package:feniq/features/reviews/data/repositories/review_repository.dart';
import 'package:feniq/features/reviews/presentation/managers/pharmacy_reviews_cubit.dart';
import 'package:feniq/features/reviews/presentation/views/pharmacy_reviews_view.dart';
import 'package:feniq/features/warehouse_selection/data/repositories/warehouse_repository.dart';
import 'package:feniq/features/warehouse_selection/presentation/managers/warehouse_profile_cubit.dart';
import 'package:feniq/features/warehouse_selection/presentation/views/warehouse_profile_view.dart';
import 'package:feniq/features/warehouse_selection/presentation/views/warehouse_selection_view.dart';

import 'app_page_transition.dart';
import 'route_names.dart';
import 'route_paths.dart';
import 'scaffold_with_bottom_nav.dart';

class AppRouter {
  AppRouter({this.driverTripRepository}) {
    // TEMP DIAGNOSTIC (router-lifecycle) - remove after verifying. `router`
    // below is `late final`, so exactly one GoRouter is built per AppRouter
    // instance: this line must appear ONCE for the whole app session and
    // never again on a theme/locale change.
    debugPrint(
      'ROUTER_DEBUG: AppRouter() constructed (#${identityHashCode(this)}) '
      '- GoRouter initialLocation=${RoutePaths.splash}',
    );
  }

  final DriverTripRepository? driverTripRepository;

  late final GoRouter router = GoRouter(
    navigatorKey: NavigationService.instance.navigatorKey,
    initialLocation: RoutePaths.splash,
    redirect: appRedirect,
    routes: <RouteBase>[
      GoRoute(
        name: RouteNames.splash,
        path: RoutePaths.splash,
        builder: (context, state) => const SplashView(),
      ),
      GoRoute(
        name: RouteNames.registration,
        path: RoutePaths.registration,
        pageBuilder: (context, state) =>
            buildPageTransition(state: state, child: const RegistrationView()),
      ),
      GoRoute(
        name: RouteNames.login,
        path: RoutePaths.login,
        pageBuilder: (context, state) =>
            buildPageTransition(state: state, child: const PasswordLoginView()),
      ),
      // Outside the shell: from Settings it pushes full-screen over the nav
      // bar, and as the forced change after an admin reset it is the only
      // screen there is (see forcePasswordChangeRedirect).
      GoRoute(
        name: RouteNames.changePassword,
        path: RoutePaths.changePassword,
        pageBuilder: (context, state) =>
            buildPageTransition(state: state, child: const ChangePasswordView()),
      ),
      GoRoute(
        name: RouteNames.otp,
        path: RoutePaths.otp,
        pageBuilder: (context, state) {
          final draft = state.extra;
          // No draft (e.g. a direct deep link) - send back to the form instead
          // of crashing on a bad cast.
          final child = draft is! RegistrationDraft
              ? const RegistrationView()
              : OtpVerificationView(draft: draft);
          return buildPageTransition(state: state, child: child);
        },
      ),
      GoRoute(
        name: RouteNames.approvalPending,
        path: RoutePaths.approvalPending,
        pageBuilder: (context, state) => buildPageTransition(
          state: state,
          child: const ApprovalPendingView(),
        ),
      ),
      GoRoute(
        name: RouteNames.warehouseProfile,
        path: RoutePaths.warehouseProfile,
        pageBuilder: (context, state) {
          final warehouseId = state.pathParameters['warehouseId']!;
          final warehouseName = state.extra is String
              ? state.extra as String
              : '';
          return buildPageTransition(
            state: state,
            child: BlocProvider(
              create: (context) => WarehouseProfileCubit(
                warehouseRepository: context.read<WarehouseRepository>(),
                warehouseId: warehouseId,
              )..load(),
              child: WarehouseProfileView(
                warehouseId: warehouseId,
                warehouseName: warehouseName,
              ),
            ),
          );
        },
      ),
      GoRoute(
        name: RouteNames.manufacturers,
        path: RoutePaths.manufacturers,
        pageBuilder: (context, state) {
          final warehouseId = state.pathParameters['warehouseId']!;
          final args = state.extra is ManufacturersRouteArgs
              ? state.extra as ManufacturersRouteArgs
              : const ManufacturersRouteArgs(warehouseName: '');
          return buildPageTransition(
            state: state,
            child: BlocProvider(
              create: (context) => ManufacturersCubit(
                catalogRepository: context.read<CatalogRepository>(),
                warehouseId: warehouseId,
              )..loadManufacturers(),
              child: ManufacturersView(
                warehouseId: warehouseId,
                warehouseName: args.warehouseName,
                autoFilterManufacturer: args.autoFilterManufacturer,
              ),
            ),
          );
        },
      ),
      GoRoute(
        name: RouteNames.catalog,
        path: RoutePaths.catalog,
        pageBuilder: (context, state) {
          final warehouseId = state.pathParameters['warehouseId']!;
          final args = state.extra is CatalogRouteArgs
              ? state.extra as CatalogRouteArgs
              : null;
          return buildPageTransition(
            state: state,
            child: BlocProvider(
              create: (context) => CatalogCubit(
                catalogRepository: context.read<CatalogRepository>(),
                warehouseId: warehouseId,
                manufacturer: args?.manufacturer ?? '',
                initialSearch: args?.initialSearch,
              )..initialize(),
              child: CatalogView(
                warehouseId: warehouseId,
                warehouseName: args?.warehouseName ?? '',
                manufacturer: args?.manufacturer ?? '',
                manufacturerTitle: args?.manufacturerTitle,
                initialSearch: args?.initialSearch,
              ),
            ),
          );
        },
      ),
      // What the Offers chip on the Offers & Ads tab opens: the offers of the
      // warehouse the pharmacist is ordering from (the cart's warehouse).
      // Outside the shell, so it pushes full-screen like the catalog it hands
      // off to; the warehouse name rides along in `extra` for the app bar.
      GoRoute(
        name: RouteNames.warehouseOffers,
        path: RoutePaths.warehouseOffers,
        pageBuilder: (context, state) {
          final warehouseId = state.pathParameters['warehouseId']!;
          final warehouseName = state.extra is String
              ? state.extra as String
              : '';
          return buildPageTransition(
            state: state,
            child: BlocProvider(
              create: (context) => WarehouseOffersCubit(
                offersRepository: context.read<OffersRepository>(),
                warehouseId: warehouseId,
              )..load(),
              child: WarehouseOffersView(warehouseName: warehouseName),
            ),
          );
        },
      ),
      GoRoute(
        name: RouteNames.cart,
        path: RoutePaths.cart,
        pageBuilder: (context, state) =>
            buildPageTransition(state: state, child: const CartView()),
      ),
      GoRoute(
        name: RouteNames.notifications,
        path: RoutePaths.notifications,
        pageBuilder: (context, state) => buildPageTransition(
          state: state,
          child: const NotificationCenterView(),
        ),
      ),
      // Section 1/2: complaints. `submit` is registered before `:complaintId`
      // so "/complaints/new" matches the form, not the detail-by-id route.
      GoRoute(
        name: RouteNames.complaints,
        path: RoutePaths.complaints,
        pageBuilder: (context, state) => buildPageTransition(
          state: state,
          child: BlocProvider(
            create: (context) => MyComplaintsCubit(
              complaintRepository: context.read<ComplaintRepository>(),
            )..load(),
            child: const MyComplaintsView(),
          ),
        ),
      ),
      GoRoute(
        name: RouteNames.submitComplaint,
        path: RoutePaths.submitComplaint,
        pageBuilder: (context, state) {
          // The originating screen passes a SubmitComplaintArgs (general /
          // warehouse / order). A bare open (e.g. a deep link) is a general
          // complaint.
          final args = state.extra is SubmitComplaintArgs
              ? state.extra as SubmitComplaintArgs
              : const SubmitComplaintArgs.general();
          return buildPageTransition(
            state: state,
            child: BlocProvider(
              create: (context) => SubmitComplaintCubit(
                complaintRepository: context.read<ComplaintRepository>(),
                args: args,
              ),
              child: const SubmitComplaintView(),
            ),
          );
        },
      ),
      GoRoute(
        name: RouteNames.complaintDetail,
        path: RoutePaths.complaintDetail,
        pageBuilder: (context, state) {
          final complaintId = state.pathParameters['complaintId']!;
          final seed = state.extra is ComplaintModel ? state.extra as ComplaintModel : null;
          return buildPageTransition(
            state: state,
            child: BlocProvider(
              create: (context) => ComplaintDetailCubit(
                complaintRepository: context.read<ComplaintRepository>(),
                complaintId: complaintId,
                seed: seed,
              )..load(),
              child: const ComplaintDetailView(),
            ),
          );
        },
      ),
      GoRoute(
        name: RouteNames.debtDetail,
        path: RoutePaths.debtDetail,
        pageBuilder: (context, state) {
          final warehouseId = state.pathParameters['warehouseId']!;
          final warehouseName = state.extra is String
              ? state.extra as String
              : '';
          return buildPageTransition(
            state: state,
            child: BlocProvider(
              create: (context) => DebtDetailCubit(
                debtRepository: context.read<DebtRepository>(),
                warehouseId: warehouseId,
              )..load(),
              child: DebtDetailView(warehouseName: warehouseName),
            ),
          );
        },
      ),
      // Returns and Debts used to be bottom-nav tabs; the Account History tab
      // took the returns slot, so both now push full-screen over the shell
      // (opened from the Account History cards, or a deep link). Each provides
      // the exact same cubit its old tab branch did.
      GoRoute(
        name: RouteNames.myReturns,
        path: RoutePaths.myReturns,
        pageBuilder: (context, state) => buildPageTransition(
          state: state,
          child: BlocProvider(
            create: (context) => MyReturnsCubit(
              returnRepository: context.read<ReturnRepository>(),
            )..load(),
            child: const MyReturnsView(),
          ),
        ),
      ),
      GoRoute(
        name: RouteNames.myDebts,
        path: RoutePaths.myDebts,
        pageBuilder: (context, state) => buildPageTransition(
          state: state,
          child: BlocProvider(
            create: (context) => DebtsCubit(
              debtRepository: context.read<DebtRepository>(),
            )..load(),
            child: const MyDebtsView(),
          ),
        ),
      ),
      // The pharmacist's own ratings list, opened from the Profile screen's
      // compact Ratings entry - the full list ProfileView used to show inline.
      GoRoute(
        name: RouteNames.pharmacyReviews,
        path: RoutePaths.pharmacyReviews,
        pageBuilder: (context, state) => buildPageTransition(
          state: state,
          child: BlocProvider(
            create: (context) => PharmacyReviewsCubit(
              reviewRepository: context.read<ReviewRepository>(),
            )..load(),
            child: const PharmacyReviewsView(),
          ),
        ),
      ),
      GoRoute(
        name: RouteNames.orderTracking,
        path: RoutePaths.orderTracking,
        pageBuilder: (context, state) {
          final orderId = state.pathParameters['orderId']!;
          return buildPageTransition(
            state: state,
            child: BlocProvider(
              create: (context) => OrderTrackingCubit(
                orderRepository: context.read<OrderRepository>(),
                reviewRepository: context.read<ReviewRepository>(),
                warehouseRepository: context.read<WarehouseRepository>(),
                orderId: orderId,
              ),
              child: const OrderTrackingView(),
            ),
          );
        },
      ),
      // Section 6: the four persistent tabs. Each branch keeps its own
      // navigation stack alive (IndexedStack) - switching tabs doesn't rebuild
      // or reload the others. Everything above (catalog/cart/order tracking)
      // stays outside the shell so it pushes full-screen over the nav bar.
      // A warehouse account: its orders (and its account), and one order.
      GoRoute(
        name: RouteNames.warehouseHome,
        path: RoutePaths.warehouseHome,
        pageBuilder: (context, state) => buildPageTransition(
          state: state,
          child: MultiBlocProvider(
            providers: [
              BlocProvider(
                create: (context) => WarehouseOrdersCubit(repository: context.read<WarehouseOrdersRepository>())..load(),
              ),
              // Lazy: each loads the first time its tab is opened.
              BlocProvider(
                create: (context) =>
                    WarehouseReturnsCubit(repository: context.read<WarehouseManagementRepository>())..load(),
              ),
              BlocProvider(
                create: (context) =>
                    WarehouseAccountsCubit(repository: context.read<WarehouseManagementRepository>())..load(),
              ),
              BlocProvider(
                create: (context) =>
                    WarehouseSummaryCubit(repository: context.read<WarehouseManagementRepository>())..load(),
              ),
              BlocProvider(
                create: (context) =>
                    WarehouseRepsCubit(repository: context.read<WarehouseManagementRepository>())..load(),
              ),
            ],
            child: WarehouseShellView(initialIndex: state.uri.queryParameters['tab'] == 'returns' ? 1 : 0),
          ),
        ),
      ),
      GoRoute(name: RouteNames.warehouseDelivery, path: RoutePaths.warehouseDelivery, builder: (context, state) => const WarehouseDeliveryView()),
      GoRoute(
        name: RouteNames.warehouseOrder,
        path: RoutePaths.warehouseOrder,
        pageBuilder: (context, state) => buildPageTransition(
          state: state,
          child: BlocProvider(
            create: (context) => WarehouseOrderDetailCubit(
              repository: context.read<WarehouseOrdersRepository>(),
              orderId: state.pathParameters['orderId']!,
            )..load(),
            child: const WarehouseOrderDetailView(),
          ),
        ),
      ),
      GoRoute(
        name: RouteNames.warehouseReturn,
        path: RoutePaths.warehouseReturn,
        pageBuilder: (context, state) => buildPageTransition(
          state: state,
          child: BlocProvider(
            create: (context) => WarehouseReturnDetailCubit(
              repository: context.read<WarehouseManagementRepository>(),
              returnId: state.pathParameters['returnId']!,
            )..load(),
            child: const WarehouseReturnDetailView(),
          ),
        ),
      ),
      GoRoute(
        name: RouteNames.warehouseAccount,
        path: RoutePaths.warehouseAccount,
        pageBuilder: (context, state) => buildPageTransition(
          state: state,
          child: BlocProvider(
            create: (context) => WarehouseStatementCubit(
              repository: context.read<WarehouseManagementRepository>(),
              pharmacyId: state.pathParameters['pharmacyId']!,
            )..load(),
            child: const WarehouseStatementView(),
          ),
        ),
      ),
      GoRoute(
        name: RouteNames.warehouseRep,
        path: RoutePaths.warehouseRep,
        pageBuilder: (context, state) => buildPageTransition(
          state: state,
          child: BlocProvider(
            create: (context) => WarehouseRepDetailCubit(
              repository: context.read<WarehouseManagementRepository>(),
              repId: state.pathParameters['repId']!,
            )..load(),
            child: WarehouseRepDetailView(repName: state.extra is String ? state.extra! as String : ''),
          ),
        ),
      ),
      GoRoute(
        name: RouteNames.warehouseInsights,
        path: RoutePaths.warehouseInsights,
        pageBuilder: (context, state) => buildPageTransition(state: state,
          child: BlocProvider(create: (context) => WarehouseInsightsCubit(
            repository: context.read<WarehouseManagementRepository>(),
            warehouseRole: context.read<AuthCubit>().state.user?.warehouseRole ?? 'legacy')..loadAccess(),
            child: const WarehouseInsightsView())),
      ),
      GoRoute(
        name: RouteNames.warehouseLoyalty,
        path: RoutePaths.warehouseLoyalty,
        pageBuilder: (context, state) => buildPageTransition(
          state: state,
          child: BlocProvider(
            create: (context) =>
                WarehouseLoyaltyCubit(repository: context.read<WarehouseManagementRepository>())..load(),
            child: const WarehouseLoyaltyView(),
          ),
        ),
      ),
      GoRoute(
        name: RouteNames.warehouseFeaturePreferences,
        path: RoutePaths.warehouseFeaturePreferences,
        pageBuilder: (context, state) => buildPageTransition(state: state,
          child: WarehouseFeaturePreferencesView(
            repository: context.read<WarehouseManagementRepository>() as WarehouseFeaturePreferencesRepository,
            canConfigure: context.read<AuthCubit>().state.user?.canConfigureFeatures == true,
          )),
      ),
      // Admin accounts: one screen that opens the web panel.
      GoRoute(
        name: RouteNames.panelHome,
        path: RoutePaths.panelHome,
        pageBuilder: (context, state) => buildPageTransition(state: state, child: const PanelHomeView()),
      ),
      // A transport driver has ONLY a trip dashboard, not the rep/warehouse shell.
      GoRoute(
        name: RouteNames.driverHome,
        path: RoutePaths.driverHome,
        pageBuilder: (context, state) => buildPageTransition(
          state: state,
          child: Scaffold(
            appBar: AppBar(
              title: const Text('رحلات التوزيع'),
              actions: [
                IconButton(
                  tooltip: 'Sign out',
                  icon: const Icon(Icons.logout),
                  onPressed: () async {
                    await context.read<AuthCubit>().logout();
                    if (context.mounted) context.goNamed(RouteNames.login);
                  },
                ),
              ],
            ),
            body: driverTripRepository == null
                ? const Center(child: Text('Trip service unavailable'))
                : DriverTripsTab(
                    repository: driverTripRepository!,
                    locationProvider: const GeolocatorLocationProvider(),
                  ),
          ),
        ),
      ),
      // Field reps: the same app, signed in with a rep account. appRedirect
      // keeps a rep inside /rep and everyone else out of it.
      GoRoute(
        name: RouteNames.repHome,
        path: RoutePaths.repHome,
        pageBuilder: (context, state) => buildPageTransition(
          state: state,
          child: MultiBlocProvider(
            providers: [
              BlocProvider(create: (context) => RepHomeCubit(repository: context.read<RepRepository>())..load()),
              BlocProvider(
                create: (context) => RepPharmaciesCubit(repository: context.read<RepRepository>())..load(),
              ),
              BlocProvider(create: (context) => RepVisitsCubit(repository: context.read<RepRepository>())..load()),
            ],
            child: RepShellView(driverTripRepository: driverTripRepository),
          ),
        ),
      ),
      GoRoute(
        name: RouteNames.repPharmacy,
        path: RoutePaths.repPharmacy,
        pageBuilder: (context, state) => buildPageTransition(
          state: state,
          child: BlocProvider(
            create: (context) => RepPharmacyDetailCubit(
              repository: context.read<RepRepository>(),
              pharmacyId: state.pathParameters['pharmacyId']!,
            )..load(),
            child: const RepPharmacyDetailView(),
          ),
        ),
      ),
      GoRoute(
        name: RouteNames.repScan,
        path: RoutePaths.repScan,
        pageBuilder: (context, state) => buildPageTransition(
          state: state,
          child: BlocProvider(
            create: (context) => VisitScanCubit(
              repository: context.read<RepRepository>(),
              locationProvider: context.read<LocationProvider>(),
            ),
            child: const VisitScanView(),
          ),
        ),
      ),
      // The pharmacy's own QR for a rep to scan (opened from its Profile).
      GoRoute(
        name: RouteNames.pharmacyVisitCode,
        path: RoutePaths.pharmacyVisitCode,
        pageBuilder: (context, state) => buildPageTransition(
          state: state,
          child: BlocProvider(
            create: (context) => VisitCodeCubit(repository: context.read<RepRepository>())..load(),
            child: const PharmacyVisitCodeView(),
          ),
        ),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            ScaffoldWithBottomNav(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                name: RouteNames.warehouseSelection,
                path: RoutePaths.warehouseSelection,
                builder: (context, state) => const WarehouseSelectionView(),
              ),
            ],
          ),
          // The Offers & Ads tab. Its own branch, so browsing promotions keeps
          // its scroll position and filters while the pharmacist steps away to
          // another tab - and so a tapped promotion pushes the existing
          // catalog / cart screens full-screen over the shell, exactly as
          // every other entry point into them does.
          StatefulShellBranch(
            routes: [
              GoRoute(
                name: RouteNames.promotions,
                path: RoutePaths.promotions,
                builder: (context, state) {
                  return BlocProvider(
                    create: (context) => PromotionsCubit(
                      offersRepository: context.read<OffersRepository>(),
                      advertisementsRepository: context.read<AdvertisementsRepository>(),
                    ),
                    child: const PromotionsView(),
                  );
                },
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                name: RouteNames.myOrders,
                path: RoutePaths.myOrders,
                builder: (context, state) {
                  return BlocProvider(
                    create: (context) => MyOrdersCubit(
                      orderRepository: context.read<OrderRepository>(),
                    )..load(),
                    child: const MyOrdersView(),
                  );
                },
              ),
            ],
          ),
          // Section 6 (Account History): this tab replaced the old Returns
          // tab. The screen only presents existing data - SavingsCubit (the
          // "money saved" total), DebtsCubit (outstanding balance) and
          // MyReturnsCubit (return count) - and its Debts / Returns cards push
          // the standalone /my-debts and /my-returns routes above.
          StatefulShellBranch(
            routes: [
              GoRoute(
                name: RouteNames.accountHistory,
                path: RoutePaths.accountHistory,
                builder: (context, state) {
                  return MultiBlocProvider(
                    providers: [
                      BlocProvider(
                        create: (context) => SavingsCubit(
                          savingsRepository: context.read<SavingsRepository>(),
                        )..load(),
                      ),
                      BlocProvider(
                        create: (context) => DebtsCubit(
                          debtRepository: context.read<DebtRepository>(),
                        )..load(),
                      ),
                      BlocProvider(
                        create: (context) => MyReturnsCubit(
                          returnRepository: context.read<ReturnRepository>(),
                        )..load(),
                      ),
                    ],
                    child: const AccountHistoryView(),
                  );
                },
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                name: RouteNames.profile,
                path: RoutePaths.profile,
                // Profile no longer loads reviews or debts itself - the
                // ratings section is now a link to /my-ratings, and the debts
                // section was removed (it lives on Account History -> Debts).
                builder: (context, state) => const ProfileView(),
              ),
            ],
          ),
        ],
      ),
    ],
  );
}

// After an admin reset the account is signed in with a temporary password the
// admin has seen (SessionStatus.passwordChangeRequired). Every navigation -
// a tab, a notification deep link, a stray go() from an older screen - is sent
// to the change-password screen until the user has picked their own. Signing
// out still works: it leaves the status `unauthenticated`, which this lets
// through.
//
// Reads AuthCubit from the router's context (the router sits inside main.dart's
// MultiBlocProvider); a context without one - a test that builds the router
// bare - is left alone.
String? forcePasswordChangeRedirect(BuildContext context, GoRouterState state) {
  final SessionStatus status;
  try {
    status = context.read<AuthCubit>().state.sessionStatus;
  } catch (_) {
    return null;
  }
  if (status != SessionStatus.passwordChangeRequired) return null;
  if (state.matchedLocation == RoutePaths.changePassword) return null;
  return RoutePaths.changePassword;
}

// Paths a rep (or a warehouse/admin account) may be on besides its own home:
// the auth steps they pass through, and the static privacy policy.
const Set<String> _repOpenPaths = {
  RoutePaths.splash,
  RoutePaths.login,
  RoutePaths.changePassword,
  RoutePaths.approvalPending,
  RoutePaths.privacyPolicy,
};

// Keeps each role on its own side of the app: a rep (whose pharmacy-side
// requests the server would refuse anyway - a stale notification link, a
// remembered address) is sent to /rep, a warehouse account to /warehouse, an
// admin account to the panel landing, and a pharmacy is sent away from all
// three. A warehouse tapping an order notification lands on the pharmacy's
// tracking path (the one deep link every push uses) and is taken to its own
// view of that order instead.
// Only once the session is known: while it is still being checked (splash)
// nothing is redirected. Offline, the role comes from the stored token.
String? roleRedirect(BuildContext context, GoRouterState state) {
  final AuthState auth;
  try {
    auth = context.read<AuthCubit>().state;
  } catch (_) {
    return null;
  }
  if (auth.sessionStatus != SessionStatus.active && auth.sessionStatus != SessionStatus.offline) return null;

  final location = state.matchedLocation;
  final inDriverArea = location == RoutePaths.driverHome || location.startsWith('${RoutePaths.driverHome}/');
  final inRepArea = location == RoutePaths.repHome || location.startsWith('${RoutePaths.repHome}/');
  final inPanelArea = location == RoutePaths.panelHome;
  final inWarehouseArea =
      location == RoutePaths.warehouseHome || location.startsWith('${RoutePaths.warehouseHome}/');
  if (auth.isDriver) {
    return inDriverArea || _repOpenPaths.contains(location) ? null : RoutePaths.driverHome;
  }
  if (auth.isRep) {
    return inRepArea || _repOpenPaths.contains(location) ? null : RoutePaths.repHome;
  }
  if (auth.isWarehouse) {
    if (inWarehouseArea || _repOpenPaths.contains(location) || location == RoutePaths.notifications) return null;
    final tracked = _orderTrackingPath.firstMatch(location);
    if (tracked != null) return '${RoutePaths.warehouseHome}/orders/${tracked.group(1)}';
    return RoutePaths.warehouseHome;
  }
  if (auth.isPanelUser) {
    return inPanelArea || _repOpenPaths.contains(location) ? null : RoutePaths.panelHome;
  }
  return inDriverArea || inRepArea || inPanelArea || inWarehouseArea ? RoutePaths.warehouseSelection : null;
}

// RoutePaths.orderTracking with its id: '/orders/<id>'.
final RegExp _orderTrackingPath = RegExp(r'^/orders/([^/]+)$');

String? appRedirect(BuildContext context, GoRouterState state) =>
    forcePasswordChangeRedirect(context, state) ?? roleRedirect(context, state);
