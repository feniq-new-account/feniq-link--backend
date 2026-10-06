import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/widgets/sliver_row_grid.dart';
import 'package:feniq/features/catalog/data/models/product_model.dart';
import 'package:feniq/features/catalog/presentation/widgets/product_card.dart';
import 'package:feniq/features/exchange_rate/data/repositories/exchange_rate_repository.dart';
import 'package:feniq/features/exchange_rate/presentation/managers/exchange_rate_cubit.dart';
import 'package:feniq/features/warehouse_selection/data/models/warehouse_model.dart';
import 'package:feniq/features/warehouse_selection/presentation/widgets/warehouse_card.dart';
import 'package:feniq/generated/app_localizations.dart';

class _MockExchangeRateRepository extends Mock implements ExchangeRateRepository {}

// The content-sized grid measures its rows (IntrinsicHeight). Cards WITH a
// picture and a logo must lay out there too - the image widget sizes itself
// with a LayoutBuilder, which cannot be measured that way unless something
// above it fixes its size.
void main() {
  late ExchangeRateCubit rateCubit;
  setUp(() => rateCubit = ExchangeRateCubit(exchangeRateRepository: _MockExchangeRateRepository()));
  tearDown(() => rateCubit.close());

  Future<void> pumpGrid(WidgetTester tester, int count, IndexedWidgetBuilder builder, double maxExtent) {
    return tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: BlocProvider<ExchangeRateCubit>.value(
          value: rateCubit,
          child: Scaffold(
            body: CustomScrollView(
              slivers: [
                SliverRowGrid(maxCrossAxisExtent: maxExtent, itemCount: count, itemBuilder: builder),
              ],
            ),
          ),
        ),
      ),
    );
  }

  testWidgets('medicine cards with pictures lay out in rows', (tester) async {
    await pumpGrid(tester, 3, (context, i) => ProductCard(
      product: ProductModel(
        id: 'p$i',
        nameAr: i == 1 ? 'A MEDICINE WITH A MUCH LONGER NAME THAT WRAPS' : 'MED $i',
        manufacturerAr: 'شركة',
        image: 'https://res.cloudinary.com/demo/image/upload/v1/catalog/p$i.webp',
        priceUsd: 5,
        discountPriceUsd: 5,
        isAvailable: true,
        hasActiveOffer: i == 2,
      ),
      isGrid: true,
      onAdd: (_) {},
    ), 170);
    await tester.pump();
    expect(tester.takeException(), isNull);
    expect(find.byType(ProductCard), findsNWidgets(3));
  });

  testWidgets('warehouse cards with logos lay out in rows', (tester) async {
    await pumpGrid(tester, 2, (context, i) => WarehouseCard(
      warehouse: WarehouseModel(
        id: 'w$i',
        nameAr: 'مستودع $i',
        nameEn: 'Warehouse $i',
        city: 'Latakia',
        phone: '0940000001',
        logo: 'https://res.cloudinary.com/demo/image/upload/v1/warehouses/w$i.png',
      ),
      onSelect: () {},
      onViewProfile: () {},
    ), 210);
    await tester.pump();
    expect(tester.takeException(), isNull);
    expect(find.byType(WarehouseCard), findsNWidgets(2));
  });
}
