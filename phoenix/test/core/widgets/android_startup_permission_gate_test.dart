// @dart=3.0
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:feniq/core/widgets/android_startup_permission_gate.dart';

class _FakeLocation extends GeolocatorPlatform {
  LocationPermission permission = LocationPermission.denied;
  bool enabled = false;
  int prompts = 0;
  int appSettings = 0;
  int locationSettings = 0;

  @override
  Future<LocationPermission> checkPermission() async => permission;

  @override
  Future<LocationPermission> requestPermission() async {
    prompts++;
    return permission;
  }

  @override
  Future<bool> isLocationServiceEnabled() async => enabled;

  @override
  Future<bool> openAppSettings() async {
    appSettings++;
    return true;
  }

  @override
  Future<bool> openLocationSettings() async {
    locationSettings++;
    return true;
  }
}

void main() {
  late GeolocatorPlatform old;
  late _FakeLocation location;
  var notificationPrompts = 0;

  setUp(() {
    old = GeolocatorPlatform.instance;
    location = _FakeLocation();
    GeolocatorPlatform.instance = location;
    notificationPrompts = 0;
  });

  tearDown(() => GeolocatorPlatform.instance = old);

  Future<void> show(WidgetTester tester, {required bool requiredGps}) async {
    await tester.pumpWidget(MaterialApp(
      home: AndroidStartupPermissionGate(
        requireGps: requiredGps,
        requestNotifications: () async { notificationPrompts++; },
        child: const Scaffold(body: Text('Private role content')),
      ),
    ));
    await tester.pumpAndSettle();
  }

  testWidgets('pharmacy sees no extra permission UI and keeps browsing after denial', (tester) async {
    await show(tester, requiredGps: false);
    expect(notificationPrompts, 1);
    expect(location.prompts, 1);
    expect(find.text('Private role content'), findsOneWidget);
    expect(find.text('Location must be enabled'), findsNothing);
  });

  testWidgets('driver and rep screens remain inaccessible when GPS is off', (tester) async {
    location.permission = LocationPermission.whileInUse;
    location.enabled = false;
    await show(tester, requiredGps: true);
    expect(find.text('Private role content'), findsNothing);
    expect(find.text('Location must be enabled'), findsOneWidget);
    await tester.tap(find.text('Enable location'));
    await tester.pumpAndSettle();
    expect(location.locationSettings, 1);
    location.enabled = true;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.text('Private role content'), findsOneWidget);
  });

  testWidgets('permanent denial directs the operator to Android app settings', (tester) async {
    location.permission = LocationPermission.deniedForever;
    location.enabled = true;
    await show(tester, requiredGps: true);
    expect(location.prompts, 0);
    expect(find.text('Private role content'), findsNothing);
    await tester.tap(find.text('Enable location'));
    await tester.pumpAndSettle();
    expect(location.appSettings, 1);
  });

  testWidgets('access is blocked again after location is disabled on resume', (tester) async {
    location.permission = LocationPermission.whileInUse;
    location.enabled = true;
    await show(tester, requiredGps: true);
    expect(find.text('Private role content'), findsOneWidget);
    location.enabled = false;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.text('Private role content'), findsNothing);
  });
}
