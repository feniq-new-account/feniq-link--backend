import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/config/app_config.dart';
import 'package:feniq/features/auth/data/models/user_model.dart';
import 'package:feniq/features/auth/presentation/managers/auth_cubit.dart';
import 'package:feniq/features/auth/presentation/managers/auth_state.dart';
import 'package:feniq/features/panel/panel_home_view.dart';
import 'package:feniq/generated/app_localizations.dart';

class MockAuthCubit extends MockCubit<AuthState> implements AuthCubit {}

const _warehouse = UserModel(id: 'w1', name: 'Al-Najah', phone: '+963930000101', role: 'warehouse', status: 'active', lang: 'en');

void main() {
  late MockAuthCubit auth;

  setUp(() {
    auth = MockAuthCubit();
    whenListen(auth, const Stream<AuthState>.empty(),
        initialState: const AuthState(sessionStatus: SessionStatus.active, user: _warehouse));
  });

  Future<void> pump(WidgetTester tester, PanelUrlOpener opener) => tester.pumpWidget(
    BlocProvider<AuthCubit>.value(
      value: auth,
      child: MaterialApp(
        locale: const Locale('en'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: PanelHomeView(openUrl: opener),
      ),
    ),
  );

  testWidgets('greets the warehouse and opens the web panel', (tester) async {
    Uri? opened;
    await pump(tester, (url) async {
      opened = url;
      return true;
    });
    expect(find.text('Hello Al-Najah'), findsOneWidget);
    await tester.tap(find.text('Open the warehouse panel'));
    await tester.pump();
    expect(opened, Uri.parse(AppConfig.panelUrl));
    expect(find.byType(SnackBar), findsNothing);
  });

  testWidgets('says where to go when the panel cannot be opened', (tester) async {
    await pump(tester, (_) async => false);
    await tester.tap(find.text('Open the warehouse panel'));
    await tester.pump();
    expect(find.textContaining(AppConfig.panelUrl), findsOneWidget);
  });
}
