import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/theme/light_theme.dart';
import 'package:feniq/core/theme/dark_theme.dart';
import 'package:feniq/core/widgets/app_text_scale.dart';
import 'package:feniq/features/auth/data/models/user_model.dart';
import 'package:feniq/features/auth/presentation/managers/auth_cubit.dart';
import 'package:feniq/features/auth/presentation/managers/auth_state.dart';
import 'package:feniq/features/debts/data/models/debt_detail_model.dart';
import 'package:feniq/features/rep/data/models/rep_models.dart';
import 'package:feniq/features/rep/presentation/managers/rep_home_cubit.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/rep/presentation/managers/rep_pharmacies_cubit.dart';
import 'package:feniq/features/rep/presentation/managers/rep_pharmacy_detail_cubit.dart';
import 'package:feniq/features/rep/presentation/managers/rep_visits_cubit.dart';
import 'package:feniq/features/rep/presentation/views/rep_shell_view.dart';
import 'package:feniq/features/rep/presentation/views/rep_pharmacy_detail_view.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_management_models.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_order_models.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_management_repository.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_accounts_cubit.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_orders_cubit.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_order_detail_cubit.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_reps_cubit.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_rep_detail_cubit.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_rep_detail_view.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_returns_cubit.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_summary_cubit.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_shell_view.dart';
import 'package:feniq/features/warehouse/presentation/widgets/collect_payment_sheet.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_order_detail_view.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_return_detail_view.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_statement_view.dart';
import 'package:feniq/generated/app_localizations.dart';

class Auth extends MockCubit<AuthState> implements AuthCubit {}

class Home extends MockCubit<RepHomeState> implements RepHomeCubit {}

class Pharmacies extends MockCubit<RepPharmaciesState> implements RepPharmaciesCubit {}

class Visits extends MockCubit<RepVisitsState> implements RepVisitsCubit {}

class PharmacyDetail extends MockCubit<RepPharmacyDetailState> implements RepPharmacyDetailCubit {}

class Orders extends MockCubit<WarehouseOrdersState> implements WarehouseOrdersCubit {}

class OrderDetail extends MockCubit<WarehouseOrderDetailState> implements WarehouseOrderDetailCubit {}

class Returns extends MockCubit<WarehouseReturnsState> implements WarehouseReturnsCubit {}

class ReturnDetail extends MockCubit<WarehouseReturnDetailState> implements WarehouseReturnDetailCubit {}

class Accounts extends MockCubit<WarehouseAccountsState> implements WarehouseAccountsCubit {}

class Statement extends MockCubit<WarehouseStatementState> implements WarehouseStatementCubit {}

class Reps extends MockCubit<WarehouseRepsState> implements WarehouseRepsCubit {}

class RepDetail extends MockCubit<WarehouseRepDetailState> implements WarehouseRepDetailCubit {}

class Summary extends MockCubit<WarehouseSummaryState> implements WarehouseSummaryCubit {}

class Repo extends Mock implements WarehouseManagementRepository {}

T seeded<S, T extends Cubit<S>>(T cubit, S state) {
  whenListen(cubit, Stream<S>.empty(), initialState: state);
  return cubit;
}

