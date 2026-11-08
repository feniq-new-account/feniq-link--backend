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
    bool showHomeSlot = true,
  }) => MaterialApp(
    locale: locale,
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    builder: (context, child) => PersistentPilotNoticeFrame(
      storageService: store,
      refreshInterval: const Duration(minutes: 2),
      load: load,
      child: child!,
    ),
    home: Scaffold(
      appBar: AppBar(title: const Text('اختر المستودع')),
      body: Column(
        children: [
          if (showHomeSlot) const PersistentPilotInlineNotice(),
          const Expanded(child: Center(child: Text('REAL APP CONTENT'))),
        ],
      ),
    ),
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

  testWidgets('notice displays below the Android status bar, below app header, without background',
      (tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    tester.view.padding = const FakeViewPadding(top: 32, bottom: 24);
    tester.view.viewPadding = const FakeViewPadding(top: 32, bottom: 24);
    addTearDown(tester.view.reset);

    final store = await storage();
    await tester.pumpWidget(shell(
      store: store,
      load: () async => const PilotNotice(enabled: true,
        textAr: 'النسخة تجريبية\nيمكنك ارسال الطلبات في 1 كانون الاول\nيتم اضافة المستودعات بشكل مستمر',
        textEn: english),
    ));
    await tester.pumpAndSettle();

    final notice = find.byKey(const ValueKey('persistentPilotNotice'));
    expect(notice, findsOneWidget);
    expect(tester.getTopLeft(notice).dy, greaterThanOrEqualTo(32));
    expect(tester.getTopLeft(notice).dy,
        greaterThanOrEqualTo(tester.getBottomLeft(find.byType(AppBar)).dy),
        reason: 'notice belongs below the header, never behind status icons');
    expect(find.text('النسخة تجريبية'), findsOneWidget);
    expect(find.text('يمكنك ارسال الطلبات في 1 كانون الاول\nيتم اضافة المستودعات بشكل مستمر'), findsOneWidget);
    final decoration = find.descendant(of: notice, matching: find.byType(DecoratedBox));
    expect(decoration, findsNothing, reason: 'no colored card or border');
    expect(find.text('REAL APP CONTENT'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Arabic notice remains readable at enlarged font size on narrow phones',
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
    await tester.pumpWidget(shell(
      store: store,
      load: () async => const PilotNotice(
        enabled: true,
        textAr: 'النسخة تجريبية\nيمكنك ارسال الطلبات في 1 كانون الاول\nيتم اضافة المستودعات بشكل مستمر',
        textEn: english),
    ));
    await tester.pumpAndSettle();
    final notice = find.byKey(const ValueKey('persistentPilotNotice'));
    expect(tester.getTopLeft(notice).dy, greaterThanOrEqualTo(28));
    expect(tester.getBottomLeft(notice).dy, lessThan(300));
    expect(find.text('REAL APP CONTENT'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('administrator ON notice is persistent and remains inside the home content',
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
    await tester.pump(const Duration(minutes: 4));
    await tester.pump();
    expect(find.text(arabic), findsOneWidget);
    expect(find.byType(AlertDialog), findsNothing);
    expect(find.byIcon(Icons.close), findsNothing);
  });

  testWidgets('administrator OFF hides the message and persists the choice',
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
    expect(jsonDecode(store.getString('launch.persistent_pilot_notice')!)['enabled'], false);
  });

  testWidgets('last verified admin notice survives offline startup in English',
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
  });

  testWidgets('no network response or saved setting never invents an ON notice',
      (tester) async {
    final store = await storage();
    await tester.pumpWidget(shell(
      store: store,
      load: () async => throw Exception('unavailable'),
    ));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('persistentPilotNotice')), findsNothing);
  });

  testWidgets('pilot notice does not render outside the pharmacy home inline slot',
      (tester) async {
    final store = await storage();
    await tester.pumpWidget(shell(
      store: store,
      load: () async => const PilotNotice(enabled: true, textAr: arabic, textEn: english),
      showHomeSlot: false,
    ));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('persistentPilotNotice')), findsNothing);
    expect(find.text(arabic), findsNothing);
    expect(find.text('REAL APP CONTENT'), findsOneWidget);
  });
}
