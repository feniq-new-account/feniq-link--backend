import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/features/auth/presentation/managers/auth_cubit.dart';
import 'package:feniq/features/auth/presentation/managers/auth_state.dart';
import 'package:feniq/features/auth/presentation/views/registration_view.dart';
import 'package:feniq/features/auth/presentation/widgets/location_map_field.dart';
import 'package:feniq/generated/app_localizations.dart';

class MockAuth extends MockCubit<AuthState> implements AuthCubit {}

void main() {
  testWidgets(
    'registration exposes manual address and area without requesting GPS or loading map tiles',
    (tester) async {
      final auth = MockAuth();
      when(() => auth.state).thenReturn(const AuthState());
      await tester.pumpWidget(
        BlocProvider<AuthCubit>.value(
          value: auth,
          child: MaterialApp(
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: const RegistrationView(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Street address'), findsOneWidget);
      expect(find.text('Area or village'), findsOneWidget);
      expect(find.byType(LocationMapField), findsNothing);
    },
  );
}
