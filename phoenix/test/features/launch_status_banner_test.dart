import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/features/launch/launch_status_banner.dart';
import 'package:feniq/generated/app_localizations.dart';

void main() {
  Future<void> pump(
    WidgetTester tester,
    Future<AppLaunchStatus> Function() load,
    ValueChanged<bool> onChange,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: LaunchStatusBanner(load: load, onOrderingChanged: onChange),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets(
    'closed launch displays the real reason and never enables checkout',
    (tester) async {
      final values = <bool>[];
      await pump(
        tester,
        () async => const AppLaunchStatus(
          orderingEnabled: false,
          message: 'Orders are not open yet',
        ),
        values.add,
      );
      expect(find.text('Orders are not open yet'), findsOneWidget);
      expect(values, [false, false]);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'a fresh open status permits ordering, failure on retry removes permission',
    (tester) async {
      final values = <bool>[];
      var calls = 0;
      await pump(tester, () async {
        if (++calls > 1) throw Exception('offline');
        return const AppLaunchStatus(orderingEnabled: true, message: 'Ready');
      }, values.add);
      expect(values.last, true);
      await tester.pump(const Duration(minutes: 1));
      await tester.pumpAndSettle();
      expect(values.last, false);
      expect(find.byType(TextButton), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    },
  );
  test('expired pilot response is parsed as a closed launch without errors', () {
    final status = AppLaunchStatus.fromJson({
      'mode': 'registration_only',
      'orderingEnabled': false,
      'message': 'انتهت فترة تجربة الطلبات.',
      'revision': 5,
      'orderingClosesAt': '2026-11-08T21:00:00.000Z',
      'orderingClosedByDeadline': true,
    });
    expect(status.orderingEnabled, isFalse);
    expect(status.message, contains('انتهت'));
  });

  testWidgets('expired pilot displays closure explanation instead of network error',
    (tester) async {
      final values = <bool>[];
      await pump(
        tester,
        () async => AppLaunchStatus.fromJson({
          'mode': 'registration_only',
          'orderingEnabled': false,
          'message': 'انتهت فترة تجربة الطلبات.',
          'orderingClosedByDeadline': true,
        }),
        values.add,
      );
      expect(values.last, false);
      expect(find.text('انتهت فترة تجربة الطلبات.'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    },
  );
  test('malformed status cannot grant ordering', () {
    expect(
      () => AppLaunchStatus.fromJson({
        'mode': 'registration_only',
        'orderingEnabled': true,
        'message': 'Invalid',
      }),
      throwsFormatException,
    );
  });
}
