import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/models/paginated_result.dart';
import 'package:feniq/features/advertisements/data/models/advertisement_model.dart';
import 'package:feniq/features/advertisements/data/repositories/advertisements_repository.dart';
import 'package:feniq/features/offers/data/models/offer_model.dart';
import 'package:feniq/features/offers/data/repositories/offers_repository.dart';
import 'package:feniq/features/promotions/presentation/managers/promotions_cubit.dart';
import 'package:feniq/features/promotions/presentation/managers/warehouse_offers_cubit.dart';

import 'promotions_fixtures.dart';

// Catalog overhaul Phase 6.3: GET /offers/active and /advertisements/active are
// cursor-paginated. The tab loads more as it scrolls; the per-warehouse offers
// screen walks every page so it still shows all of that warehouse's offers.

class _MockOffersRepository extends Mock implements OffersRepository {}

class _MockAdvertisementsRepository extends Mock implements AdvertisementsRepository {}

void main() {
  late _MockOffersRepository offersRepository;
  late _MockAdvertisementsRepository advertisementsRepository;

  setUp(() {
    offersRepository = _MockOffersRepository();
    advertisementsRepository = _MockAdvertisementsRepository();
    when(
      () => advertisementsRepository.getActiveAdvertisements(
        cursor: any(named: 'cursor'),
        limit: any(named: 'limit'),
      ),
    ).thenAnswer((_) async => const PaginatedResult<AdvertisementModel>(items: [], hasMore: false));
  });

  test('the tab appends the next page of offers when asked for more', () async {
    when(() => offersRepository.getActiveOffers(cursor: null, limit: any(named: 'limit'))).thenAnswer(
      (_) async => PaginatedResult(items: [offer(id: 'o1'), offer(id: 'o2')], hasMore: true, nextCursor: 'c1'),
    );
    when(() => offersRepository.getActiveOffers(cursor: 'c1', limit: any(named: 'limit'))).thenAnswer(
      (_) async => PaginatedResult(items: [offer(id: 'o3')], hasMore: false),
    );
    final cubit = PromotionsCubit(offersRepository: offersRepository, advertisementsRepository: advertisementsRepository);
    addTearDown(cubit.close);

    await cubit.load();
    expect(cubit.state.promotions.length, 2);
    expect(cubit.state.hasMore, isTrue);

    await cubit.loadMore();
    expect(cubit.state.promotions.length, 3);
    expect(cubit.state.hasMore, isFalse);

    // Nothing left: another call makes no request.
    await cubit.loadMore();
    verify(() => offersRepository.getActiveOffers(cursor: 'c1', limit: any(named: 'limit'))).called(1);
  });

  test('the warehouse offers screen walks every page and keeps only its warehouse', () async {
    when(() => offersRepository.getActiveOffers(cursor: null, limit: 100)).thenAnswer(
      (_) async => PaginatedResult<OfferModel>(
        items: [offer(id: 'a', warehouseId: 'W1'), offer(id: 'b', warehouseId: 'W2')],
        hasMore: true,
        nextCursor: 'next',
      ),
    );
    when(() => offersRepository.getActiveOffers(cursor: 'next', limit: 100)).thenAnswer(
      (_) async => PaginatedResult<OfferModel>(items: [offer(id: 'c', warehouseId: 'W1')], hasMore: false),
    );
    final cubit = WarehouseOffersCubit(offersRepository: offersRepository, warehouseId: 'W1');
    addTearDown(cubit.close);

    await cubit.load();
    expect(cubit.state.promotions.map((p) => p.warehouseId).toSet(), {'W1'});
    expect(cubit.state.promotions.length, 2);
  });
}
