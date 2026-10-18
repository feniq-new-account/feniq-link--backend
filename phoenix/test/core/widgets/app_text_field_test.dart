import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/core/widgets/app_text_field.dart';

Widget _host(Widget child) => MaterialApp(home: Scaffold(body: child));

bool _obscured(WidgetTester tester) =>
    tester.widget<EditableText>(find.byType(EditableText)).obscureText;

void main() {
  group('AppTextField password visibility', () {
    testWidgets('a password field starts hidden and the eye shows / hides it', (tester) async {
      final controller = TextEditingController(text: 'secret123');
      await tester.pumpWidget(
        _host(AppTextField(label: 'Password', controller: controller, obscureText: true)),
      );

      expect(_obscured(tester), isTrue);
      expect(find.byIcon(Icons.visibility_outlined), findsOneWidget);

      await tester.tap(find.byKey(appTextFieldVisibilityToggleKey));
      await tester.pump();
      expect(_obscured(tester), isFalse);
      expect(find.byIcon(Icons.visibility_off_outlined), findsOneWidget);

      await tester.tap(find.byKey(appTextFieldVisibilityToggleKey));
      await tester.pump();
      expect(_obscured(tester), isTrue);
    });

    testWidgets('a plain field has no eye button', (tester) async {
      await tester.pumpWidget(
        _host(AppTextField(label: 'Name', controller: TextEditingController())),
      );
      expect(find.byKey(appTextFieldVisibilityToggleKey), findsNothing);
    });

    testWidgets("a caller's own suffixIcon wins over the built-in eye", (tester) async {
      await tester.pumpWidget(
        _host(AppTextField(
          label: 'Password',
          controller: TextEditingController(),
          obscureText: true,
          suffixIcon: const Icon(Icons.lock),
        )),
      );
      expect(find.byKey(appTextFieldVisibilityToggleKey), findsNothing);
      expect(find.byIcon(Icons.lock), findsOneWidget);
    });
  });
}
