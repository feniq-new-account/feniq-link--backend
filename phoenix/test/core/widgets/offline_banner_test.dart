import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/core/offline/offline_status.dart';
import 'package:feniq/core/widgets/offline_banner.dart';
import 'package:feniq/generated/app_localizations.dart';

class _Counter extends StatefulWidget {
  const _Counter();

  static int created = 0;

  @override
  State<_Counter> createState() => _CounterState();
}

class _CounterState extends State<_Counter> {
  @override
  void initState() {
    super.initState();
    _Counter.created += 1;
  }

  @override
  Widget build(BuildContext context) => const Scaffold(body: Text('screen'));
}

Widget _app() => MaterialApp(
  locale: const Locale('ar'),
  localizationsDelegates: const [
    AppLocalizations.delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
  ],
  supportedLocales: AppLocalizations.supportedLocales,
  builder: (context, child) => OfflineBannerFrame(child: child ?? const SizedBox.shrink()),
  home: const _Counter(),
);

void main() {
  setUp(() {
    OfflineStatus.instance.live();
    _Counter.created = 0;
  });

  tearDown(OfflineStatus.instance.live);

  testWidgets('shows nothing while everything is live', (tester) async {
    await tester.pumpWidget(_app());
    expect(find.byType(OfflineStrip), findsNothing);
    expect(find.text('screen'), findsOneWidget);
  });

  testWidgets('shows the strip with the time of the saved copy, and removes it again', (tester) async {
    await tester.pumpWidget(_app());
    OfflineStatus.instance.servedFromSavedCopy(DateTime(2026, 10, 4, 9, 5));
    await tester.pump();
    expect(find.byType(OfflineStrip), findsOneWidget);
    expect(find.textContaining('4/10 09:05'), findsOneWidget);

    OfflineStatus.instance.live();
    await tester.pump();
    expect(find.byType(OfflineStrip), findsNothing);
  });

  testWidgets('the screen below is not rebuilt from scratch when the strip comes and goes', (tester) async {
    await tester.pumpWidget(_app());
    expect(_Counter.created, 1);
    OfflineStatus.instance.servedFromSavedCopy(DateTime(2026, 10, 4, 9, 5));
    await tester.pump();
    OfflineStatus.instance.live();
    await tester.pump();
    expect(_Counter.created, 1, reason: 'the screen kept its state');
  });
}