const kPharmacyAr = 'صيدلية الشفاء Al-Shifa (الفرع 2)';
const kPharmacyEn = 'Al-Shifa Pharmacy';
const pharmacy = RepPharmacy(
  id: 'p1',
  nameAr: 'صيدلية الشفاء Al-Shifa (الفرع 2)',
  nameEn: 'Al-Shifa Pharmacy',
  phone: '+963944123456',
  ownerName: 'الدكتور محمد أحمد',
  address: 'شارع الجمهورية، مقابل المركز الطبي - بناء 24',
  city: 'اللاذقية',
  hasLocation: true,
  activity: RepPharmacyActivity(monthOrdersCount: 27, monthOrdersTotal: 128745600),
);
final visit = RepVisit(
  id: 'v1',
  status: VisitStatus.verified,
  pharmacyNameAr: kPharmacyAr,
  pharmacyNameEn: kPharmacyEn,
  scannedAt: DateTime(2026, 10, 28, 8, 35),
  distanceMeters: 24,
  accuracyMeters: 12,
);
final visit2 = RepVisit(
  id: 'v2',
  status: VisitStatus.outOfRange,
  pharmacyNameAr: 'صيدلية النور - Al Nour',
  pharmacyNameEn: 'Al Nour',
  scannedAt: DateTime(2026, 10, 27, 15, 20),
  distanceMeters: 1475,
  accuracyMeters: 48,
);
const ownerPharmacy = WarehouseOrderPharmacy(
  id: 'p1',
  nameAr: kPharmacyAr,
  nameEn: kPharmacyEn,
  phone: '+963944123456',
  city: 'اللاذقية',
);
final order = WarehouseOrderSummary(
  id: 'o1',
  orderNumber: 123456,
  status: 'pending',
  finalPrice: 128745600,
  itemCount: 27,
  pharmacy: ownerPharmacy,
  createdAt: DateTime(2026, 10, 28, 8, 30),
);
final summary = WarehouseSummary.fromJson({
  'summary': {
    'current': {
      'salesSyp': 128745600,
      'collectionsSyp': 84250000,
      'returnsSyp': 1250000,
      'invoiceCount': 54,
      'paymentCount': 32,
    },
    'previous': {'salesSyp': 100000000, 'collectionsSyp': 60000000},
    'topBuyers': [
      {
        'pharmacy': {'id': 'p1', 'nameAr': kPharmacyAr, 'nameEn': kPharmacyEn},
        'salesSyp': 16800000,
      },
    ],
    'outstanding': {
      'totalDebtSyp': 44495500,
      'totalCreditSyp': 1250000,
      'debtorCount': 21,
      'topDebtors': [
        {
          'pharmacy': {'id': 'p2', 'nameAr': 'صيدلية النور', 'nameEn': 'Al Nour'},
          'balanceSyp': 9250000,
        },
      ],
    },
  },
});

