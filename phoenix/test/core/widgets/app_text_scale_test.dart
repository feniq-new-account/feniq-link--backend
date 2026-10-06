import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/core/widgets/app_text_scale.dart';

void main() {
  testWidgets('every text is drawn one notch smaller, on top of the phone setting', (tester) async {
    late double scaled;
    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(textScaler: TextScaler.linear(1.2)),
        child: AppTextScale(
          child: Builder(builder: (context) {
            scaled = MediaQuery.textScalerOf(context).scale(14);
            return const SizedBox();
          }),
        ),
      ),
    );
    expect(scaled, closeTo(14 * 1.2 * kAppTextScale, 0.001));
  });
}
