// Product names (catalog overhaul, pre-merge review): the Arabic name is the
// medicine's name and the only one shown - in the Arabic and the English UI
// alike. The English name is a search helper and never appears on screen.
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/features/cart/data/models/order_line_item.dart';
import 'package:feniq/features/catalog/data/models/manufacturer_model.dart';
import 'package:feniq/features/catalog/data/models/product_model.dart';
import 'package:feniq/features/catalog/presentation/widgets/manufacturer_card.dart';
import 'package:feniq/features/catalog/presentation/widgets/product_card.dart';
import 'package:feniq/features/exchange_rate/data/repositories/exchange_rate_repository.dart';
import 'package:feniq/features/exchange_rate/presentation/managers/exchange_rate_cubit.dart';
import 'package:feniq/generated/app_localizations.dart';

class _MockExchangeRateRepository extends Mock implements ExchangeRateRepository {}

final _panadol = ProductModel.fromJson({
  'id': 'p1',
  'nameAr': 'بنادول 500',
  'nameEn': 'Panadol 500',
  'manufacturerAr': 'جي اس كي',
  'manufacturerEn': 'GSK',
  'priceUsd': 5,
  'discountPriceUsd': 5,
  'isAvailable': true,
});

void main() {
  group('ProductCard', () {
    late ExchangeRateCubit rateCubit;

    setUp(() => rateCubit = ExchangeRateCubit(exchangeRateRepository: _MockExchangeRateRepository()));
    tearDown(() => rateCubit.close());

    Future<void> pump(WidgetTester tester, Locale locale, {required bool isGrid}) {
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
                  width: isGrid ? 160 : 328,
                  height: isGrid ? 316 : null,
                  child: ProductCard(product: _panadol, isGrid: isGrid, onAdd: (_) {}),
                ),
              ),
            ),
          ),
        ),
      );
    }

    for (final isGrid in [true, false]) {
      testWidgets('the English UI shows the Arabic product and company names (${isGrid ? 'grid' : 'list'})', (tester) async {
        await pump(tester, const Locale('en'), isGrid: isGrid);
        expect(find.text('بنادول 500'), findsOneWidget);
        expect(find.text('جي اس كي'), findsOneWidget);
        expect(find.text('Panadol 500'), findsNothing);
        expect(find.text('GSK'), findsNothing);
      });
    }

    testWidgets('the Arabic UI shows the Arabic names too', (tester) async {
      await pump(tester, const Locale('ar'), isGrid: true);
      expect(find.text('بنادول 500'), findsOneWidget);
      expect(find.text('Panadol 500'), findsNothing);
    });
  });

  testWidgets('the manufacturer card shows the Arabic company name in the English UI', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('en'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: Center(
            child: SizedBox(
              width: 160,
              height: 200,
              child: ManufacturerCard(
                manufacturer: const ManufacturerModel(name: 'جي اس كي', nameEn: 'GSK'),
                onSelect: () {},
              ),
            ),
          ),
        ),
      ),
    );
    expect(find.text('جي اس كي'), findsOneWidget);
    expect(find.text('GSK'), findsNothing);
  });

  group('parsing', () {
    test('the English name is never put in place of the Arabic one', () {
      final product = ProductModel.fromJson({
        'id': 'p1',
        'nameAr': null,
        'nameEn': 'Panadol 500',
        'priceUsd': 5,
        'discountPriceUsd': 5,
        'isAvailable': true,
      });
      expect(product.nameAr, '');
      expect(product.nameEn, 'Panadol 500');
    });

    test('an order line without an Arabic name still parses', () {
      final line = OrderLineItem.fromJson({
        'id': 'l1',
        'productId': 'p1',
        'productNameAr': null,
        'productNameEn': 'Panadol 500',
        'manufacturerAr': 'جي اس كي',
        'quantity': 2,
        'unitPrice': 100,
        'discountPrice': 100,
        'lineTotal': 200,
      });
      expect(line.productNameAr, '');
    });
  });
}
