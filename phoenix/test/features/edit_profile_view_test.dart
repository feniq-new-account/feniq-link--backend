import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/widgets/primary_button.dart';
import 'package:feniq/features/auth/data/models/user_model.dart';
import 'package:feniq/features/auth/data/models/pharmacy_model.dart';
import 'package:feniq/features/auth/presentation/managers/auth_cubit.dart';
import 'package:feniq/features/auth/presentation/managers/auth_state.dart';
import 'package:feniq/features/profile/presentation/views/edit_profile_view.dart';
import 'package:feniq/generated/app_localizations.dart';
class MockProfileAuth extends MockCubit<AuthState> implements AuthCubit {}
void main() {
  testWidgets('pending account edits its profile without changing identity, approval or its saved location', (tester) async {
    final auth = MockProfileAuth();
    when(() => auth.state).thenReturn(AuthState(sessionStatus: SessionStatus.pendingApproval,
      user: UserModel.fromJson({'id': 'own', 'name': 'Pharmacist', 'phone': '+963944000001', 'role': 'pharmacy', 'status': 'pending', 'lang': 'en'}),
      pharmacy: PharmacyModel.fromJson({'id':'pharmacy', 'nameAr':'Pharmacy', 'nameEn':'Pharmacy', 'ownerName':'Pharmacist', 'address':'Street', 'areaName':'Jableh', 'areaType':'rural', 'city':'Latakia', 'phone':'+963944000001'})));
    when(() => auth.updateProfile(any())).thenAnswer((_) async => false);
    await tester.pumpWidget(BlocProvider<AuthCubit>.value(value: auth, child: MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales, home: const EditProfileView())));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byType(PrimaryButton));
    await tester.tap(find.byType(PrimaryButton));
    await tester.pumpAndSettle();
    final changes = verify(() => auth.updateProfile(captureAny())).captured.single as Map<String,dynamic>;
    expect(changes, {'name':'Pharmacist', 'pharmacyName':'Pharmacy', 'address':'Street', 'areaName':'Jableh', 'areaType':'rural'});
  });
}
