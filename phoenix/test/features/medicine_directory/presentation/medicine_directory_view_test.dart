import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/features/medicine_directory/data/medicine_directory.dart';
import 'package:feniq/features/medicine_directory/data/repositories/medicine_directory_repository.dart';
import 'package:feniq/features/medicine_directory/presentation/managers/directory_cubit.dart';
import 'package:feniq/features/medicine_directory/presentation/managers/directory_state.dart';
import 'package:feniq/features/medicine_directory/presentation/views/medicine_directory_view.dart';
import 'package:feniq/features/medicine_directory/presentation/widgets/directory_item_tile.dart';
import 'package:feniq/generated/app_localizations.dart';

class _Repository implements MedicineDirectoryRepository {
  _Repository([this.saved]);

  MedicineDirectory? saved;
  Failure? failure;
  List<Map<String, dynamic>>? downloadRows;
  int syncs = 0;

  @override
  MedicineDirectory? get current => saved;

  @override
  Future<MedicineDirectory?> load() async => saved;

  @override
  Future<DirectorySyncOutcome> sync({bool force = false, void Function(int loaded, int total)? onProgress}) async {
    syncs++;
    final error = failure;
    if (error != null) throw error;
    final rows = downloadRows;
    if (rows != null) {
      onProgress?.call(rows.length, rows.length);
      saved = MedicineDirectory(rows: mergeDirectoryRows((const [], rows)), savedAt: DateTime(2026, 10, 4, 9, 30));
      return DirectorySyncOutcome.downloaded;
    }
    return DirectorySyncOutcome.upToDate;
  }
}

Map<String, dynamic> _row(String id, String nameAr, String manufacturer, {String? ingredient, String? strength, String? form}) => {
  'id': id,
  'nameAr': nameAr,
  'manufacturerAr': manufacturer,
  if (ingredient != null) 'activeIngredient': ingredient,
  if (strength != null) 'strength': strength,
  if (form != null) 'dosageForm': form,
};

MedicineDirectory _saved() => MedicineDirectory(
  rows: mergeDirectoryRows((
    const [],
    [
      _row('1', 'بنادول 500', 'غلاكسو', ingredient: 'PARACETAMOL', strength: '500 MG/TAB.', form: 'أقراص'),
      _row('2', 'سيتامول 500', 'ألفا', ingredient: 'PARACETAMOL', strength: '500 MG/TAB.', form: 'أقراص ملبسة'),
      _row('3', 'أموكسيل', 'بيتا', ingredient: 'AMOXICILLIN', strength: '250 MG/CAP.', form: 'محافظ'),
    ],
  )),
  savedAt: DateTime(2026, 10, 4, 9, 30),
);

