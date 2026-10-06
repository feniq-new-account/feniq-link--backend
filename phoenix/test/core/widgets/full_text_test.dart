import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/core/widgets/full_text.dart';

void main() {
  // What is actually drawn: the paragraph's own size, line limit and overflow.
  Future<RenderParagraph> pump(WidgetTester tester, String text, double width, {bool inAppBar = false}) async {
    final label = SizedBox(width: width, child: FullText(text, style: const TextStyle(fontSize: 20)));
    await tester.pumpWidget(
      MaterialApp(
        home: inAppBar
            ? Scaffold(appBar: AppBar(title: label))
            : Center(child: label),
      ),
    );
    return tester.renderObject<RenderParagraph>(find.text(text));
  }

  testWidgets('a short text keeps its size', (tester) async {
    final p = await pump(tester, 'Cart', 300);
    expect(p.text.style!.fontSize, 20);
    expect(p.maxLines, isNull);
    expect(p.overflow, TextOverflow.visible);
  });

  testWidgets('a text a little too long is shrunk to fit, not cut', (tester) async {
    final p = await pump(tester, 'Exceptional offers - Al-Najah', 300);
    expect(p.text.style!.fontSize, lessThan(20));
    expect(p.text.style!.fontSize, greaterThanOrEqualTo(20 * 0.78));
    expect(p.overflow, TextOverflow.visible);
  });

  testWidgets('a very long text wraps instead of being cut', (tester) async {
    const long = 'LOSARDIPIN PLUS 160/10/12.5 F.CTD TAB. (30 TAB) with a much longer name';
    final p = await pump(tester, long, 120);
    expect(p.maxLines, isNull);
    expect(p.overflow, TextOverflow.visible);
    expect(tester.getSize(find.text(long)).height, greaterThan(30));
    expect(tester.takeException(), isNull);
  });

  testWidgets('an app bar title is not cut with "..." either', (tester) async {
    final p = await pump(tester, 'العروض الاستثنائية للمستودع', 200, inAppBar: true);
    expect(p.overflow, TextOverflow.visible);
    expect(p.maxLines, isNull);
  });

  testWidgets('a label never wraps or cuts - it shrinks', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: Center(child: SizedBox(width: 60, child: FitLabel('Unavailable today')))),
    );
    final p = tester.renderObject<RenderParagraph>(find.text('Unavailable today'));
    expect(p.overflow, TextOverflow.visible);
    expect(p.maxLines, 1);
    expect(tester.getSize(find.byType(FittedBox)).width, lessThanOrEqualTo(60));
  });
}
