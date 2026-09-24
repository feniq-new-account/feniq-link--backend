// Names in one language only (catalog overhaul, pre-merge review): the app
// shows a product's or manufacturer's name in the UI language, else the other
// one - never an empty name, never a skipped product.
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/utils/display_name.dart';
import 'package:feniq/features/cart/data/models/order_line_item.dart';
import 'package:feniq/features/catalog/data/models/manufacturer_model.dart';
import 'package:feniq/features/catalog/data/models/product_model.dart';
import 'package:feniq/features/catalog/presentation/widgets/manufacturer_card.dart';
import 'package:feniq/features/catalog/presentation/widgets/product_card.dart';
import 'package:feniq/features/exchange_rate/data/repositories/exchange_rate_repository.dart';
import 'package:feniq/features/exchange_rate/presentation/managers/exchange_rate_cubit.dart';
import 'package:feniq/generated/app_localizations.dart';

class _MockExchangeRateRepository extends Mock implements ExchangeRateRepository {}

ProductModel _parse(Map<String, dynamic> names) => ProductModel.fromJson({
      'id': 'p1',
      ...names,
      'priceUsd': 5,
      'discountPriceUsd': 5,
      'isAvailable': true,
    });

void main() {
  group('pickName', () {
    test('the UI language first, else the other language', () {
      expect(pickName('بنادول', 'Panadol', arabic: true), 'بنادول');
      expect(pickName('بنادول', 'Panadol', arabic: false), 'Panadol');
      expect(pickName(null, 'Panadol', arabic: true), 'Panadol');
      expect(pickName('', 'Panadol', arabic: true), 'Panadol');
      expect(pickName('بنادول', null, arabic: false), 'بنادول');
      expect(pickName('بنادول', '  ', arabic: false), 'بنادول');
    });

    test('never an empty name', () {
      expect(pickName(null, null, arabic: true), isNotEmpty);
      expect(pickName('', ' ', arabic: false), isNotEmpty);
    });
  });

  group('parsing a missing Arabic name', () {
    test('a product with only an English name is parsed, not skipped', () {
      final product = ProductModel.tryFromJson({
        'id': 'p1',
        'nameAr': null,
        'nameEn': 'Zyrtec 10mg',
        'manufacturerAr': 'جي اس كي',
        'priceUsd': 5,
        'discountPriceUsd': 5,
        'isAvailable': true,
      });
      expect(product, isNotNull);
      expect(product!.nameAr, '');
      expect(product.nameEn, 'Zyrtec 10mg');
    });

    test('an order line with only an English name parses (productNameAr null)', () {
      final line = OrderLineItem.fromJson({
        'id': 'l1',
        'productId': 'p1',
        'productNameAr': null,
        'productNameEn': 'Zyrtec 10mg',
        'manufacturerAr': 'جي اس كي',
        'quantity': 2,
        'unitPrice': 100,
        'discountPrice': 100,
        'lineTotal': 200,
      });
      expect(pickName(line.productNameAr, line.productNameEn, arabic: true), 'Zyrtec 10mg');
    });
  });

  group('ProductCard', () {
    late ExchangeRateCubit rateCubit;

    setUp(() => rateCubit = ExchangeRateCubit(exchangeRateRepository: _MockExchangeRateRepository()));
    tearDown(() => rateCubit.close());

    Future<void> pump(WidgetTester tester, ProductModel product, Locale locale) {
      return tester.pumpWidget(
        MaterialApp(
          locale: locale,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: BlocProvider<ExchangeRateCubit>.value(
            value: rateCubit,
            child: Scaffold(
              body: Center(
                child: SizedBox(
                  width: 328,
                  child: ProductCard(product: product, isGrid: false, onAdd: (_) {}),
                ),
              ),
            ),
          ),
        ),
      );
    }

    testWidgets('an English-only product shows its English name in the Arabic app', (tester) async {
      await pump(tester, _parse({'nameAr': null, 'nameEn': 'Zyrtec 10mg', 'manufacturerAr': 'جي اس كي'}), const Locale('ar'));
      expect(find.text('Zyrtec 10mg'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('an Arabic-only product shows its Arabic name in the English app', (tester) async {
      await pump(tester, _parse({'nameAr': 'بنادول', 'nameEn': null, 'manufacturerAr': 'جي اس كي'}), const Locale('en'));
      expect(find.text('بنادول'), findsOneWidget);
    });

    testWidgets('with both names, each UI shows its own', (tester) async {
      final both = _parse({'nameAr': 'بنادول', 'nameEn': 'Panadol', 'manufacturerAr': 'جي اس كي', 'manufacturerEn': 'GSK'});
      await pump(tester, both, const Locale('ar'));
      expect(find.text('بنادول'), findsOneWidget);
      expect(find.text('جي اس كي'), findsOneWidget);
      await pump(tester, both, const Locale('en'));
      expect(find.text('Panadol'), findsOneWidget);
      expect(find.text('GSK'), findsOneWidget);
    });
  });

  group('ManufacturerCard', () {
    Future<void> pump(WidgetTester tester, ManufacturerModel manufacturer, Locale locale) {
      return tester.pumpWidget(
        MaterialApp(
          locale: locale,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(
            body: Center(
              child: SizedBox(
                width: 160,
                height: 200,
                child: ManufacturerCard(manufacturer: manufacturer, onSelect: () {}),
              ),
            ),
          ),
        ),
      );
    }

    testWidgets('the English UI shows the English company name, else the Arabic one', (tester) async {
      await pump(tester, const ManufacturerModel(name: 'جي اس كي', nameEn: 'GSK'), const Locale('en'));
      expect(find.text('GSK'), findsOneWidget);
      await pump(tester, const ManufacturerModel(name: 'شركة محلية'), const Locale('en'));
      expect(find.text('شركة محلية'), findsOneWidget);
      await pump(tester, const ManufacturerModel(name: 'جي اس كي', nameEn: 'GSK'), const Locale('ar'));
      expect(find.text('جي اس كي'), findsOneWidget);
    });
  });
}
