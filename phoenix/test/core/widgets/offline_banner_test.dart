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
    expect(find.byType(OfflineToast), findsNothing);
    expect(find.text('screen'), findsOneWidget);
  });

  testWidgets('flashes the notice with the time of the saved copy, then hides it by itself', (tester) async {
    await tester.pumpWidget(_app());
    OfflineStatus.instance.servedFromSavedCopy(DateTime(2026, 10, 4, 9, 5));
    await tester.pump();
    expect(find.byType(OfflineToast), findsOneWidget);
    expect(find.textContaining('4/10 09:05'), findsOneWidget);

    await tester.pump(OfflineBannerFrame.visibleFor + const Duration(milliseconds: 100));
    expect(find.byType(OfflineToast), findsNothing, reason: 'it does not stay pinned while still offline');
  });

  testWidgets('shows once per offline spell, and again after coming back online', (tester) async {
    await tester.pumpWidget(_app());
    OfflineStatus.instance.servedFromSavedCopy(DateTime(2026, 10, 4, 9, 5));
    await tester.pump(OfflineBannerFrame.visibleFor + const Duration(milliseconds: 100));

    // Another fallback while still offline: no second notice.
    OfflineStatus.instance.servedFromSavedCopy(DateTime(2026, 10, 4, 9, 6));
    await tester.pump();
    expect(find.byType(OfflineToast), findsNothing);

    // Back online hides it at once; the next offline spell shows it again.
    OfflineStatus.instance.live();
    await tester.pump();
    OfflineStatus.instance.servedFromSavedCopy(DateTime(2026, 10, 4, 9, 7));
    await tester.pump();
    expect(find.byType(OfflineToast), findsOneWidget);
    OfflineStatus.instance.live();
    await tester.pump();
    expect(find.byType(OfflineToast), findsNothing);
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
