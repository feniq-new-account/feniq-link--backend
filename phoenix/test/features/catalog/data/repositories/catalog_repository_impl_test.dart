import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/core/models/paginated_result.dart';
import 'package:feniq/core/network/api_client.dart';
import 'package:feniq/core/network/endpoints.dart';
import 'package:feniq/core/session/session_scope.dart';
import 'package:feniq/features/catalog/data/models/category_model.dart';
import 'package:feniq/features/catalog/data/models/manufacturer_model.dart';
import 'package:feniq/features/catalog/data/models/product_model.dart';
import 'package:feniq/features/catalog/data/repositories/catalog_repository_impl.dart';

class MockApiClient extends Mock implements ApiClient {}

class MockDio extends Mock implements Dio {}

void main() {
  late MockApiClient mockApiClient;
  late MockDio mockDio;
  late CatalogRepositoryImpl catalogRepository;

  setUp(() {
    mockApiClient = MockApiClient();
    mockDio = MockDio();
    when(() => mockApiClient.dio).thenReturn(mockDio);
    catalogRepository = CatalogRepositoryImpl(apiClient: mockApiClient);
  });

  group('CatalogRepositoryImpl', () {
    group('getCategories', () {
      test('returns list of categories on success', () async {
        final responseData = {
          'categories': [
            {
              'id': 'cat1',
              'nameAr': 'أدوية',
              'nameEn': 'Medicines',
              'sortOrder': 1,
            },
            {
              'id': 'cat2',
              'nameAr': 'مكملات',
              'nameEn': 'Supplements',
              'sortOrder': 2,
            },
          ],
        };

        when(() => mockDio.get(any())).thenAnswer(
          (_) async => Response(
            data: responseData,
            statusCode: 200,
            requestOptions: RequestOptions(path: ''),
          ),
        );

        final categories = await catalogRepository.getCategories();

        expect(categories, isA<List<CategoryModel>>());
        expect(categories.length, equals(2));
        expect(categories[0].id, equals('cat1'));
        expect(categories[0].nameAr, equals('أدوية'));
        expect(categories[1].id, equals('cat2'));
        verify(() => mockDio.get(Endpoints.categories)).called(1);
      });

      test('returns empty list when no categories', () async {
        final responseData = {'categories': []};

        when(() => mockDio.get(any())).thenAnswer(
          (_) async => Response(
            data: responseData,
            statusCode: 200,
            requestOptions: RequestOptions(path: ''),
          ),
        );

        final categories = await catalogRepository.getCategories();

        expect(categories, isEmpty);
      });

      test('throws ServerFailure on API error', () async {
        final dioError = DioException(
          requestOptions: RequestOptions(path: ''),
          type: DioExceptionType.connectionTimeout,
        );

        when(() => mockDio.get(any())).thenThrow(dioError);

        expect(
          () => catalogRepository.getCategories(),
          throwsA(isA<ServerFailure>()),
        );
      });

      test('throws ServerFailure on bad response', () async {
        final dioError = DioException(
          requestOptions: RequestOptions(path: ''),
          type: DioExceptionType.badResponse,
          response: Response(
            statusCode: 404,
            data: {'message': 'Not found'},
            requestOptions: RequestOptions(path: ''),
          ),
        );

        when(() => mockDio.get(any())).thenThrow(dioError);

        expect(
          () => catalogRepository.getCategories(),
          throwsA(isA<ServerFailure>()),
        );
      });
    });

    group('getProducts', () {
      test('returns paginated products with all filters', () async {
        final responseData = {
          'products': [
            {
              'id': 'prod1',
              'nameAr': 'أسبرين',
              'manufacturerAr': 'بايير',
              'priceUsd': 5.0,
              'discountPriceUsd': 4.0,
              'isAvailable': true,
            },
          ],
          'pagination': {'hasMore': true, 'nextCursor': 'cursor123'},
        };

        when(
          () => mockDio.get(
            any(),
            queryParameters: any(named: 'queryParameters'),
          ),
        ).thenAnswer(
          (_) async => Response(
            data: responseData,
            statusCode: 200,
            requestOptions: RequestOptions(path: ''),
          ),
        );

        final result = await catalogRepository.getProducts(
          warehouseId: 'warehouse1',
          search: 'aspirin',
          categoryId: 'cat1',
          manufacturer: 'Bayer',
          limit: 20,
          after: 'prev_cursor',
        );

        expect(result, isA<PaginatedResult<ProductModel>>());
        expect(result.items.length, equals(1));
        expect(result.items[0].id, equals('prod1'));
        expect(result.hasMore, isTrue);
        expect(result.nextCursor, equals('cursor123'));

        verify(
          () => mockDio.get(
            Endpoints.warehouseProducts('warehouse1'),
            queryParameters: {
              'search': 'aspirin',
              'categoryId': 'cat1',
              'manufacturer': 'Bayer',
              'limit': 20,
              'after': 'prev_cursor',
            },
          ),
        ).called(1);
      });

      test('includes only non-null query parameters', () async {
        final responseData = {
          'products': [],
          'pagination': {'hasMore': false},
        };

        when(
          () => mockDio.get(
            any(),
            queryParameters: any(named: 'queryParameters'),
          ),
        ).thenAnswer(
          (_) async => Response(
            data: responseData,
            statusCode: 200,
            requestOptions: RequestOptions(path: ''),
          ),
        );

        await catalogRepository.getProducts(warehouseId: 'warehouse1');

        verify(
          () => mockDio.get(
            Endpoints.warehouseProducts('warehouse1'),
            queryParameters: {},
          ),
        ).called(1);
      });

      test('ignores empty search parameter', () async {
        final responseData = {
          'products': [],
          'pagination': {'hasMore': false},
        };

        when(
          () => mockDio.get(
            any(),
            queryParameters: any(named: 'queryParameters'),
          ),
        ).thenAnswer(
          (_) async => Response(
            data: responseData,
            statusCode: 200,
            requestOptions: RequestOptions(path: ''),
          ),
        );

        await catalogRepository.getProducts(
          warehouseId: 'warehouse1',
          search: '',
        );

        verify(
          () => mockDio.get(
            any(),
            queryParameters: any(named: 'queryParameters'),
          ),
        ).called(1);
      });

      test('returns empty products list', () async {
        final responseData = {
          'products': [],
          'pagination': {'hasMore': false},
        };

        when(
          () => mockDio.get(
            any(),
            queryParameters: any(named: 'queryParameters'),
          ),
        ).thenAnswer(
          (_) async => Response(
            data: responseData,
            statusCode: 200,
            requestOptions: RequestOptions(path: ''),
          ),
        );

        final result = await catalogRepository.getProducts(
          warehouseId: 'warehouse1',
        );

        expect(result.items, isEmpty);
        expect(result.hasMore, isFalse);
      });

      test('throws ServerFailure on API error', () async {
        final dioError = DioException(
          requestOptions: RequestOptions(path: ''),
          type: DioExceptionType.receiveTimeout,
        );

        when(
          () => mockDio.get(
            any(),
            queryParameters: any(named: 'queryParameters'),
          ),
        ).thenThrow(dioError);

        expect(
          () => catalogRepository.getProducts(warehouseId: 'warehouse1'),
          throwsA(isA<ServerFailure>()),
        );
      });
    });

    group('getManufacturers', () {
      test('parses each manufacturer with its discount percentage', () async {
        final responseData = {
          'manufacturers': [
            {'manufacturerAr': 'باير', 'discountPercentage': 10},
            {'manufacturerAr': 'نوفارتس', 'discountPercentage': 0},
          ],
        };

        when(() => mockDio.get(any())).thenAnswer(
          (_) async => Response(
            data: responseData,
            statusCode: 200,
            requestOptions: RequestOptions(path: ''),
          ),
        );

        final manufacturers = await catalogRepository.getManufacturers(
          warehouseId: 'warehouse1',
        );

        expect(manufacturers, isA<List<ManufacturerModel>>());
        expect(manufacturers.map((m) => m.name), equals(['باير', 'نوفارتس']));
        expect(manufacturers[0].discountPercentage, equals(10));
        expect(manufacturers[1].discountPercentage, equals(0));
        verify(
          () => mockDio.get(Endpoints.warehouseManufacturers('warehouse1')),
        ).called(1);
      });

      test('falls back to 0 discount for a bare name string', () async {
        final responseData = {
          'manufacturers': ['Bayer', 'Pfizer'],
        };

        when(() => mockDio.get(any())).thenAnswer(
          (_) async => Response(
            data: responseData,
            statusCode: 200,
            requestOptions: RequestOptions(path: ''),
          ),
        );

        final manufacturers = await catalogRepository.getManufacturers(
          warehouseId: 'warehouse1',
        );

        expect(manufacturers.map((m) => m.name), equals(['Bayer', 'Pfizer']));
        expect(manufacturers.every((m) => m.discountPercentage == 0), isTrue);
      });

      test('returns empty list when no manufacturers', () async {
        final responseData = {'manufacturers': []};

        when(() => mockDio.get(any())).thenAnswer(
          (_) async => Response(
            data: responseData,
            statusCode: 200,
            requestOptions: RequestOptions(path: ''),
          ),
        );

        final manufacturers = await catalogRepository.getManufacturers(
          warehouseId: 'warehouse1',
        );

        expect(manufacturers, isEmpty);
      });

      test('throws ServerFailure on API error', () async {
        final dioError = DioException(
          requestOptions: RequestOptions(path: ''),
          type: DioExceptionType.badResponse,
          response: Response(
            statusCode: 500,
            data: {'message': 'Server error'},
            requestOptions: RequestOptions(path: ''),
          ),
        );

        when(() => mockDio.get(any())).thenThrow(dioError);

        expect(
          () => catalogRepository.getManufacturers(warehouseId: 'warehouse1'),
          throwsA(isA<ServerFailure>()),
        );
      });
    });

    // Catalog overhaul Phase 11 (L4).
    group('categories session cache', () {
      Response<dynamic> categoriesResponse() => Response(
            data: {
              'categories': [
                {'id': 'cat1', 'nameAr': 'أدوية', 'nameEn': 'Medicines', 'sortOrder': 1},
              ],
            },
            statusCode: 200,
            requestOptions: RequestOptions(path: ''),
          );

      test('reads the categories once and reuses them on every open', () async {
        when(() => mockDio.get(any())).thenAnswer((_) async => categoriesResponse());

        final first = await catalogRepository.getCategories();
        final second = await catalogRepository.getCategories();

        expect(first.single.id, 'cat1');
        expect(identical(first, second), isTrue);
        verify(() => mockDio.get(Endpoints.categories)).called(1);
      });

      test('two opens racing share one request', () async {
        when(() => mockDio.get(any())).thenAnswer((_) async => categoriesResponse());

        await Future.wait([catalogRepository.getCategories(), catalogRepository.getCategories()]);

        verify(() => mockDio.get(Endpoints.categories)).called(1);
      });

      test('a failed read is not cached', () async {
        var calls = 0;
        when(() => mockDio.get(any())).thenAnswer((_) async {
          calls += 1;
          if (calls == 1) {
            throw DioException(requestOptions: RequestOptions(path: ''), type: DioExceptionType.connectionError);
          }
          return categoriesResponse();
        });

        await expectLater(catalogRepository.getCategories(), throwsA(isA<ServerFailure>()));
        final categories = await catalogRepository.getCategories();

        expect(categories.single.id, 'cat1');
        expect(calls, 2);
      });

      test('a sign-out drops the cache, so the next account reads fresh', () async {
        final scope = SessionScope();
        final repository = CatalogRepositoryImpl(apiClient: mockApiClient, sessionScope: scope);
        when(() => mockDio.get(any())).thenAnswer((_) async => categoriesResponse());

        await repository.getCategories();
        scope.resetAll();
        await repository.getCategories();

        verify(() => mockDio.get(Endpoints.categories)).called(2);
      });
    });

    group('a malformed product row', () {
      test('is skipped instead of failing the whole page', () async {
        when(
          () => mockDio.get(any(), queryParameters: any(named: 'queryParameters')),
        ).thenAnswer(
          (_) async => Response(
            data: {
              'products': [
                {'id': 'ok1', 'nameAr': 'أسبرين', 'manufacturerAr': 'بايير', 'priceUsd': 5, 'discountPriceUsd': 5, 'isAvailable': true},
                // No id and no price.
                {'nameAr': 'مكسور', 'manufacturerAr': 'بايير'},
                {'id': 'ok2', 'nameAr': 'بنادول', 'priceUsd': 3, 'discountPriceUsd': 3, 'isAvailable': true},
              ],
              'pagination': {'hasMore': true, 'nextCursor': 'ok2'},
            },
            statusCode: 200,
            requestOptions: RequestOptions(path: ''),
          ),
        );

        final result = await catalogRepository.getProducts(warehouseId: 'w1');

        expect(result.items.map((p) => p.id), ['ok1', 'ok2']);
        // A missing manufacturer falls back instead of crashing.
        expect(result.items[1].manufacturerAr, '');
        expect(result.hasMore, isTrue);
        expect(result.nextCursor, 'ok2');
      });
    });
  });
}
