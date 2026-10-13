import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/core/widgets/medicine_placeholder.dart';
import 'package:feniq/core/widgets/offer_badge.dart';
import 'package:feniq/core/utils/currency_formatter.dart';
import 'package:feniq/core/widgets/quantity_stepper.dart';
import 'package:feniq/features/catalog/data/models/bonus_tier.dart';
import 'package:feniq/features/catalog/data/models/product_model.dart';
import 'package:feniq/features/catalog/presentation/widgets/manufacturer_avatar.dart';
import 'package:feniq/features/catalog/presentation/widgets/product_card.dart';
import 'package:feniq/features/exchange_rate/data/models/exchange_rate_model.dart';
import 'package:feniq/features/exchange_rate/data/repositories/exchange_rate_repository.dart';
import 'package:feniq/features/exchange_rate/presentation/managers/exchange_rate_cubit.dart';
import 'package:feniq/generated/app_localizations.dart';

class _MockExchangeRateRepository extends Mock implements ExchangeRateRepository {}

const _product = ProductModel(
  id: 'p1',
  nameAr: 'دواء',
  nameEn: 'Med',
  manufacturerAr: 'شركة',
  manufacturerEn: 'Co',
  priceUsd: 5,
  discountPriceUsd: 5,
  isAvailable: true,
  hasActiveOffer: false,
);

