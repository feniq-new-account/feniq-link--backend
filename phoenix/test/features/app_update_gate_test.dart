import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:feniq/core/services/app_update_service.dart';
import 'package:feniq/core/services/remote_config_service.dart';
import 'package:feniq/core/services/storage_service.dart';
import 'package:feniq/features/app_update/presentation/app_update_gate.dart';
import 'package:feniq/generated/app_localizations.dart';
import '../helpers/android_release_fixture.dart';

class RemoteConfigMock extends Mock implements RemoteConfigService {}

void main() {
  testWidgets(
    'a mandatory update hides all saved content, blocks back, and a verified rollback restores the app',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      final storage = StorageService(await SharedPreferences.getInstance());
      var now = DateTime.utc(2026, 10, 31);
      var enabled = true;
      var taps = 0;
      final service = AppUpdateService(
        remoteConfigService: RemoteConfigMock(),
        storageService: storage,
        currentVersion: '1.0.0',
        currentBuild: 1049,
        now: () => now,
        fetchRelease: () async => enabled
            ? releasePayload(now, allMandatory: true)
            : {'release': null, 'serverTime': now.toIso8601String()},
      );
      tester.view.physicalSize = const Size(360, 640);
      tester.view.devicePixelRatio = 1;
      tester.platformDispatcher.textScaleFactorTestValue = 1.6;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
        tester.platformDispatcher.clearTextScaleFactorTestValue();
      });
      await tester.pumpWidget(
        MaterialApp(
          locale: const Locale('ar'),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          builder: (context, child) => AppUpdateGate(
            service: service,
            isAppShellReady: () => true,
            child: child!,
          ),
          home: Scaffold(
            body: TextButton(
              onPressed: () => taps++,
              child: const Text('Browse saved catalog'),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Browse saved catalog'), findsNothing);
      expect(find.byType(AlertDialog), findsOneWidget);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsOneWidget);
      expect(taps, 0);
      enabled = false;
      now = now.add(const Duration(minutes: 16));
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsNothing);
      expect(find.text('Browse saved catalog'), findsOneWidget);
      await tester.tap(find.text('Browse saved catalog'));
      expect(taps, 1);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}