Widget fixture(String screen, Widget child) {
  final isRep = screen.startsWith('rep_');
  final user = UserModel(
    id: 'u1',
    name: isRep ? 'سامر أحمد الحسن' : 'مدير مستودع فينيق',
    phone: '+963944123456',
    role: isRep ? 'rep' : 'warehouse',
    status: 'active',
    lang: 'ar',
  );
  final auth = seeded(Auth(), AuthState(sessionStatus: SessionStatus.active, user: user));
  final home = seeded(
    Home(),
    RepHomeState(
      status: screen == 'rep_profile_error' ? RepLoadStatus.error : RepLoadStatus.loaded,
      errorCode: screen == 'rep_profile_error' ? 'NETWORK_ERROR' : null,
      me: RepMe(
        name: 'سامر أحمد الحسن',
        phone: '+963944123456',
        warehouse: RepWarehouse(id: 'w1', nameAr: 'مستودع فينيق للأدوية - Feniq', nameEn: 'Feniq Warehouse'),
        stats: RepStats(
          pharmacyCount: 32,
          visitsLast7Days: 17,
          monthOrdersCount: 54,
          monthOrdersTotal: 128745600,
          ownCommissionRate: 0.75,
          monthCommissionAmount: 965592,
        ),
      ),
    ),
  );
  final pharmacies = seeded(
    Pharmacies(),
    RepPharmaciesState(
      status: screen == 'rep_error' ? RepLoadStatus.error : RepLoadStatus.loaded,
      errorCode: screen == 'rep_error' ? 'NETWORK_ERROR' : null,
      pharmacies: screen == 'rep_empty' || screen == 'rep_error'
          ? []
          : [
              pharmacy,
              const RepPharmacy(
                id: 'p2',
                nameAr: 'صيدلية النور',
                nameEn: 'Al Nour',
                city: 'طرطوس',
                address: 'دوار الساعة',
                activity: RepPharmacyActivity(monthOrdersCount: 4),
              ),
            ],
    ),
  );
  final visits = seeded(
    Visits(),
    RepVisitsState(
      status: screen == 'rep_visits_error' ? RepLoadStatus.error : RepLoadStatus.loaded,
      errorCode: screen == 'rep_visits_error' ? 'NETWORK_ERROR' : null,
      visits: [visit, visit2],
    ),
  );
  final detail = seeded(
    PharmacyDetail(),
    RepPharmacyDetailState(
      status: screen == 'rep_detail_error' ? RepLoadStatus.error : RepLoadStatus.loaded,
      errorCode: screen == 'rep_detail_error' ? 'NETWORK_ERROR' : null,
      detail: RepPharmacyDetail(
        pharmacy: pharmacy,
        orders: [
          RepOrder(
            id: 'o1',
            orderNumber: 123456,
            status: 'out_for_delivery',
            finalPrice: 128745600,
            createdAt: DateTime(2026, 10, 28, 8, 30),
          ),
        ],
        visits: [visit, visit2],
      ),
    ),
  );
  final orders = seeded(
    Orders(),
    WarehouseOrdersState(
      status: screen == 'warehouse_error'
          ? RepLoadStatus.error
          : screen == 'warehouse_loading'
          ? RepLoadStatus.loading
          : RepLoadStatus.loaded,
      errorCode: screen == 'warehouse_error' ? 'NETWORK_ERROR' : null,
      orders: screen == 'warehouse_empty' || screen == 'warehouse_error' || screen == 'warehouse_loading'
          ? []
          : [order, order.copyWith(status: 'out_for_delivery')],
    ),
  );
  final orderDetail = seeded(
    OrderDetail(),
    WarehouseOrderDetailState(
      status: RepLoadStatus.loaded,
      order: WarehouseOrderDetail(
        id: 'o1',
        orderNumber: 123456,
        status: 'confirmed',
        pharmacy: ownerPharmacy,
        createdAt: DateTime(2026, 10, 28, 8, 30),
        hasReturn: true,
        totalPrice: 130000000,
        discountAmount: 1254400,
        finalPrice: 128745600,
        warehouseNetSyp: 127000000,
        items: [
          WarehouseOrderItem(
            id: 'i1',
            productNameAr: 'باراسيتامول - PANADOL 500 mg (24 tablets)',
            productNameEn: 'PANADOL 500 mg',
            quantity: 24,
            unitPrice: 12500,
            discountPrice: 12000,
          ),
        ],
      ),
    ),
  );
  const returned = WarehouseReturn(
    id: 'r1',
    status: 'pending',
    orderNumber: 123456,
    pharmacyNameAr: kPharmacyAr,
    pharmacyNameEn: kPharmacyEn,
    items: [
      WarehouseReturnItem(
        quantity: 2,
        reasonType: 'damaged',
        productNameAr: 'باراسيتامول - PANADOL 500 mg',
        productNameEn: 'PANADOL 500 mg',
      ),
    ],
  );
  final returns = seeded(Returns(), const WarehouseReturnsState(status: RepLoadStatus.loaded, returns: [returned]));
  final returnDetail = seeded(
    ReturnDetail(),
    const WarehouseReturnDetailState(status: RepLoadStatus.loaded, creditPreviewSyp: 25000, returnRequest: returned),
  );
  final accounts = seeded(
    Accounts(),
    const WarehouseAccountsState(
      status: RepLoadStatus.loaded,
      accounts: [
        WarehouseAccountRow(
          pharmacyId: 'p1',
          nameAr: kPharmacyAr,
          nameEn: kPharmacyEn,
          balanceSyp: 44495500,
          purchasesSyp: 128745600,
          paidSyp: 84250100,
        ),
        WarehouseAccountRow(
          pharmacyId: 'p2',
          nameAr: 'صيدلية النور',
          nameEn: 'Al Nour',
          balanceSyp: -1250000,
          purchasesSyp: 5000000,
          paidSyp: 6250000,
        ),
      ],
    ),
  );
  final statement = seeded(
    Statement(),
    const WarehouseStatementState(
      status: RepLoadStatus.loaded,
      statement: WarehouseStatement(
        pharmacyNameAr: kPharmacyAr,
        pharmacyNameEn: kPharmacyEn,
        pharmacyPhone: '+963944123456',
        closingSyp: 44495500,
        summary: StatementSummary(chargesSyp: 128745600, paymentsSyp: 84250100, returnCreditsSyp: 0, adjustmentsSyp: 0),
        rows: [],
      ),
    ),
  );
  final reps = seeded(
    Reps(),
    const WarehouseRepsState(
      status: RepLoadStatus.loaded,
      reps: [
        WarehouseRep(
          id: 'rp1',
          name: 'سامر أحمد الحسن - Samer',
          phone: '+963944123456',
          commissionRate: 3,
          pharmacyCount: 32,
          visits30d: 71,
          unverifiedVisits30d: 3,
          monthOrdersCount: 54,
          monthOrdersTotal: 128745600,
          monthCommission: RepMonthCommission(repAmount: 965592, feniqAmount: 1931184, savingAmount: 965592),
        ),
        WarehouseRep(id: 'rp2', name: 'محمد عبد الرحمن', phone: '+963955654321', isActive: false),
      ],
    ),
  );
  final summaryCubit = seeded(Summary(), WarehouseSummaryState(status: RepLoadStatus.loaded, summary: summary));
  final repDetail = seeded(
    RepDetail(),
    WarehouseRepDetailState(
      status: screen == 'warehouse_rep_detail_error' ? RepLoadStatus.error : RepLoadStatus.loaded,
      errorCode: screen == 'warehouse_rep_detail_error' ? 'NETWORK_ERROR' : null,
      pharmacies: [
        RepAssignedPharmacy(
          id: 'p1',
          nameAr: kPharmacyAr,
          nameEn: kPharmacyEn,
          city: 'اللاذقية',
          lastVisitAt: DateTime(2026, 10, 28),
        ),
      ],
      visits: [
        WarehouseRepVisit(
          id: 'v1',
          status: 'no_pharmacy_location',
          pharmacyNameAr: kPharmacyAr,
          scannedAt: DateTime(2026, 10, 28),
        ),
      ],
    ),
  );
  final repo = Repo();
  when(repo.getPendingPayments).thenAnswer((_) async => []);
  when(repDetail.loadMoreVisits).thenAnswer((_) async {});
  when(returns.loadMore).thenAnswer((_) async {});
  when(visits.loadMore).thenAnswer((_) async {});
  when(orders.loadMore).thenAnswer((_) async {});
  when(accounts.loadMore).thenAnswer((_) async {});
  return RepositoryProvider<WarehouseManagementRepository>.value(
    value: repo,
    child: MultiBlocProvider(
      providers: [
        BlocProvider<AuthCubit>.value(value: auth),
        BlocProvider<RepHomeCubit>.value(value: home),
        BlocProvider<RepPharmaciesCubit>.value(value: pharmacies),
        BlocProvider<RepVisitsCubit>.value(value: visits),
        BlocProvider<RepPharmacyDetailCubit>.value(value: detail),
        BlocProvider<WarehouseOrdersCubit>.value(value: orders),
        BlocProvider<WarehouseOrderDetailCubit>.value(value: orderDetail),
        BlocProvider<WarehouseReturnsCubit>.value(value: returns),
        BlocProvider<WarehouseReturnDetailCubit>.value(value: returnDetail),
        BlocProvider<WarehouseAccountsCubit>.value(value: accounts),
        BlocProvider<WarehouseStatementCubit>.value(value: statement),
        BlocProvider<WarehouseRepsCubit>.value(value: reps),
        BlocProvider<WarehouseSummaryCubit>.value(value: summaryCubit),
        BlocProvider<WarehouseRepDetailCubit>.value(value: repDetail),
      ],
      child: child,
    ),
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final capturePath = Platform.environment['FENIQ_CAPTURE_DIR'];
  final root = capturePath == null ? null : (Directory(capturePath)..createSync(recursive: true));
  setUpAll(() async {
    await (FontLoader('MaterialIcons')..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
    for (final family in ['Readex', 'Plex']) {
      final loader = FontLoader(family);
      for (final weight in [400, 500, 600, 700]) {
        loader.addFont(
          rootBundle.load('assets/fonts/${family == 'Readex' ? 'ReadexPro' : 'IBMPlexSansArabic'}-$weight.ttf'),
        );
      }
      await loader.load();
    }
  });
  testWidgets('review real Arabic screens with actual bundled fonts across sizes and states', (tester) async {
    final semanticsHandle = tester.ensureSemantics();
    final records = <Map<String, Object?>>[];
    final screens = [
      'rep_pharmacies',
      'rep_visits',
      'rep_profile',
      'rep_detail',
      'rep_empty',
      'rep_error',
      'warehouse_orders',
      'warehouse_returns',
      'warehouse_accounts',
      'warehouse_reps',
      'warehouse_account',
      'warehouse_detail',
      'warehouse_return_detail',
      'warehouse_statement',
      'warehouse_empty',
      'warehouse_error',
      'warehouse_loading',
      'warehouse_add_rep',
      'warehouse_payment',
      'warehouse_rep_detail',
      'warehouse_collect',
      'warehouse_reject',
      'rep_visits_error',
      'rep_profile_error',
      'rep_detail_error',
      'warehouse_rep_detail_error',
    ];
    final originalError = FlutterError.onError;
    try {
      for (final variant in [
        'normal',
        'narrow',
        'everyday-large',
        'large',
        'dark',
        'keyboard',
        'landscape',
        'split',
        'tablet',
        'tablet-wide',
        'wide',
        'tablet-large',
        'largest',
        'landscape-large',
      ]) {
        final width = switch (variant) {
          'narrow' || 'large' || 'keyboard' => 320.0,
          'everyday-large' => 360.0,
          'landscape' || 'landscape-large' => 844.0,
          'split' => 600.0,
          'tablet' => 768.0,
          'tablet-wide' || 'tablet-large' => 1024.0,
          'wide' => 1366.0,
          _ => 390.0,
        };
        final height = variant.startsWith('landscape')
            ? 390.0
            : variant == 'tablet-wide' || variant == 'tablet-large'
            ? 768.0
            : variant == 'tablet' || variant == 'wide'
            ? 1024.0
            : 844.0;
        final scale = variant == 'largest'
            ? 3.0
            : variant == 'large' || variant == 'tablet-large' || variant == 'landscape-large'
            ? 2.0
            : variant == 'everyday-large'
            ? 1.6
            : 1.0;
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = Size(width, height);
        tester.platformDispatcher.textScaleFactorTestValue = scale;
        for (final screen in screens) {
          if (variant == 'keyboard' && screen != 'warehouse_add_rep' && screen != 'warehouse_payment') continue;
          tester.view.resetViewInsets();
          final issues = <String>[];
          FlutterError.onError = (details) =>
              issues.add(details.toString().substring(0, details.toString().length.clamp(0, 1600)));
          final key = GlobalKey();
          Widget child = screen.startsWith('rep_') ? const RepShellView() : const WarehouseShellView();
          if (screen == 'warehouse_rep_detail' || screen == 'warehouse_rep_detail_error') {
            child = const WarehouseRepDetailView(repName: 'سامر أحمد الحسن - Samer');
          }
          if (screen == 'rep_detail' || screen == 'rep_detail_error') child = const RepPharmacyDetailView();
          if (screen == 'warehouse_detail') child = const WarehouseOrderDetailView();
          if (screen == 'warehouse_return_detail' || screen == 'warehouse_reject') {
            child = const WarehouseReturnDetailView();
          }
          if (screen == 'warehouse_statement' || screen == 'warehouse_payment') child = const WarehouseStatementView();
          if (screen == 'warehouse_collect') {
            child = Scaffold(
              body: Builder(
                builder: (context) => TextButton(
                  onPressed: () => showCollectPaymentSheet(context, orderNumber: 123456, totalSyp: 128745600),
                  child: const Text('open collect'),
                ),
              ),
            );
          }
          final record = <String, Object?>{
            'screen': screen,
            'variant': variant,
            'width': width,
            'systemTextScale': scale,
            'appTextScale': scale * 0.93,
          };
          try {
            await tester.pumpWidget(
              RepaintBoundary(
                key: key,
                child: MaterialApp(
                  key: ValueKey('$screen-$variant'),
                  debugShowCheckedModeBanner: false,
                  locale: const Locale('ar'),
                  localizationsDelegates: AppLocalizations.localizationsDelegates,
                  supportedLocales: AppLocalizations.supportedLocales,
                  theme: LightTheme.data,
                  darkTheme: DarkTheme.data,
                  themeMode: variant == 'dark' ? ThemeMode.dark : ThemeMode.light,
                  builder: (context, child) => AppTextScale(child: child!),
                  home: fixture(screen, child),
                ),
              ),
            );
            await tester.pump();
            await tester.pump(const Duration(milliseconds: 400));
            final tab = switch (screen) {
              'rep_visits' || 'rep_visits_error' => 1,
              'rep_profile' || 'rep_profile_error' => 2,
              'warehouse_returns' => 1,
              'warehouse_accounts' => 2,
              'warehouse_reps' || 'warehouse_add_rep' => 3,
              'warehouse_account' => 4,
              _ => 0,
            };
            if (tab != 0) {
              if (find.byType(NavigationRail).evaluate().isNotEmpty) {
                tester.widget<NavigationRail>(find.byType(NavigationRail)).onDestinationSelected!(tab);
              } else {
                tester.widget<NavigationBar>(find.byType(NavigationBar)).onDestinationSelected!(tab);
              }
              await tester.pump();
              await tester.pump(const Duration(milliseconds: 400));
            }
            if (screen == 'warehouse_add_rep') {
              await tester.tap(find.byType(FloatingActionButton));
              await tester.pump();
              await tester.pump(const Duration(milliseconds: 400));
            }
            if (screen == 'warehouse_payment') {
              await tester.tap(find.byType(FloatingActionButton));
              await tester.pump();
              await tester.pump(const Duration(milliseconds: 400));
            }
            if (screen == 'warehouse_collect') {
              await tester.tap(find.text('open collect'));
              await tester.pumpAndSettle();
              final l10n = AppLocalizations.of(tester.element(find.byType(CollectPaymentSheet)))!;
              await tester.tap(find.text(l10n.warehouseCollectPartial));
              await tester.pumpAndSettle();
            }
            if (screen == 'warehouse_reject') {
              final l10n = AppLocalizations.of(tester.element(find.byType(WarehouseReturnDetailView)))!;
              await tester.tap(find.text(l10n.warehouseReturnReject));
              await tester.pumpAndSettle();
            }
            if (variant == 'keyboard') {
              if (screen == 'warehouse_add_rep') {
                await tester.enterText(find.byType(TextFormField).at(0), 'سامر أحمد');
                await tester.enterText(find.byType(TextFormField).at(1), '+963944123456');
                await tester.showKeyboard(find.byType(TextFormField).at(1));
              } else {
                await tester.enterText(find.byType(TextField).first, '1250000');
                await tester.showKeyboard(find.byType(TextField).first);
              }
              tester.view.viewInsets = const FakeViewPadding(bottom: 300);
              await tester.pump();
              await tester.pump(const Duration(milliseconds: 500));
            }
            if (variant == 'normal') {
              final targets = await androidTapTargetGuideline.evaluate(tester);
              final labels = await labeledTapTargetGuideline.evaluate(tester);
              record['tapTargets'] = {'passed': targets.passed, 'reason': targets.reason};
              record['tapLabels'] = {'passed': labels.passed, 'reason': labels.reason};
            }
            if (root != null) {
              final path = '${root.path}/$screen-$variant.png';
              await tester.runAsync(() async {
                final boundary = key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
                final img = await boundary.toImage(pixelRatio: 2);
                final bytes = await img.toByteData(format: ui.ImageByteFormat.png);
                await File(path).writeAsBytes(bytes!.buffer.asUint8List());
                img.dispose();
              });
              record['image'] = path;
            }
            final texts = tester.widgetList<Text>(find.byType(Text)).map((x) => x.data ?? '').toList();
            record['textCount'] = texts.length;
            record['direction'] = Directionality.of(tester.element(find.byType(Scaffold).first)).name;
            if (screen == 'warehouse_detail') {
              for (final e in find.byType(RichText).evaluate()) {
                final rich = e.widget as RichText;
                final text = rich.text.toPlainText();
                if (text.contains('-1,254,400')) {
                  final paragraph = e.renderObject! as RenderParagraph;
                  final minus = paragraph.getBoxesForSelection(
                    TextSelection(baseOffset: text.indexOf('-'), extentOffset: text.indexOf('-') + 1),
                  );
                  final digit = paragraph.getBoxesForSelection(
                    TextSelection(baseOffset: text.indexOf('-') + 1, extentOffset: text.indexOf('-') + 2),
                  );
                  record['negativeAmount'] = {
                    'raw': text,
                    'minusX': minus.first.left,
                    'firstDigitX': digit.first.left,
                    'minusVisuallyRightOfDigits': minus.first.left > digit.first.left,
                  };
                }
              }
            }
            for (final list in find.byType(ListView).evaluate().toList()) {
              final scrollables = find.descendant(of: find.byWidget(list.widget), matching: find.byType(Scrollable));
              if (scrollables.evaluate().isEmpty) continue;
              final position = tester.state<ScrollableState>(scrollables.first).position;
              for (var step = 0; step < 24 && position.pixels < position.maxScrollExtent; step++) {
                position.jumpTo(
                  (position.pixels + position.viewportDimension * 0.8).clamp(0, position.maxScrollExtent),
                );
                await tester.pump();
              }
            }
          } catch (error) {
            issues.add('Capture error: $error');
          }
          record['issues'] = issues;
          records.add(record);
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pump();
        }
      }
    } finally {
      semanticsHandle.dispose();
      FlutterError.onError = originalError;
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
      tester.view.resetViewInsets();
      tester.platformDispatcher.clearTextScaleFactorTestValue();
      if (root != null) {
        File(
          '${root.path}/capture-results.json',
        ).writeAsStringSync(const JsonEncoder.withIndent('  ').convert(records));
      }
    }
    expect(
      records.where((r) => (r['issues']! as List).isNotEmpty).toList(),
      isEmpty,
      reason: 'All Arabic layouts must render without overflow',
    );
    expect(
      records
          .where((r) => (r['tapTargets'] as Map?)?['passed'] == false || (r['tapLabels'] as Map?)?['passed'] == false)
          .toList(),
      isEmpty,
      reason: 'Controls must have readable labels and Android-sized tap targets',
    );
    expect(
      records.where((r) => (r['negativeAmount'] as Map?)?['minusVisuallyRightOfDigits'] == true).toList(),
      isEmpty,
      reason: 'Negative amounts must keep their sign on the left',
    );
  });
}
