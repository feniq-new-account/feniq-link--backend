import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/widgets/offer_badge.dart';
import 'package:feniq/features/exchange_rate/data/repositories/exchange_rate_repository.dart';
import 'package:feniq/features/exchange_rate/presentation/managers/exchange_rate_cubit.dart';
import 'package:feniq/features/promotions/data/models/promotion.dart';
import 'package:feniq/features/promotions/presentation/widgets/promotion_hero_card.dart';
import 'package:feniq/generated/app_localizations.dart';

import 'promotions_fixtures.dart';

class _MockExchangeRateRepository extends Mock implements ExchangeRateRepository {}

// An offer card leads with the medicine (its English name), the offer's own
// title small under it, and wears the red exceptional-offer badge; a package
// card keeps its title and its own badge.
void main() {
  late ExchangeRateCubit rateCubit;
  setUp(() => rateCubit = ExchangeRateCubit(exchangeRateRepository: _MockExchangeRateRepository()));
  tearDown(() => rateCubit.close());

  Future<void> pump(WidgetTester tester, Widget card) => tester.pumpWidget(
    MaterialApp(
      locale: const Locale('ar'),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: BlocProvider<ExchangeRateCubit>.value(
        value: rateCubit,
        child: Scaffold(body: SingleChildScrollView(child: SizedBox(width: 360, child: card))),
      ),
    ),
  );

  testWidgets('list card: the medicine first, the offer title under it, the red badge', (tester) async {
    final promotion = OfferPromotion(offer(productNameEn: 'PANADOL 500 MG'));
    await pump(tester, PromotionListCard(promotion: promotion, onTap: () {}));
    expect(find.text('PANADOL 500 MG'), findsOneWidget);
    expect(find.text('عرض o1'), findsOneWidget);
    expect(find.byType(OfferBadge), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('hero card: the same order', (tester) async {
    final promotion = OfferPromotion(offer(productNameEn: 'PANADOL 500 MG'));
    await pump(tester, PromotionHeroCard(promotion: promotion, onTap: () {}));
    expect(find.text('PANADOL 500 MG'), findsOneWidget);
    expect(find.text('عرض o1'), findsOneWidget);
    expect(find.byType(OfferBadge), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a package keeps its title and has no offer badge', (tester) async {
    final promotion = PackagePromotion(advertisement());
    await pump(tester, PromotionListCard(promotion: promotion, onTap: () {}));
    expect(find.text('سلة a1'), findsOneWidget);
    expect(find.byType(OfferBadge), findsNothing);
  });
}
