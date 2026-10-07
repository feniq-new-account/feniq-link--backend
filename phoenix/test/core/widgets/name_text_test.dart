import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/core/utils/display_name.dart';
import 'package:feniq/core/widgets/name_text.dart';

void main() {
  Future<Text> pump(WidgetTester tester, String name, TextDirection direction) async {
    await tester.pumpWidget(Directionality(textDirection: direction, child: NameText(name)));
    return tester.widget<Text>(find.text(name));
  }

  testWidgets('an English name on an Arabic screen: laid out left-to-right, lined up on the right', (tester) async {
    final text = await pump(tester, 'PANADOL 500 TAB.', TextDirection.rtl);
    expect(text.textDirection, TextDirection.ltr);
    expect(text.textAlign, TextAlign.right);
  });

  testWidgets('an English name on an English screen lines up on the left', (tester) async {
    final text = await pump(tester, 'PANADOL 500 TAB.', TextDirection.ltr);
    expect(text.textDirection, TextDirection.ltr);
    expect(text.textAlign, TextAlign.left);
  });

  testWidgets('an Arabic name follows the screen', (tester) async {
    final text = await pump(tester, 'بنادول 500', TextDirection.rtl);
    expect(text.textDirection, isNull);
    expect(text.textAlign, isNull);
  });

  test('isLatinName', () {
    expect(isLatinName('CETAMOL 500 CTD TAB.'), isTrue);
    expect(isLatinName('سيتامول 500'), isFalse);
    expect(isLatinName('CETAMOL شراب'), isFalse);
    expect(isLatinName('  '), isFalse);
  });
}
