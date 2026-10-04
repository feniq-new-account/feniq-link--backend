import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:feniq/core/constants/storage_keys.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/core/offline/offline_syncable.dart';
import 'package:feniq/core/services/storage_service.dart';
import 'package:feniq/features/catalog/data/repositories/catalog_repository.dart';
import 'package:feniq/features/data_preparation/presentation/managers/data_preparation_cubit.dart';
import 'package:feniq/features/data_preparation/presentation/widgets/data_preparation_gate.dart';
import 'package:feniq/features/medicine_directory/data/medicine_directory.dart';
import 'package:feniq/features/medicine_directory/data/repositories/medicine_directory_repository.dart';
import 'package:feniq/features/warehouse_selection/data/models/warehouse_list_result.dart';
import 'package:feniq/features/warehouse_selection/data/repositories/warehouse_repository.dart';
import 'package:feniq/generated/app_localizations.dart';

class _Directory implements MedicineDirectoryRepository {
  final release = Completer<void>();
  Failure? failure;
  MedicineDirectory? saved;
  void Function(int, int)? progress;

  @override
  MedicineDirectory? get current => saved;

  @override
  Future<MedicineDirectory?> load() async => saved;

  @override
  Future<DirectorySyncOutcome> sync({bool force = false, void Function(int loaded, int total)? onProgress}) async {
    progress = onProgress;
    onProgress?.call(2600, 13044);
    if (failure == null) await release.future;
    final error = failure;
    if (error != null) throw error;
    saved = MedicineDirectory(rows: [indexDirectoryRow({'id': '1', 'nameAr': 'أ', 'manufacturerAr': 'ب'})], savedAt: DateTime.now());
    return DirectorySyncOutcome.downloaded;
  }
}

class _MockWarehouses extends Mock implements WarehouseRepository {}

class _MockCatalog extends Mock implements CatalogRepository, OfflineSyncable {}

void main() {
  late _Directory directory;
  late DataPreparationCubit cubit;

  Future<void> pump(WidgetTester tester, {bool prepared = false, Locale locale = const Locale('ar')}) async {
    SharedPreferences.setMockInitialValues({
      if (prepared) StorageKeys.dataPreparedAt: DateTime(2026, 10, 3).toIso8601String(),
    });
    final warehouses = _MockWarehouses();
    when(() => warehouses.getWarehouses(onlyMyCity: any(named: 'onlyMyCity'))).thenAnswer(
      (_) async => const WarehouseListResult(warehouses: [], cityFilterApplied: false),
    );
    final catalog = _MockCatalog();
    cubit = DataPreparationCubit(
      directoryRepository: directory,
      warehouseRepository: warehouses,
      catalogRepository: catalog,
      storageService: StorageService(await SharedPreferences.getInstance()),
      doneLinger: const Duration(seconds: 1),
    );
    await tester.pumpWidget(
      MaterialApp(
        locale: locale,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: BlocProvider.value(
          value: cubit,
          child: const DataPreparationGate(child: Scaffold(body: Center(child: Text('THE APP')))),
        ),
      ),
    );
  }

  setUp(() => directory = _Directory());
  tearDown(() => cubit.close());

  testWidgets('first run: the "take a couple of minutes" page covers the app with a real progress count, then lets it through', (tester) async {
    await pump(tester);
    await tester.pump();
    await tester.pump();

    expect(find.textContaining('طوّل بالك دقيقتين'), findsOneWidget);
    expect(find.text('دليل الأدوية: 2,600 من 13,044'), findsOneWidget);
    expect(find.byKey(const ValueKey('preparationProgress')), findsOneWidget);

    directory.release.complete();
    // The preferences write is real asynchronous work, which the test clock
    // does not drive: let it happen, then draw the frame it produced.
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
    await tester.pump();
    expect(find.text('تمام! كل شي صار محفوظ على هاتفك.'), findsOneWidget);

    await tester.pump(const Duration(seconds: 2));
    await tester.pump();
    expect(find.textContaining('طوّل بالك'), findsNothing);
    expect(find.text('THE APP'), findsOneWidget);
  });

  testWidgets('a phone that has done it before never sees the page', (tester) async {
    directory.release.complete();
    await pump(tester, prepared: true);
    await tester.pump();
    await tester.pump();

    expect(find.textContaining('طوّل بالك'), findsNothing);
    expect(find.text('THE APP'), findsOneWidget);
    expect(directory.progress, isNotNull, reason: 'it still refreshes in the background');
  });

  testWidgets('no connection on the first run: says so, offers to try again or carry on', (tester) async {
    directory.failure = ServerFailure('offline', code: FailureCode.network);
    await pump(tester);
    await tester.pump();
    await tester.pump();

    expect(find.text('ما قدرنا نكمّل التحميل'), findsOneWidget);
    expect(find.textContaining('ما في إنترنت'), findsOneWidget);
    expect(find.text('جرّب مرة ثانية'), findsOneWidget);

    await tester.tap(find.text('كمّل بدون'));
    await tester.pump();
    await tester.pump();
    expect(find.text('ما قدرنا نكمّل التحميل'), findsNothing);
    expect(find.text('THE APP'), findsOneWidget);
  });

  testWidgets('the page fits a small phone in English too', (tester) async {
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await pump(tester, locale: const Locale('en'));
    await tester.pump();
    await tester.pump();

    expect(find.textContaining('Please bear with us'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
