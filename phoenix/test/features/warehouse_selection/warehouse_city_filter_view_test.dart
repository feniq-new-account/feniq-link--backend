import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/services/fcm_service.dart';
import 'package:feniq/core/services/secure_storage_service.dart';
import 'package:feniq/core/widgets/empty_view.dart';
import 'package:feniq/features/auth/data/repositories/auth_repository_impl.dart';
import 'package:feniq/features/auth/presentation/managers/auth_cubit.dart';
import 'package:feniq/features/banners/data/repositories/banners_repository.dart';
import 'package:feniq/features/banners/presentation/managers/banners_cubit.dart';
import 'package:feniq/features/cart/data/repositories/order_repository.dart';
import 'package:feniq/features/cart/presentation/managers/cart_cubit.dart';
import 'package:feniq/features/exchange_rate/data/models/exchange_rate_model.dart';
import 'package:feniq/features/exchange_rate/data/repositories/exchange_rate_repository.dart';
import 'package:feniq/features/exchange_rate/presentation/managers/exchange_rate_cubit.dart';
import 'package:feniq/features/notifications/data/models/notification_model.dart';
import 'package:feniq/features/notifications/data/repositories/notification_repository.dart';
import 'package:feniq/features/notifications/presentation/managers/notification_cubit.dart';
import 'package:feniq/features/warehouse_selection/data/models/warehouse_list_result.dart';
import 'package:feniq/features/warehouse_selection/data/models/warehouse_model.dart';
import 'package:feniq/features/warehouse_selection/data/repositories/warehouse_repository.dart';
import 'package:feniq/features/warehouse_selection/presentation/managers/warehouse_selection_cubit.dart';
import 'package:feniq/features/warehouse_selection/presentation/views/warehouse_selection_view.dart';
import 'package:feniq/features/warehouse_selection/presentation/widgets/warehouse_card.dart';
import 'package:feniq/generated/app_localizations.dart';
import 'package:feniq/routes/route_names.dart';

class _MockWarehouseRepository extends Mock implements WarehouseRepository {}

class _MockAuthRepository extends Mock implements AuthRepositoryImpl {}

class _MockSecureStorage extends Mock implements SecureStorageService {}

class _MockFcmService extends Mock implements FcmService {}

class _MockBannersRepository extends Mock implements BannersRepository {}

class _MockNotificationRepository extends Mock implements NotificationRepository {}

class _MockOrderRepository extends Mock implements OrderRepository {}

class _MockExchangeRateRepository extends Mock implements ExchangeRateRepository {}

WarehouseModel _warehouse({required String id, required String name, required String city}) =>
    WarehouseModel(
      id: id,
      nameAr: 'مستودع $name',
      nameEn: name,
      city: city,
      phone: '0940000001',
      // No logo, so the card draws its placeholder rather than reaching for
      // the network from a widget test.
      logo: null,
    );

// The pharmacy in these tests is in Latakia, which is what every pharmacy's
// stored city is today (the backend's auth.service.js hardcodes it).
final _homeWarehouse = _warehouse(id: 'w1', name: 'Home Warehouse', city: 'Latakia');
final _otherHomeWarehouse = _warehouse(id: 'w2', name: 'Second Home Warehouse', city: 'Latakia');
final _awayWarehouse = _warehouse(id: 'w3', name: 'Away Warehouse', city: 'Aleppo');