void main() {
  late ExchangeRateCubit rateCubit;
  late _MockExchangeRateRepository rateRepository;

  setUp(() {
    rateRepository = _MockExchangeRateRepository();
    rateCubit = ExchangeRateCubit(exchangeRateRepository: rateRepository);
  });
  tearDown(() => rateCubit.close());

  Future<void> loadRate(double usdToSyp) async {
    when(() => rateRepository.getExchangeRate())
        .thenAnswer((_) async => ExchangeRateModel(usdToSyp: usdToSyp));
    await rateCubit.load();
  }

  Future<void> pumpCard(
    WidgetTester tester, {
    int cartQuantity = 0,
    bool isGrid = true,
    Locale? locale,
    ProductModel product = _product,
    double? gridHeight = 316,
    double listWidth = 328,
    double textScale = 1,
    ValueChanged<int>? onAdd,
    ValueChanged<int>? onCartQuantityChanged,
    VoidCallback? onCartRemove,
  }) {
    return tester.pumpWidget(
      MaterialApp(
        locale: locale,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(textScale)),
          child: child!,
        ),
        home: BlocProvider<ExchangeRateCubit>.value(
          value: rateCubit,
          child: Scaffold(
            body: Center(
              // A grid cell at the catalog's real metrics, or a list row as wide
              // as a 360pt phone leaves it (minus the screen's side padding).
              child: SizedBox(
                width: isGrid ? 160 : listWidth,
                height: isGrid ? gridHeight : null,
                child: ProductCard(
                  product: product,
                  isGrid: isGrid,
                  cartQuantity: cartQuantity,
                  onAdd: onAdd ?? (_) {},
                  onCartQuantityChanged: onCartQuantityChanged,
                  onCartRemove: onCartRemove,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  testWidgets('not in the cart -> shows the cart button, no stepper', (tester) async {
    await pumpCard(tester, cartQuantity: 0);

    // The grid tile's cart button is a square icon in the price's corner.
    expect(find.byIcon(Icons.add_shopping_cart_outlined), findsOneWidget);
    expect(find.byTooltip('Add to cart'), findsOneWidget);
    expect(find.byType(QuantityStepper), findsNothing);
  });

  testWidgets('grid: the corner cart button opens the quantity picker and adds', (tester) async {
    final added = <int>[];
    await pumpCard(tester, onAdd: added.add, gridHeight: null);

    await tester.tap(find.byIcon(Icons.add_shopping_cart_outlined));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add'));
    await tester.pumpAndSettle();

    expect(added, [1]);
  });

  for (final isGrid in [true, false]) {
    testWidgets('${isGrid ? 'grid' : 'list'}: an available medicine carries no "available" label', (tester) async {
      await pumpCard(tester, isGrid: isGrid, gridHeight: null);
      expect(find.text('Available'), findsNothing);
      expect(find.text('Unavailable'), findsNothing);
    });

    testWidgets('${isGrid ? 'grid' : 'list'}: an unavailable one says so and cannot be added', (tester) async {
      await pumpCard(
        tester,
        isGrid: isGrid,
        gridHeight: null,
        product: const ProductModel(
          id: 'p5',
          nameAr: 'دواء',
          manufacturerAr: 'شركة',
          priceUsd: 5,
          discountPriceUsd: 5,
          isAvailable: false,
          hasActiveOffer: false,
        ),
      );
      expect(find.text('Unavailable'), findsOneWidget);
      expect(find.byIcon(Icons.add_shopping_cart_outlined), findsNothing);
      expect(find.text('Add to cart'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('price is shown in SYP only, with no USD figure anywhere', (tester) async {
    await loadRate(5000); // 1 USD = 5000 SYP -> $5 product => 25,000 ل.س
    await pumpCard(tester, cartQuantity: 0);

    expect(find.text('25,000 SYP'), findsOneWidget);
    expect(find.textContaining('\$'), findsNothing);
  });

  testWidgets('shows a placeholder, not a USD figure, when no exchange rate has loaded', (tester) async {
    await pumpCard(tester, cartQuantity: 0);

    expect(find.text(kMoneyUnavailable), findsOneWidget);
    expect(find.textContaining('\$'), findsNothing);
  });

  testWidgets('in the cart -> shows a stepper reflecting the cart quantity', (tester) async {
    await pumpCard(tester, cartQuantity: 4);

    expect(find.byType(QuantityStepper), findsOneWidget);
    expect(find.text('4'), findsOneWidget);
    expect(find.text('Add'), findsNothing);
  });

  testWidgets('stepper + and typing both report through onCartQuantityChanged', (tester) async {
    final reported = <int>[];
    await pumpCard(tester, cartQuantity: 2, onCartQuantityChanged: reported.add);

    await tester.tap(find.byIcon(Icons.add));
    await tester.pump();

    await tester.enterText(find.byType(TextField), '30');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pump();

    expect(reported, [3, 30]);
  });

  // The list row - the catalog's default layout - used to offer a bare "+"
  // here. It is the same button now, labelled.
  group('list row add button', () {
    testWidgets('reads "Add to cart" instead of a bare +', (tester) async {
      await pumpCard(tester, isGrid: false);

      expect(find.text('Add to cart'), findsOneWidget);
      expect(find.byIcon(Icons.add), findsNothing);
      expect(find.byType(QuantityStepper), findsNothing);
    });

    testWidgets('runs the same quantity sheet -> onAdd flow the + did', (tester) async {
      final added = <int>[];
      await pumpCard(tester, isGrid: false, onAdd: added.add);

      await tester.tap(find.text('Add to cart'));
      await tester.pumpAndSettle();

      // The existing pre-add quantity sheet: step to 2, then confirm.
      await tester.tap(find.byIcon(Icons.add));
      await tester.pump();
      await tester.tap(find.text('Add'));
      await tester.pumpAndSettle();

      expect(added, [2]);
    });

    testWidgets('once the product is in the cart the slot is still the stepper', (tester) async {
      await pumpCard(tester, isGrid: false, cartQuantity: 3);

      expect(find.byType(QuantityStepper), findsOneWidget);
      expect(find.text('Add to cart'), findsNothing);
    });

    testWidgets('fits a phone-width row in Arabic', (tester) async {
      await loadRate(15000);
      await pumpCard(tester, isGrid: false, locale: const Locale('ar'));

      expect(find.text('إضافة إلى السلة'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  testWidgets('a medicine with no picture shows a medicine placeholder, not a letter or a blank box', (tester) async {
    for (final grid in [true, false]) {
      await pumpCard(tester, isGrid: grid);
      expect(find.byType(MedicinePlaceholder), findsOneWidget, reason: grid ? 'grid' : 'list');
      // The company's initial used to stand in here and read as a mistake.
      expect(find.byType(ManufacturerAvatar), findsNothing, reason: grid ? 'grid' : 'list');
      expect(tester.takeException(), isNull);
    }
  });

  group('strength, dosage form and batch dates', () {
    final full = ProductModel(
      id: 'p2',
      nameAr: 'METFORMIN-ELSAAD 1000 F.CTD TAB. WITH A LONG NAME',
      manufacturerAr: 'السعد',
      activeIngredient: 'METFORMIN',
      strength: '1000 MG',
      dosageForm: 'أقراص ملبسة',
      productionDate: DateTime(2026, 3, 1),
      expiryDate: DateTime(2028, 3, 1),
      priceUsd: 5,
      discountPriceUsd: 4,
      isAvailable: true,
      hasActiveOffer: true,
    );

    for (final isGrid in [true, false]) {
      testWidgets('${isGrid ? 'grid' : 'list'}: each shown on its own, nothing overflows', (tester) async {
        await loadRate(13800);
        // A catalog grid cell is as tall as its content (catalog_product_list.dart).
        await pumpCard(tester, product: full, isGrid: isGrid, gridHeight: null, locale: const Locale('ar'));
        expect(tester.takeException(), isNull);
        // The whole name, never cut off with "...".
        final name = tester.widget<Text>(find.text(full.nameAr));
        expect(name.maxLines, isNull);
        expect(name.overflow, isNot(TextOverflow.ellipsis));
        expect(find.textContaining('1000 MG'), findsOneWidget);
        expect(find.textContaining('أقراص ملبسة'), findsOneWidget);
        expect(find.text('METFORMIN'), findsOneWidget, reason: 'the strength is no longer folded into the ingredient');
        expect(find.textContaining('إنتاج 03/2026'), findsOneWidget);
        expect(find.textContaining('انتهاء 03/2028'), findsOneWidget);
      });
    }

    for (final isGrid in [true, false]) {
      testWidgets('${isGrid ? 'grid' : 'list'}: a small phone with a large font still fits everything', (tester) async {
        await loadRate(13800);
        final busy = ProductModel(
          id: 'p6',
          nameAr: full.nameAr,
          manufacturerAr: 'شركة الصناعات الدوائية المتحدة',
          activeIngredient: 'AMOXICILLIN + CLAVULANIC ACID',
          strength: '875 MG/125 MG',
          dosageForm: 'أقراص مغلفة بالفيلم',
          productionDate: full.productionDate,
          expiryDate: full.expiryDate,
          priceUsd: 50,
          discountPriceUsd: 40,
          isAvailable: true,
          hasActiveOffer: true,
          bonuses: const [BonusTier(buy: 10, free: 3)],
          regularBonuses: const [BonusTier(buy: 10, free: 2)],
        );
        tester.view.physicalSize = const Size(800, 4000);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        for (final quantity in [0, 12]) {
          await pumpCard(
            tester,
            product: busy,
            isGrid: isGrid,
            gridHeight: null,
            listWidth: 288,
            textScale: 1.3,
            cartQuantity: quantity,
            locale: const Locale('ar'),
          );
          expect(tester.takeException(), isNull, reason: 'cart quantity $quantity');
        }
      });
    }

    testWidgets('the strength keeps its left-to-right order inside the Arabic line', (tester) async {
      await loadRate(13800);
      final syrup = ProductModel(
        id: 'p9',
        nameAr: 'IBUPROFEN SUSP.',
        manufacturerAr: 'شركة',
        strength: '100 MG/5 ML',
        dosageForm: 'معلق',
        priceUsd: 5,
        discountPriceUsd: 5,
        isAvailable: true,
        hasActiveOffer: false,
      );
      await pumpCard(tester, product: syrup, isGrid: false, locale: const Locale('ar'));
      // Laid out left-to-right, so it renders "100 MG/5 ML", never "MG/5 ML 100".
      final strength = tester.widget<Text>(find.text('100 MG/5 ML'));
      expect(strength.textDirection, TextDirection.ltr);
    });

    testWidgets('a product without them shows none of it', (tester) async {
      await loadRate(13800);
      await pumpCard(tester, locale: const Locale('ar'));
      expect(find.textContaining('إنتاج'), findsNothing);
      expect(find.textContaining('انتهاء'), findsNothing);
    });
  });

  for (final isGrid in [true, false]) {
    testWidgets('${isGrid ? 'grid' : 'list'}: a medicine on offer wears the red badge and frame', (tester) async {
      await loadRate(13800);
      const onOffer = ProductModel(
        id: 'p4',
        nameAr: 'دواء',
        manufacturerAr: 'شركة',
        priceUsd: 5,
        discountPriceUsd: 4,
        isAvailable: true,
        hasActiveOffer: true,
      );
      await pumpCard(tester, product: onOffer, isGrid: isGrid, gridHeight: null);
      expect(find.byType(OfferBadge), findsOneWidget);
      expect(find.text('Special offer'), findsOneWidget);
      final card = tester.widget<CustomCard>(find.byType(CustomCard));
      expect(card.borderColor, isNotNull);

      // A regular medicine: no badge, no frame.
      await pumpCard(tester, isGrid: isGrid, gridHeight: null);
      expect(find.byType(OfferBadge), findsNothing);
      expect(tester.widget<CustomCard>(find.byType(CustomCard)).borderColor, isNull);
    });
  }

  testWidgets('a bonus offer shows the better bonus and the usual one it replaces', (tester) async {
    await loadRate(13800);
    const onOffer = ProductModel(
      id: 'p3',
      nameAr: 'دواء',
      manufacturerAr: 'شركة',
      priceUsd: 5,
      discountPriceUsd: 5,
      isAvailable: true,
      hasActiveOffer: true,
      bonuses: [BonusTier(buy: 10, free: 3)],
      regularBonuses: [BonusTier(buy: 10, free: 2)],
    );
    await pumpCard(tester, product: onOffer, isGrid: false, locale: const Locale('ar'));
    expect(find.text('بونص 10+3 بدل 10+2'), findsOneWidget);
  });
}
