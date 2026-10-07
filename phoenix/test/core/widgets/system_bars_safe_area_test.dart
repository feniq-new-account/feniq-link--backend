import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/core/widgets/system_bars_safe_area.dart';

void main() {
  testWidgets('a bottom sheet button stays above the phone navigation buttons', (tester) async {
    tester.view.physicalSize = const Size(400, 800);
    tester.view.devicePixelRatio = 1;
    // The phone's navigation buttons take the bottom 48pt.
    tester.view.padding = const FakeViewPadding(bottom: 48);
    tester.view.viewPadding = const FakeViewPadding(bottom: 48);
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => SystemBarsSafeArea(child: child!),
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: TextButton(
                onPressed: () => showModalBottomSheet<void>(
                  context: context,
                  builder: (_) => const SizedBox(
                    height: 120,
                    child: Align(alignment: Alignment.bottomCenter, child: Text('Add')),
                  ),
                ),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    final addBottom = tester.getBottomLeft(find.text('Add')).dy;
    expect(addBottom, lessThanOrEqualTo(800 - 48), reason: 'clear of the navigation buttons');
  });
}
