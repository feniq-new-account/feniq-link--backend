import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_management_models.dart';
import 'package:feniq/features/warehouse/presentation/widgets/voice_payment_sheet.dart';
import 'package:feniq/generated/app_localizations.dart';

// Paying by voice: what is heard becomes a card (pharmacy, sum, what is left),
// and nothing is saved until the warehouse confirms it.
class FakeListener implements SpeechListener {
  FakeListener({this.available = true, this.heard = ''});

  final bool available;
  final String heard;
  var stopped = false;

  @override
  Future<bool> start({required void Function(String text) onText, required void Function() onEnd}) async {
    if (!available) return false;
    onText(heard);
    return true;
  }

  @override
  Future<void> stop() async => stopped = true;
}

const _noor = WarehouseAccountRow(pharmacyId: 'p1', nameAr: 'صيدلية النور', nameEn: 'Al-Noor', balanceSyp: 200000);
const _amal = WarehouseAccountRow(pharmacyId: 'p2', nameAr: 'صيدلية الأمل', nameEn: 'Al-Amal', balanceSyp: 90000);

void main() {
  late List<(String, double)> recorded;
  late bool recordResult;

  setUp(() {
    recorded = [];
    recordResult = true;
  });

  Future<void> open(WidgetTester tester, FakeListener listener) async {
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('en'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: VoicePaymentSheet(
            accounts: const [_noor, _amal],
            listener: listener,
            onRecord: (id, amount) async {
              recorded.add((id, amount));
              return recordResult;
            },
          ),
        ),
      ),
    );
  }

  testWidgets('speaking a payment shows the card, then confirming records it', (tester) async {
    await open(tester, FakeListener(heard: 'صيدلية النور دفعت خمسين ألف'));
    await tester.tap(find.text('Tap and speak'));
    await tester.pump();
    expect(find.text('Al-Noor'), findsOneWidget);
    expect(find.textContaining('A payment of 50,000'), findsOneWidget);
    expect(find.textContaining('still owe 150,000'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'OK, record it'));
    await tester.pump();
    expect(recorded, [('p1', 50000.0)]);
  });

  testWidgets('"paid the full amount" records what the pharmacy owes', (tester) async {
    await open(tester, FakeListener());
    await tester.enterText(find.byType(TextField), 'الأمل دفعوا المبلغ كامل');
    await tester.pump();
    expect(find.textContaining('A payment of 90,000'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'OK, record it'));
    await tester.pump();
    expect(recorded, [('p2', 90000.0)]);
  });

  testWidgets('a misheard name still finds the pharmacy', (tester) async {
    await open(tester, FakeListener());
    await tester.enterText(find.byType(TextField), 'النوور دفعت ٤٠٠٠٠');
    await tester.pump();
    expect(find.textContaining('A payment of 40,000'), findsOneWidget);
    expect(find.text('Al-Noor'), findsOneWidget);
  });

  testWidgets('nothing is recorded until confirmed, and an unclear sentence cannot be', (tester) async {
    await open(tester, FakeListener());
    await tester.enterText(find.byType(TextField), 'مرحبا كيف الحال');
    await tester.pump();
    expect(find.textContaining('I did not understand'), findsOneWidget);
    final confirm = tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'OK, record it'));
    expect(confirm.onPressed, isNull);
    expect(recorded, isEmpty);
  });

  testWidgets('an amount above what is owed cannot be confirmed', (tester) async {
    await open(tester, FakeListener());
    await tester.enterText(find.byType(TextField), 'صيدلية الأمل دفعت مليون');
    await tester.pump();
    expect(find.textContaining('does not fit this pharmacy'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'OK, record it')).onPressed, isNull);
  });

  testWidgets('no recognizer on the phone: says so, and the box still works', (tester) async {
    await open(tester, FakeListener(available: false));
    await tester.tap(find.text('Tap and speak'));
    await tester.pump();
    expect(find.textContaining("Voice isn't available"), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'النور دفعت عشرة آلاف');
    await tester.pump();
    expect(find.textContaining('A payment of 10,000'), findsOneWidget);
  });
}
