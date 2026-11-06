import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/core/widgets/phone_text_field.dart';

void main() {
  late TextEditingController controller;
  setUp(() => controller = TextEditingController());
  tearDown(() => controller.dispose());

  Future<void> pumpField(WidgetTester tester, {Locale? locale}) async {
    await tester.pumpWidget(
      MaterialApp(
        locale: locale,
        home: Scaffold(
          body: PhoneTextField(label: 'Phone', controller: controller),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('one complete phone input without a fixed 09 box', (tester) async {
    await pumpField(tester);
    expect(find.byType(TextFormField), findsOneWidget);
    expect(find.text('09'), findsNothing);
    expect(find.text('09xxxxxxxx / +9639xxxxxxxx'), findsOneWidget);
    await tester.enterText(find.byType(TextFormField), '0912345678');
    expect(controller.text, '0912345678');
    expect(phoneTextFieldFullValue(controller.text), '+963912345678');
  });

  testWidgets('accepts plus, country code and separators in the one field', (tester) async {
    await pumpField(tester);
    await tester.enterText(find.byType(TextFormField), '+963 912-345678');
    expect(controller.text, '+963 912-345678');
    expect(phoneTextFieldFullValue(controller.text), '+963912345678');
  });

  testWidgets('Arabic and Persian number keys become western digits', (tester) async {
    await pumpField(tester);
    await tester.enterText(find.byType(TextFormField), '٠٩١٢٣٤٥٦٧٨');
    expect(controller.text, '0912345678');
    await tester.enterText(find.byType(TextFormField), '۰۹۱۲۳۴۵۶۷۸');
    expect(controller.text, '0912345678');
  });

  testWidgets('phone text stays LTR even when app language is Arabic', (tester) async {
    await pumpField(tester, locale: const Locale('ar'));
    expect(tester.widget<EditableText>(find.byType(EditableText)).textDirection,
        TextDirection.ltr);
  });

  testWidgets('letters are rejected instead of silently modifying the phone', (tester) async {
    await pumpField(tester);
    await tester.enterText(find.byType(TextFormField), '+963 91a2-345678');
    expect(controller.text, '+963 912-345678');
    expect(phoneTextFieldFullValue(controller.text), '+963912345678');
  });
}
