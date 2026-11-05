import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/utils/whatsapp_launcher.dart';
import 'package:feniq/features/auth/presentation/managers/auth_cubit.dart';
import 'package:feniq/features/auth/presentation/managers/auth_state.dart';
import 'package:feniq/features/auth/presentation/views/approval_pending_view.dart';
import 'package:feniq/generated/app_localizations.dart';

class MockPendingAuth extends MockCubit<AuthState> implements AuthCubit {}

void main() {
  for (final language in ['ar', 'en']) {
    testWidgets('pending support supplies and copies the existing Feniq number ($language)', (tester) async {
      final auth = MockPendingAuth();
      when(() => auth.state).thenReturn(const AuthState(sessionStatus: SessionStatus.pendingApproval));
      String? copied;
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
        if (call.method == 'Clipboard.setData') copied = (call.arguments as Map)['text'] as String;
        return null;
      });
      addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
      final l10n = lookupAppLocalizations(Locale(language));
      await tester.pumpWidget(MaterialApp(
        locale: Locale(language),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: BlocProvider<AuthCubit>.value(value: auth, child: const ApprovalPendingView()),
      ));
      await tester.pump();
      await tester.scrollUntilVisible(find.text(l10n.contactSupportButton), 200,
        scrollable: find.byType(Scrollable).first);
      await tester.tap(find.text(l10n.contactSupportButton));
      // The waiting badge deliberately pulses; pumpAndSettle never finishes.
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.textContaining(supportWhatsAppPhone), findsOneWidget);
      expect(find.textContaining(language == 'ar' ? 'مستودع النجاح' : 'Al-Najah'), findsNothing);
      await tester.tap(find.text(l10n.copyAction));
      await tester.pump();
      expect(copied, supportWhatsAppPhone);
      await tester.pumpWidget(const SizedBox());
    });
  }
}
