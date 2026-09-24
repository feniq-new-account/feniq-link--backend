import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/models/paginated_result.dart';
import 'package:feniq/features/catalog/data/models/manufacturer_model.dart';
import 'package:feniq/features/catalog/data/models/product_model.dart';
import 'package:feniq/features/catalog/data/repositories/catalog_repository.dart';
import 'package:feniq/features/catalog/presentation/managers/catalog_cubit.dart';
import 'package:feniq/features/catalog/presentation/managers/catalog_state.dart';
import 'package:feniq/features/catalog/presentation/widgets/manufacturer_avatar.dart';

class MockCatalogRepository extends Mock implements CatalogRepository {}

const _product = ProductModel(
  id: 'p1',
  nameAr: 'باراسيتامول',
  manufacturerAr: 'شركة',
  priceUsd: 1,
  discountPriceUsd: 1,
  isAvailable: true,
  hasActiveOffer: false,
);

void main() {
  late MockCatalogRepository repository;

  setUp(() {
    repository = MockCatalogRepository();
    when(
      () => repository.getProducts(
        warehouseId: any(named: 'warehouseId'),
        search: any(named: 'search'),
        categoryId: any(named: 'categoryId'),
        manufacturer: any(named: 'manufacturer'),
        limit: any(named: 'limit'),
        after: any(named: 'after'),
      ),
    ).thenAnswer((_) async => const PaginatedResult(items: [_product], hasMore: false, nextCursor: null));
  });

  group('warehouse-wide search (no manufacturer)', () {
    blocTest<CatalogCubit, CatalogState>(
      'typing searches the whole warehouse - no manufacturer filter is sent',
      build: () => CatalogCubit(catalogRepository: repository, warehouseId: 'w1'),
      act: (cubit) => cubit.search('بارا'),
      wait: const Duration(milliseconds: 500),
      verify: (_) {
        verify(
          () => repository.getProducts(
            warehouseId: 'w1',
            search: 'بارا',
            categoryId: null,
            manufacturer: null,
            limit: any(named: 'limit'),
            after: any(named: 'after'),
          ),
        ).called(1);
      },
      expect: () => [
        isA<CatalogState>().having((s) => s.searchQuery, 'searchQuery', 'بارا'),
        isA<CatalogState>().having((s) => s.status, 'status', CatalogStatus.loading),
        isA<CatalogState>()
            .having((s) => s.status, 'status', CatalogStatus.loaded)
            .having((s) => s.products.length, 'products', 1),
      ],
    );

    blocTest<CatalogCubit, CatalogState>(
      'clearing the query goes straight back to idle and never requests "everything"',
      build: () => CatalogCubit(catalogRepository: repository, warehouseId: 'w1'),
      act: (cubit) {
        cubit.search('بارا');
        cubit.search('');
      },
      wait: const Duration(milliseconds: 500),
      verify: (_) {
        verifyNever(
          () => repository.getProducts(
            warehouseId: any(named: 'warehouseId'),
            search: any(named: 'search'),
            categoryId: any(named: 'categoryId'),
            manufacturer: any(named: 'manufacturer'),
            limit: any(named: 'limit'),
            after: any(named: 'after'),
          ),
        );
      },
      expect: () => [
        isA<CatalogState>().having((s) => s.searchQuery, 'searchQuery', 'بارا'),
        isA<CatalogState>().having((s) => s.status, 'status', CatalogStatus.initial),
      ],
    );
  });

  group('ManufacturerModel', () {
    test('parses the new optional fields', () {
      final model = ManufacturerModel.fromJson({
        'manufacturerAr': 'شركة',
        'discountPercentage': 2.5,
        'manufacturerId': 'm1',
        'manufacturerEn': 'Co',
        'logoUrl': 'https://res.cloudinary.com/x/l.png',
      });
      expect(model.id, 'm1');
      expect(model.nameEn, 'Co');
      expect(model.logoUrl, 'https://res.cloudinary.com/x/l.png');
      expect(model.discountPercentage, 2.5);
    });

    test('an older backend without them still parses', () {
      final model = ManufacturerModel.fromJson({'manufacturerAr': 'شركة', 'discountPercentage': 0});
      expect(model.id, isNull);
      expect(model.logoUrl, isNull);
      expect(ManufacturerModel.fromJson('شركة').name, 'شركة');
    });
  });

  group('ManufacturerAvatar', () {
    test('the placeholder colour is deterministic per manufacturer id', () {
      expect(ManufacturerAvatar.colorFor('abc123'), ManufacturerAvatar.colorFor('abc123'));
      final colours = {for (final id in ['a1', 'b2', 'c3', 'd4', 'e5', 'f6']) ManufacturerAvatar.colorFor(id)};
      expect(colours.length, greaterThan(1));
    });

    test('the placeholder letter is the first character of the name', () {
      expect(ManufacturerAvatar.initialOf('شركة الشرق'), 'ش');
      expect(ManufacturerAvatar.initialOf(' pfizer'), 'P');
      expect(ManufacturerAvatar.initialOf(''), '?');
    });
  });
}
