import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:feniq/core/widgets/startup_location_permission.dart';
import 'package:feniq/generated/app_localizations.dart';

class LocationPlatform extends GeolocatorPlatform {
  LocationPermission permission = LocationPermission.denied;
  bool enabled = true;
  int requests = 0;
  int opened = 0;
  @override
  Future<LocationPermission> checkPermission() async => permission;
  @override
  Future<LocationPermission> requestPermission() async { requests++; return permission; }
  @override
  Future<bool> isLocationServiceEnabled() async => enabled;
  @override
  Future<bool> openAppSettings() async { opened++; return true; }
  @override
  Future<bool> openLocationSettings() async { opened++; return true; }
}
void main() {
  late GeolocatorPlatform previous;
  late LocationPlatform platform;
  setUp(() { previous = GeolocatorPlatform.instance; platform = LocationPlatform(); GeolocatorPlatform.instance = platform; });
  tearDown(() => GeolocatorPlatform.instance = previous);
  Future<void> pump(WidgetTester tester) async {
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('en'),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: const Scaffold(body: StartupLocationPermission()),
    ));
    await tester.pumpAndSettle();
  }
  testWidgets('entry requests foreground permission and denial keeps a usable retry', (tester) async {
    await pump(tester);
    expect(platform.requests, 1);
    expect(find.text('Allow location'), findsOneWidget);
    await tester.tap(find.text('Allow location')); await tester.pumpAndSettle();
    expect(platform.requests, 2);
    expect(tester.takeException(), isNull);
  });
  testWidgets('permanent refusal opens app settings without repeating OS prompts', (tester) async {
    platform.permission = LocationPermission.deniedForever;
    await pump(tester);
    expect(platform.requests, 0);
    await tester.tap(find.text('Open settings')); await tester.pumpAndSettle();
    expect(platform.opened, 1);
  });
  testWidgets('disabled GPS opens location settings; granted access hides the notice', (tester) async {
    platform.permission = LocationPermission.whileInUse; platform.enabled = false;
    await pump(tester);
    await tester.tap(find.text('Open settings')); await tester.pumpAndSettle();
    expect(platform.opened, 1);
    platform.enabled = true;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.byType(TextButton), findsNothing);
  });
}