void main() {
  Future<DirectoryCubit> pump(WidgetTester tester, _Repository repository) async {
    final cubit = DirectoryCubit(repository: repository, searchDelay: Duration.zero);
    addTearDown(cubit.close);
    await cubit.load();
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('ar'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: BlocProvider.value(value: cubit, child: const MedicineDirectoryView()),
      ),
    );
    await tester.pump();
    return cubit;
  }

  testWidgets('lists every medicine and says how many', (tester) async {
    await pump(tester, _Repository(_saved()));

    expect(find.text('بنادول 500'), findsOneWidget);
    expect(find.text('أموكسيل'), findsOneWidget);
    expect(find.text('3 من 3'), findsOneWidget);
  });

  testWidgets('typing narrows the list by name, company or ingredient - no connection needed', (tester) async {
    await pump(tester, _Repository(_saved()));

    await tester.enterText(find.byType(TextField), 'paracetamol');
    await tester.pump();
    expect(find.text('2 من 3'), findsOneWidget);
    expect(find.text('أموكسيل'), findsNothing);

    await tester.enterText(find.byType(TextField), 'بيتا');
    await tester.pump();
    expect(find.text('1 من 3'), findsOneWidget);
    expect(find.text('أموكسيل'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'لا شيء بهالاسم');
    await tester.pump();
    expect(find.text('ما في دواء مطابق للبحث.'), findsOneWidget);
  });

  testWidgets('tapping a medicine opens its details and the same-ingredient alternatives', (tester) async {
    await pump(tester, _Repository(_saved()));

    await tester.tap(find.text('بنادول 500'));
    await tester.pumpAndSettle();

    expect(find.text('نفس المادة الفعالة'), findsOneWidget);
    // The coated tablet counts as the same form as the plain one.
    expect(find.text('سيتامول 500'), findsWidgets);
    expect(find.text('ما في دواء ثاني بنفس المادة والعيار والشكل.'), findsNothing);
  });

  testWidgets('a medicine nobody substitutes says so', (tester) async {
    await pump(tester, _Repository(_saved()));

    await tester.tap(find.text('أموكسيل'));
    await tester.pumpAndSettle();

    expect(find.text('ما في دواء ثاني بنفس المادة والعيار والشكل.'), findsOneWidget);
  });

  testWidgets('nothing saved yet: offers the download, and shows the list once it is done', (tester) async {
    final repository = _Repository()..downloadRows = [_row('1', 'بنادول 500', 'غلاكسو')];
    await pump(tester, repository);

    expect(find.text('الدليل مو محمّل على هاتفك لسا'), findsOneWidget);
    await tester.tap(find.text('حمّل هلأ'));
    await tester.pump();
    await tester.pump();

    expect(find.text('بنادول 500'), findsOneWidget);
    expect(find.text('1 من 1'), findsOneWidget);
  });

  testWidgets('a download with no connection says so and can be tried again', (tester) async {
    final repository = _Repository()..failure = ServerFailure('offline', code: FailureCode.network);
    await pump(tester, repository);

    await tester.tap(find.text('حمّل هلأ'));
    await tester.pump();
    await tester.pump();

    expect(find.text('حمّل هلأ'), findsOneWidget, reason: 'still on the empty page, with the button to try again');
    expect(find.text('الدليل مو محمّل على هاتفك لسا'), findsOneWidget);
  });

  testWidgets('an update with no connection keeps the saved list and tells the pharmacist', (tester) async {
    final repository = _Repository(_saved());
    final cubit = await pump(tester, repository);
    repository.failure = ServerFailure('offline', code: FailureCode.network);

    await tester.tap(find.byIcon(Icons.refresh));
    await tester.pump();
    await tester.pump();

    expect(cubit.state.status, DirectoryStatus.ready);
    expect(find.text('بنادول 500'), findsOneWidget);
    expect(find.text('ما قدرنا نحدّث هلأ - عم نعرض النسخة المحفوظة على هاتفك.'), findsOneWidget);
  });

  testWidgets('thousands of medicines still scroll: only the visible rows are built', (tester) async {
    final rows = [for (var i = 0; i < 13000; i++) _row('$i', 'دواء رقم $i', 'شركة ${i % 50}', ingredient: 'ING${i % 300}')];
    final clock = Stopwatch()..start();
    final directory = MedicineDirectory(rows: mergeDirectoryRows((const [], rows)), savedAt: DateTime(2026, 10, 4));
    final indexing = clock.elapsedMilliseconds;
    clock.reset();
    directory.search('ING7 دواء');
    directory.search('دواء رقم 12');
    final searching = clock.elapsedMilliseconds ~/ 2;
    // ignore: avoid_print
    print('PERF index 13000 rows: ${indexing}ms, one search: ${searching}ms');
    expect(searching, lessThan(150), reason: 'a search over the whole list must feel instant');
    await pump(tester, _Repository(directory));

    expect(find.text('13,000 من 13,000'), findsOneWidget);
    expect(tester.widgetList(find.byType(DirectoryItemTile)).length, inInclusiveRange(1, 40));
    await tester.enterText(find.byType(TextField), 'ING7 دواء');
    await tester.pump();
    expect(tester.takeException(), isNull);
  });
}
