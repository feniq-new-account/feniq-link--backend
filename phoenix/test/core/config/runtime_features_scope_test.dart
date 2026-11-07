import 'package:feniq/core/config/runtime_features_scope.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('installed app follows ON/OFF/ON and fails closed on refresh failure', (tester) async {
    var enabled = true;
    var failed = false;
    await tester.pumpWidget(RuntimeFeaturesScope(
      load: () async {
        if (failed) throw Exception('offline');
        return enabled;
      },
      child: Builder(builder: (context) => Text(
        RuntimeFeaturesScope.ratingsEnabled(context) ? 'Ratings ON' : 'Ratings OFF',
        textDirection: TextDirection.ltr,
      )),
    ));
    await tester.pump();
    expect(find.text('Ratings ON'), findsOneWidget);
    enabled = false;
    await tester.pump(const Duration(seconds: 30));
    await tester.pump();
    expect(find.text('Ratings OFF'), findsOneWidget);
    enabled = true;
    await tester.pump(const Duration(seconds: 30));
    await tester.pump();
    expect(find.text('Ratings ON'), findsOneWidget);
    failed = true;
    await tester.pump(const Duration(seconds: 30));
    await tester.pump();
    expect(find.text('Ratings OFF'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