/// Home lists every eligible warehouse, without city chips or city labels.
/// Backend city-scoping remains available internally for a future release.
void main() {
  late _MockWarehouseRepository warehouseRepository;
  late AuthCubit authCubit;
  late WarehouseSelectionCubit warehouseCubit;
  late ExchangeRateCubit exchangeRateCubit;
  late BannersCubit bannersCubit;
  late NotificationCubit notificationCubit;
  late CartCubit cartCubit;

  setUp(() {
    warehouseRepository = _MockWarehouseRepository();

    final fcmService = _MockFcmService();
    when(() => fcmService.markAppReady()).thenReturn(null);

    final notificationRepository = _MockNotificationRepository();
    when(() => notificationRepository.current).thenReturn(const <NotificationModel>[]);

    authCubit = AuthCubit(
      authRepository: _MockAuthRepository(),
      secureStorage: _MockSecureStorage(),
      fcmService: fcmService,
      notificationRepository: notificationRepository,
    );
    when(() => notificationRepository.changes)
        .thenAnswer((_) => const Stream<List<NotificationModel>>.empty());
    notificationCubit = NotificationCubit(repository: notificationRepository);

    // The screen fires these off on open. They render nothing on failure by
    // design, so a thrown stub keeps them out of the way without affecting
    // what is under test.
    final bannersRepository = _MockBannersRepository();
    when(() => bannersRepository.getActiveBanners()).thenAnswer((_) async => []);
    bannersCubit = BannersCubit(bannersRepository: bannersRepository);

    final exchangeRateRepository = _MockExchangeRateRepository();
    when(() => exchangeRateRepository.getExchangeRate())
        .thenAnswer((_) async => ExchangeRateModel(usdToSyp: 15000));
    exchangeRateCubit = ExchangeRateCubit(exchangeRateRepository: exchangeRateRepository);

    cartCubit = CartCubit(
      orderRepository: _MockOrderRepository(),
      warehouseRepository: warehouseRepository,
    );

    warehouseCubit = WarehouseSelectionCubit(warehouseRepository: warehouseRepository);
  });

  tearDown(() {
    authCubit.close();
    warehouseCubit.close();
    exchangeRateCubit.close();
    bannersCubit.close();
    notificationCubit.close();
    cartCubit.close();
  });

  /// Stands in for the server: the same endpoint answering differently
  /// depending on the scope the app asked for.
  void stubServer({
    required List<WarehouseModel> inMyCity,
    required List<WarehouseModel> everywhere,
    bool cityFilterApplied = true,
  }) {
    when(() => warehouseRepository.getWarehouses(onlyMyCity: true)).thenAnswer(
      (_) async => WarehouseListResult(
        warehouses: inMyCity,
        cityFilterApplied: cityFilterApplied,
        pharmacyCity: 'Latakia',
      ),
    );
    when(() => warehouseRepository.getWarehouses(onlyMyCity: false)).thenAnswer(
      (_) async => WarehouseListResult(
        warehouses: everywhere,
        cityFilterApplied: false,
        pharmacyCity: 'Latakia',
      ),
    );
  }

  Future<void> pumpScreen(WidgetTester tester) async {
    final router = GoRouter(
      initialLocation: '/warehouses',
      routes: [
        GoRoute(
          path: '/warehouses',
          name: RouteNames.warehouseSelection,
          builder: (context, state) => const WarehouseSelectionView(),
        ),
        GoRoute(
          path: '/offers',
          name: RouteNames.promotions,
          builder: (context, state) => const Scaffold(body: Text('Offers route opened')),
        ),
        GoRoute(
          path: '/manufacturers/:warehouseId',
          name: RouteNames.manufacturers,
          builder: (context, state) => const Scaffold(body: Text('manufacturers')),
        ),
        GoRoute(
          path: '/warehouse-profile/:warehouseId',
          name: RouteNames.warehouseProfile,
          builder: (context, state) => const Scaffold(body: Text('profile')),
        ),
      ],
    );

    await tester.pumpWidget(
      MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: authCubit),
          BlocProvider<WarehouseSelectionCubit>.value(value: warehouseCubit),
          BlocProvider<ExchangeRateCubit>.value(value: exchangeRateCubit),
          BlocProvider<BannersCubit>.value(value: bannersCubit),
          BlocProvider<NotificationCubit>.value(value: notificationCubit),
          BlocProvider<CartCubit>.value(value: cartCubit),
        ],
        child: MaterialApp.router(
          locale: const Locale('en'),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          routerConfig: router,
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('home requests all warehouses without a city scope toggle', (tester) async {
    stubServer(
      inMyCity: [_homeWarehouse],
      everywhere: [_homeWarehouse, _otherHomeWarehouse, _awayWarehouse],
    );
    await pumpScreen(tester);
    verify(() => warehouseRepository.getWarehouses(onlyMyCity: false)).called(1);
    verifyNever(() => warehouseRepository.getWarehouses(onlyMyCity: true));
    expect(find.text('Home Warehouse'), findsOneWidget);
    expect(find.text('Second Home Warehouse'), findsOneWidget);
    expect(find.text('Away Warehouse'), findsOneWidget);
    expect(find.byType(WarehouseCard), findsNWidgets(3));
    expect(find.text('All cities'), findsNothing);
    expect(find.text('My city'), findsNothing);
    expect(find.text('Latakia'), findsNothing);
    expect(find.text('Aleppo'), findsNothing);
  });

  testWidgets('empty platform shows generic empty state without city actions', (tester) async {
    stubServer(inMyCity: const [], everywhere: const []);
    await pumpScreen(tester);
    expect(find.text('No warehouses available yet.'), findsOneWidget);
    expect(find.byType(EmptyView), findsOneWidget);
    expect(find.text('View all cities'), findsNothing);
  });

  testWidgets('the pharmacy browse section has helpful hierarchy and a working offers shortcut',
      (tester) async {
    stubServer(
      inMyCity: [_homeWarehouse],
      everywhere: [_homeWarehouse, _otherHomeWarehouse],
    );
    await pumpScreen(tester);
    expect(find.byKey(const ValueKey('pharmacyBrowseSection')), findsOneWidget);
    expect(find.text('Choose a warehouse to browse its manufacturers and medicines.'), findsOneWidget);
    expect(find.byKey(const ValueKey('pharmacyOffersShortcut')), findsOneWidget);
    // The existing single quick-search FAB remains intact; no duplicate search.
    expect(find.byKey(const ValueKey('homeQuickSearchButton')), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
    await tester.ensureVisible(find.byKey(const ValueKey('pharmacyOffersShortcut')));
    await tester.tap(find.byKey(const ValueKey('pharmacyOffersShortcut')));
    await tester.pumpAndSettle();
    expect(find.text('Offers route opened'), findsOneWidget);
  });

  testWidgets('the home uses a single floating quick-search entry point', (tester) async {
    stubServer(
      inMyCity: [_homeWarehouse, _otherHomeWarehouse],
      everywhere: [_homeWarehouse, _otherHomeWarehouse, _awayWarehouse],
    );

    await pumpScreen(tester);

    // The old inline TextField no longer consumes vertical space or silently
    // filters only the current city. The sheet tests cover cross-city search.
    expect(find.byKey(const ValueKey('homeQuickSearchButton')), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
    expect(find.byType(WarehouseCard), findsNWidgets(3));
    verify(() => warehouseRepository.getWarehouses(onlyMyCity: false)).called(1);
  });
}
