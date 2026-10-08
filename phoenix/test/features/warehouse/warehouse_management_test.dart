import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/features/debts/data/models/debt_detail_model.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_management_models.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_management_repository.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_accounts_cubit.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_rep_detail_cubit.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_reps_cubit.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_returns_cubit.dart';

class MockRepo extends Mock implements WarehouseManagementRepository {}

const _rep = WarehouseRep(id: 'r1', name: 'أحمد', phone: '0940000201', commissionRate: 2, pharmacyCount: 3, visits30d: 7);

WarehouseReturn _return(String id, {String status = 'pending'}) => WarehouseReturn(
  id: id,
  status: status,
  orderNumber: 9,
  items: const [WarehouseReturnItem(quantity: 2, reasonType: 'damaged')],
);

const _statement = WarehouseStatement(
  pharmacyNameAr: 'صيدلية',
  pharmacyNameEn: 'Pharmacy',
  closingSyp: 5000,
  summary: StatementSummary(chargesSyp: 5000, paymentsSyp: 0, returnCreditsSyp: 0, adjustmentsSyp: 0),
  rows: [],
);

void main() {
  late MockRepo repo;

  setUp(() => repo = MockRepo());

  group('models', () {
    test('a rep row reads its month numbers', () {
      final rep = WarehouseRep.fromJson({
        'id': 'r1',
        'name': 'Ahmad',
        'phone': '0940000201',
        'isActive': false,
        'commissionRate': 1.5,
        'pharmacyCount': 4,
        'monthCommission': {'repAmount': 300, 'feniqAmount': 150, 'savingAmount': 150},
      });
      expect(rep.isActive, isFalse);
      expect(rep.commissionRate, 1.5);
      expect(rep.monthCommission.repAmount, 300);
    });

    test('a statement reads the warehouse-side shape', () {
      final statement = WarehouseStatement.fromJson({
        'statement': {
          'pharmacy': {'nameAr': 'صيدلية', 'nameEn': 'Pharmacy', 'phone': '0931000000'},
          'opening': {'syp': 0},
          'closing': {'syp': -2500},
          'summary': {'chargesSyp': 10000, 'paymentsSyp': 12500},
          'rows': [
            {'id': 'e1', 'kind': 'charge', 'effectiveAt': '2026-10-01T10:00:00.000Z', 'debitSyp': 10000, 'balanceSyp': 10000},
          ],
        },
      });
      expect(statement.creditBalanceSyp, 2500);
      expect(statement.outstandingDebtSyp, 0);
      expect(statement.rows.single.kind, 'charge');
      expect(statement.pharmacyPhone, '0931000000');
    });

    test('a return reads its order, pharmacy and units', () {
      final item = WarehouseReturn.fromJson({
        'return': {
          'id': 'x1',
          'status': 'approved',
          'orderNumber': 12,
          'pharmacyNameAr': 'صيدلية',
          'creditSyp': 4000,
          'images': ['https://example.com/a.jpg'],
          'items': [
            {'quantity': 2, 'reasonType': 'damaged'},
            {'quantity': 1, 'reasonType': 'other', 'customReason': 'expired'},
          ],
        },
      });
      expect(item.orderNumber, 12);
      expect(item.unitCount, 3);
      expect(item.creditSyp, 4000);
      expect(item.images, hasLength(1));
    });
  });

  group('WarehouseRepsCubit', () {
    test('an edit keeps the row\'s numbers and takes the new rate', () async {
      when(() => repo.getReps()).thenAnswer((_) async => [_rep]);
      when(() => repo.updateRep('r1', commissionRate: 3)).thenAnswer(
        (_) async => const WarehouseRep(id: 'r1', name: 'أحمد', phone: '0940000201', commissionRate: 3),
      );
      final cubit = WarehouseRepsCubit(repository: repo);
      await cubit.load();
      expect(await cubit.updateRep('r1', commissionRate: 3), isTrue);
      expect(cubit.state.reps.single.commissionRate, 3);
      expect(cubit.state.reps.single.pharmacyCount, 3);
    });

    test('a new rep reloads the list; a refused one says why', () async {
      when(() => repo.getReps()).thenAnswer((_) async => [_rep]);
      when(
        () => repo.createRep(name: 'Sami', phone: '0940000202', password: 'secret123', commissionRate: 2),
      ).thenAnswer((_) async => _rep);
      final cubit = WarehouseRepsCubit(repository: repo);
      expect(
        await cubit.createRep(name: 'Sami', phone: '0940000202', password: 'secret123', commissionRate: 2),
        isTrue,
      );
      verify(() => repo.getReps()).called(1);

      when(
        () => repo.createRep(name: 'Sami', phone: '0940000202', password: 'secret123', commissionRate: 2),
      ).thenThrow(ServerFailure('taken', code: 'PHONE_ALREADY_REGISTERED'));
      expect(
        await cubit.createRep(name: 'Sami', phone: '0940000202', password: 'secret123', commissionRate: 2),
        isFalse,
      );
      expect(cubit.state.actionErrorCode, 'PHONE_ALREADY_REGISTERED');
      expect(cubit.state.isSaving, isFalse);
    });
  });

  group('WarehouseRepDetailCubit', () {
    test('loads the pharmacies and the first page of visits, then the next', () async {
      when(() => repo.getRepPharmacies('r1')).thenAnswer(
        (_) async => const [RepAssignedPharmacy(id: 'p1', nameAr: 'ص', nameEn: 'P')],
      );
      when(() => repo.getRepVisits(repId: 'r1')).thenAnswer(
        (_) async => const WarehouseRepVisitsPage(
          visits: [WarehouseRepVisit(id: 'v1', status: 'verified')],
          hasMore: true,
          nextCursor: 'v1',
        ),
      );
      when(() => repo.getRepVisits(repId: 'r1', after: 'v1')).thenAnswer(
        (_) async => const WarehouseRepVisitsPage(visits: [WarehouseRepVisit(id: 'v2', status: 'out_of_range')]),
      );
      final cubit = WarehouseRepDetailCubit(repository: repo, repId: 'r1');
      await cubit.load();
      expect(cubit.state.pharmacies, hasLength(1));
      await cubit.loadMoreVisits();
      expect(cubit.state.visits.map((v) => v.id), ['v1', 'v2']);
      expect(cubit.state.hasMoreVisits, isFalse);
    });
  });

  group('WarehouseStatementCubit', () {
    test('a retried payment reuses its key, so it is never recorded twice', () async {
      when(() => repo.getStatement('p1')).thenAnswer((_) async => _statement);
      final keys = <String>[];
      var calls = 0;
      when(
        () => repo.recordPayment(
          pharmacyId: 'p1',
          amountSyp: 5000,
          method: 'cash',
          idempotencyKey: any(named: 'idempotencyKey'),
          note: any(named: 'note'),
        ),
      ).thenAnswer((invocation) async {
        keys.add(invocation.namedArguments[#idempotencyKey] as String);
        if (++calls == 1) throw ServerFailure('timeout', code: 'TIMEOUT');
      });
      final cubit = WarehouseStatementCubit(repository: repo, pharmacyId: 'p1');
      await cubit.load();

      expect(await cubit.recordPayment(amountSyp: 5000, method: 'cash'), isFalse);
      expect(cubit.state.actionErrorCode, 'TIMEOUT');
      expect(await cubit.recordPayment(amountSyp: 5000, method: 'cash'), isTrue);
      expect(keys, hasLength(2));
      expect(keys.first, keys.last);

      // The next payment is a new one.
      await cubit.recordPayment(amountSyp: 5000, method: 'cash');
      expect(keys.last, isNot(keys.first));
    });

    test('a zero amount never reaches the server', () async {
      final cubit = WarehouseStatementCubit(repository: repo, pharmacyId: 'p1');
      expect(await cubit.recordPayment(amountSyp: 0, method: 'cash'), isFalse);
      verifyZeroInteractions(repo);
    });
  });

  group('WarehouseAccountsCubit', () {
    test('a search reloads with the text', () async {
      when(() => repo.getAccounts(search: any(named: 'search'))).thenAnswer(
        (_) async => const WarehouseAccountsPage(accounts: []),
      );
      final cubit = WarehouseAccountsCubit(repository: repo);
      await cubit.setSearch('  yasmin ');
      expect(cubit.state.search, 'yasmin');
      verify(() => repo.getAccounts(search: 'yasmin')).called(1);
    });
  });

  group('returns', () {
    test('the list opens on pending and takes a resolved return in place', () async {
      when(() => repo.getReturns(status: 'pending')).thenAnswer(
        (_) async => WarehouseReturnsPage(returns: [_return('x1'), _return('x2')]),
      );
      final cubit = WarehouseReturnsCubit(repository: repo);
      await cubit.load();
      cubit.applyReturn(_return('x1', status: 'approved'));
      expect(cubit.state.returns.map((r) => r.status), ['approved', 'pending']);
    });

    test('a pending return loads its credit preview; approving keeps the details', () async {
      when(() => repo.getReturn('x1')).thenAnswer((_) async => _return('x1'));
      when(() => repo.previewReturnCredit('x1')).thenAnswer((_) async => 4000);
      when(() => repo.approveReturn('x1')).thenAnswer(
        (_) async => const WarehouseReturn(id: 'x1', status: 'approved', items: [], creditSyp: 4000),
      );
      final cubit = WarehouseReturnDetailCubit(repository: repo, returnId: 'x1');
      await cubit.load();
      expect(cubit.state.creditPreviewSyp, 4000);
      expect(await cubit.approve(), isTrue);
      expect(cubit.state.returnRequest?.status, 'approved');
      expect(cubit.state.returnRequest?.creditSyp, 4000);
      expect(cubit.state.returnRequest?.items, hasLength(1));
    });

    test('rejecting needs a note', () async {
      when(() => repo.getReturn('x1')).thenAnswer((_) async => _return('x1'));
      when(() => repo.previewReturnCredit('x1')).thenAnswer((_) async => null);
      final cubit = WarehouseReturnDetailCubit(repository: repo, returnId: 'x1');
      await cubit.load();
      expect(await cubit.reject('   '), isFalse);
      verifyNever(() => repo.rejectReturn(any(), any()));
    });
  });
}
