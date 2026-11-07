import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/widgets/phone_text_field.dart';
import 'package:feniq/core/widgets/app_text_field.dart';
import 'package:feniq/core/widgets/primary_button.dart';
import 'package:feniq/features/auth/presentation/managers/auth_cubit.dart';
import 'package:feniq/features/auth/presentation/managers/auth_state.dart';
import 'package:feniq/features/auth/presentation/views/password_login_view.dart';
import 'package:feniq/generated/app_localizations.dart';

class MockAuthCubit extends MockCubit<AuthState> implements AuthCubit {}

void main() {
  late MockAuthCubit authCubit;

  setUp(() {
    authCubit = MockAuthCubit();
    when(() => authCubit.state).thenReturn(const AuthState());
    when(() => authCubit.loadSavedLogin()).thenAnswer((_) async => null);
    when(() => authCubit.forgetSavedLogin()).thenAnswer((_) async {});
    // Returning false makes _submit stop right after the call, so the test
    // never needs a GoRouter for the post-login navigation.
    when(
      () => authCubit.loginWithPassword(
        phone: any(named: 'phone'),
        password: any(named: 'password'),
      ),
    ).thenAnswer((_) async => false);
  });

  Future<void> pumpLoginView(WidgetTester tester) async {
    await tester.pumpWidget(
      BlocProvider<AuthCubit>.value(
        value: authCubit,
        child: MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: const PasswordLoginView(),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<String> phoneSentToBackendFor(WidgetTester tester, String typed) async {
    await pumpLoginView(tester);

    final fields = find.byType(TextFormField);
    await tester.enterText(fields.at(0), typed); // phone
    await tester.enterText(fields.at(1), 'pharmacist-password'); // password
    await tester.ensureVisible(find.byType(PrimaryButton));
    await tester.tap(find.byType(PrimaryButton));
    await tester.pump();

    final captured = verify(
      () => authCubit.loginWithPassword(
        phone: captureAny(named: 'phone'),
        password: any(named: 'password'),
      ),
    ).captured.single as String;
    return captured;
  }

  testWidgets('the full phone is editable in one field with no fixed 09 prefix', (
    tester,
  ) async {
    await pumpLoginView(tester);
    expect(find.byType(PhoneTextField), findsOneWidget);
    expect(find.text('09'), findsNothing);
    expect(find.text('9xxxxxxxx'), findsOneWidget);
    expect(find.text('09xxxxxxxx / +9639xxxxxxxx'), findsNothing);
  });

  group('PasswordLoginView sends the international phone to loginWithPassword', () {
    const expected = '+963912345678';

    for (final typed in const [
      '0912345678',
      '912345678',
      '963912345678',
      '+963912345678',
      '9630912345678',
      '00963912345678',
      '09 1234 5678',
      '+963 912 345 678',
    ]) {
      testWidgets('"$typed" -> "$expected"', (tester) async {
        expect(await phoneSentToBackendFor(tester, typed), expected);
      });
    }
  });

  testWidgets('password is passed straight through (never logged/altered)', (
    tester,
  ) async {
    await pumpLoginView(tester);

    final fields = find.byType(TextFormField);
    await tester.enterText(fields.at(0), '0912345678');
    await tester.enterText(fields.at(1), 'S3cret-pw!');
    await tester.ensureVisible(find.byType(PrimaryButton));
    await tester.tap(find.byType(PrimaryButton));
    await tester.pump();

    verify(
      () => authCubit.loginWithPassword(
        phone: '+963912345678',
        password: 'S3cret-pw!',
      ),
    ).called(1);
  });

  testWidgets('an unsupported phone shape fails validation, no call is made', (
    tester,
  ) async {
    await pumpLoginView(tester);

    final fields = find.byType(TextFormField);
    await tester.enterText(fields.at(0), '123456');
    await tester.enterText(fields.at(1), 'pharmacist-password');
    await tester.ensureVisible(find.byType(PrimaryButton));
    await tester.tap(find.byType(PrimaryButton));
    await tester.pump();

    verifyNever(
      () => authCubit.loginWithPassword(
        phone: any(named: 'phone'),
        password: any(named: 'password'),
      ),
    );
  });

  testWidgets('stored phone and password are prefilled but password stays hidden', (tester) async {
    when(() => authCubit.loadSavedLogin()).thenAnswer((_) async => {
      'phone': '+963912345678',
      'password': 'saved-secret',
    });
    await pumpLoginView(tester);
    final fields = find.byType(TextFormField);
    expect(tester.widget<TextFormField>(fields.at(0)).controller!.text, '+963912345678');
    expect(tester.widget<TextFormField>(fields.at(1)).controller!.text, 'saved-secret');
    expect(tester.widget<EditableText>(find.byType(EditableText).at(1)).obscureText, isTrue);
    await tester.tap(find.byKey(appTextFieldVisibilityToggleKey));
    await tester.pump();
    expect(tester.widget<EditableText>(find.byType(EditableText).at(1)).obscureText, isFalse);
  });

  testWidgets('the user can forget saved credentials from the login screen', (tester) async {
    when(() => authCubit.loadSavedLogin()).thenAnswer((_) async => {
      'phone': '0912345678',
      'password': 'saved-secret',
    });
    await pumpLoginView(tester);
    await tester.tap(find.byIcon(Icons.delete_outline));
    await tester.pump();
    verify(() => authCubit.forgetSavedLogin()).called(1);
    final fields = find.byType(TextFormField);
    expect(tester.widget<TextFormField>(fields.at(0)).controller!.text, isEmpty);
    expect(tester.widget<TextFormField>(fields.at(1)).controller!.text, isEmpty);
  });

}
