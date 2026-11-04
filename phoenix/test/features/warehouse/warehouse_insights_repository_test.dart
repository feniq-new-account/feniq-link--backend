import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/core/network/api_client.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_management_repository_impl.dart';

class Client extends Mock implements ApiClient {}

class Transport extends Mock implements Dio {}

void main() {
  late Transport dio;
  late WarehouseManagementRepositoryImpl repo;
  Map<String, dynamic> response() => {
    'asOfBusiness': '2026-10-29 14:30',
    'totals': {
      'salesSyp': 200,
      'netSalesSyp': 150,
      'collectionsSyp': 100,
      'returnsSyp': 50,
    },
    'aging': {
      'totalDebtSyp': 1000,
      'unknownAgeSyp': 700,
      'buckets': [300, 0, 0, 0],
    },
    'daily': <dynamic>[],
  };
  setUp(() {
    final client = Client();
    dio = Transport();
    when(() => client.dio).thenReturn(dio);
    repo = WarehouseManagementRepositoryImpl(apiClient: client);
  });
  void serve(Map<String, dynamic> data) {
    when(
      () => dio.get(any(), queryParameters: any(named: 'queryParameters')),
    ).thenAnswer(
      (_) async => Response(
        data: data,
        requestOptions: RequestOptions(path: '/warehouse/insights/report'),
        statusCode: 200,
      ),
    );
  }

  test(
    'unknown-age debt is preserved separately from dated invoice bands',
    () async {
      serve(response());
      final result = await repo.getInsights();
      expect(result.debtSyp, 1000);
      expect(result.unknownAgeSyp, 700);
      expect(
        result.aging.reduce((a, b) => a + b) + result.unknownAgeSyp,
        result.debtSyp,
      );
    },
  );
  test(
    'an incomplete report is an error rather than invented zero money',
    () async {
      final data = response();
      (data['totals'] as Map).remove('netSalesSyp');
      serve(data);
      await expectLater(
        repo.getInsights(),
        throwsA(
          isA<ServerFailure>().having(
            (f) => f.code,
            'code',
            FailureCode.unexpected,
          ),
        ),
      );
    },
  );
  test('malformed numeric bands cannot be presented as real aging', () async {
    final data = response();
    (data['aging'] as Map)['buckets'] = [1, 2, '3', 4];
    serve(data);
    await expectLater(repo.getInsights(), throwsA(isA<ServerFailure>()));
  });
}
