import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:feniq/core/services/storage_service.dart';
import 'package:feniq/features/launch/persistent_pilot_notice.dart';
import 'package:feniq/generated/app_localizations.dart';

void main() {
  const arabic = 'نسخة تجريبية من فينيق';
  const english = 'Feniq trial version';

  Future<StorageService> storage([Map<String, Object> seed = const {}]) async {
    SharedPreferences.setMockInitialValues(seed);
    return StorageService(await SharedPreferences.getInstance());
  }

  Widget shell({
    required StorageService store,
    required Future<PilotNotice> Function() load,
    Locale locale = const Locale('ar'),
  }) => MaterialApp(
    locale: locale,
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    home: Scaffold(
      body: PersistentPilotNoticeFrame(
        storageService: store,
        refreshInterval: const Duration(minutes: 2),
        load: load,
        child: const Center(child: Text('REAL APP CONTENT')),
      ),
    ),
  );

  testWidgets('trial notice clears the phone status bar and does not double-pad screens',
    (tester) async {
      final store = await storage();
      var enabled = true;
      await tester.pumpWidget(MaterialApp(
        locale: const Locale('ar'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: MediaQuery(
          data: const MediaQueryData(
            padding: EdgeInsets.only(top: 32),
            viewPadding: EdgeInsets.only(top: 32),
          ),
          child: Scaffold(
            body: PersistentPilotNoticeFrame(
              storageService: store,
              load: () async => PilotNotice(enabled: enabled, textAr: arabic, textEn: english),
              child: Builder(
                builder: (context) => Text(
                  'app-inset:${MediaQuery.paddingOf(context).top.toInt()}',
                ),
              ),
            ),
          ),
        ),
      ));
      await tester.pumpAndSettle();

      // The Android status glyphs occupy the first 32 logical pixels.
      // The banner label must begin entirely below them.
      expect(find.byKey(const ValueKey('persistentPilotNotice')), findsOneWidget);
      expect(tester.getTopLeft(find.text(arabic)).dy, greaterThanOrEqualTo(32));
      expect(find.text('app-inset:0'), findsOneWidget,
          reason: 'inner navigator must not reserve the same status inset twice');

      // An admin OFF response restores the original screen inset.
      enabled = false;
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('persistentPilotNotice')), findsNothing);
      expect(find.text('app-inset:32'), findsOneWidget);
    },
  );

  test('malformed notice cannot enable an unsourced strip', () {
    expect(() => PilotNotice.fromJson({'enabled': true, 'textAr': arabic}),
      throwsFormatException);
    expect(() => PilotNotice.fromJson({
      'enabled': 'true', 'textAr': arabic, 'textEn': english,
    }), throwsFormatException);
    expect(() => PilotNotice.fromJson({
      'enabled': true, 'textAr': '', 'textEn': english,
    }), throwsFormatException);
  });

  testWidgets('enabled notice stays visible, is compact and does not replace navigation content',
    (tester) async {
      final store = await storage();
      await tester.pumpWidget(shell(
        store: store,
        load: () async => const PilotNotice(enabled: true, textAr: arabic, textEn: english),
      ));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('persistentPilotNotice')), findsOneWidget);
      expect(find.text(arabic), findsOneWidget);
      expect(find.text('REAL APP CONTENT'), findsOneWidget);
      // It is not a transient snackbar or dismissible modal.
      await tester.pump(const Duration(minutes: 4));
      await tester.pump();
      expect(find.text(arabic), findsOneWidget);
      expect(find.byType(AlertDialog), findsNothing);
      expect(find.byIcon(Icons.close), findsNothing);
    },
  );

  testWidgets('an admin OFF response hides the banner on refresh and persists OFF',
    (tester) async {
      final store = await storage();
      var enabled = true;
      await tester.pumpWidget(shell(
        store: store,
        load: () async => PilotNotice(enabled: enabled, textAr: arabic, textEn: english),
      ));
      await tester.pumpAndSettle();
      expect(find.text(arabic), findsOneWidget);

      enabled = false;
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('persistentPilotNotice')), findsNothing);
      expect(find.text('REAL APP CONTENT'), findsOneWidget);
      expect(jsonDecode(store.getString('launch.persistent_pilot_notice')!)['enabled'], isFalse);
    },
  );

  testWidgets('last verified admin notice survives offline startup',
    (tester) async {
      final store = await storage({
        'launch.persistent_pilot_notice': jsonEncode(
          const PilotNotice(enabled: true, textAr: arabic, textEn: english).toJson()),
      });
      await tester.pumpWidget(shell(
        store: store,
        load: () async => throw Exception('offline'),
        locale: const Locale('en'),
      ));
      await tester.pumpAndSettle();
      expect(find.text(english), findsOneWidget);
      expect(find.text('REAL APP CONTENT'), findsOneWidget);
    },
  );

  testWidgets('no server response and no saved setting never invents an ON state',
    (tester) async {
      final store = await storage();
      await tester.pumpWidget(shell(
        store: store,
        load: () async => throw Exception('unavailable'),
      ));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('persistentPilotNotice')), findsNothing);
    },
  );
}
