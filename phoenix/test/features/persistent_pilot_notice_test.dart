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

  testWidgets('Android 15 status icons never overlap the permanent notice and AppBar does not double-pad',
      (tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    tester.view.padding = const FakeViewPadding(top: 32, bottom: 24);
    tester.view.viewPadding = const FakeViewPadding(top: 32, bottom: 24);
    addTearDown(tester.view.reset);

    final store = await storage();
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('ar'),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      builder: (context, child) => PersistentPilotNoticeFrame(
        storageService: store,
        load: () async => const PilotNotice(
          enabled: true, textAr: arabic, textEn: english),
        child: child!,
      ),
      home: Scaffold(
        appBar: AppBar(title: const Text('اختر المستودع')),
        body: const Center(child: Text('REAL APP CONTENT')),
      ),
    ));
    await tester.pumpAndSettle();

    final notice = find.byKey(const ValueKey('persistentPilotNotice'));
    expect(notice, findsOneWidget);
    expect(tester.getTopLeft(notice).dy, greaterThanOrEqualTo(32),
      reason: 'Android status bar takes the first 32 logical pixels');
    final noticeBottom = tester.getBottomLeft(notice).dy;
    expect(tester.getTopLeft(find.byType(AppBar)).dy, closeTo(noticeBottom, 1),
      reason: 'the AppBar must follow the notice without a second system inset');
    expect(find.text(arabic), findsOneWidget);
    expect(find.text('REAL APP CONTENT'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('long Arabic admin notice stays inside the screen at large text settings',
      (tester) async {
    tester.view.physicalSize = const Size(320, 720);
    tester.view.devicePixelRatio = 1;
    tester.view.padding = const FakeViewPadding(top: 28);
    tester.view.viewPadding = const FakeViewPadding(top: 28);
    tester.platformDispatcher.textScaleFactorTestValue = 1.7;
    addTearDown(() {
      tester.view.reset();
      tester.platformDispatcher.clearTextScaleFactorTestValue();
    });
    final store = await storage();
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('ar'),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      builder: (context, child) => PersistentPilotNoticeFrame(
        storageService: store,
        load: () async => const PilotNotice(
          enabled: true,
          textAr: 'نسخة تجريبية من فينيق — التطبيق قيد الاختبار والتطوير، وقد تتغير بعض الخدمات.',
          textEn: english),
        child: child!,
      ),
      home: const Scaffold(body: Center(child: Text('CATALOG'))),
    ));
    await tester.pumpAndSettle();
    final bar = find.byKey(const ValueKey('persistentPilotNotice'));
    expect(tester.getTopLeft(bar).dy, greaterThanOrEqualTo(28));
    expect(tester.getBottomLeft(bar).dy, lessThan(135),
      reason: 'a long admin message cannot consume the whole home screen');
    expect(find.text('CATALOG'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

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
