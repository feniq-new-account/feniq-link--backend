import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/features/advertisements/data/models/advertisement_model.dart';
import 'package:feniq/features/advertisements/presentation/widgets/package_contents.dart';
import 'package:feniq/generated/app_localizations.dart';

// A package shows exactly what it holds: each medicine's English name,
// company, strength (left to right) and form, and its quantity - and says it
// is fixed (taken whole, in copies).
void main() {
  final item = AdvertisementItemModel.fromJson({
    'productId': 'p1',
    'nameAr': 'بريغابالين',
    'nameEn': 'PREGABALIN BAHRI-75 CAP. (14 CAP)',
    'manufacturerAr': 'بحري',
    'manufacturerEn': 'Bahri',
    'strength': '75 MG',
    'dosageForm': 'محافظ',
    'quantity': 3,
    'isAvailable': true,
  });

  Future<void> pumpSheet(WidgetTester tester, {VoidCallback? onAdd}) async {
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('ar'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: TextButton(
                onPressed: () => showPackageContentsSheet(
                  context,
                  title: 'باقة الشتاء',
                  entries: [PackageContentEntry.fromItem(item)],
                  onAdd: onAdd,
                ),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
  }

  testWidgets('every medicine in full, with its quantity', (tester) async {
    await pumpSheet(tester);
    expect(find.text('محتوى الباقة'), findsOneWidget);
    expect(find.text('PREGABALIN BAHRI-75 CAP. (14 CAP)'), findsOneWidget);
    expect(find.text('Bahri'), findsOneWidget);
    expect(find.text('⁦75 MG⁩  •  محافظ'), findsOneWidget);
    expect(find.text('× 3'), findsOneWidget);
    expect(find.textContaining('الباقة ثابتة'), findsOneWidget);
    // Read-only without an add action (a package already in the cart).
    expect(find.text('إضافة الباقة إلى السلة'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('the add action closes the sheet and adds the package', (tester) async {
    var added = 0;
    await pumpSheet(tester, onAdd: () => added++);
    await tester.tap(find.text('إضافة الباقة إلى السلة'));
    await tester.pumpAndSettle();
    expect(added, 1);
    expect(find.text('محتوى الباقة'), findsNothing);
  });
}
