import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/features/auth/data/models/user_model.dart';
import 'package:feniq/features/auth/presentation/managers/auth_cubit.dart';
import 'package:feniq/features/auth/presentation/managers/auth_state.dart';

class _OperatorAuth extends MockCubit<AuthState> implements AuthCubit {}

BlocProvider<AuthCubit> warehouseOperatorProvider({
  String warehouseRole = 'accountant',
}) {
  final auth = _OperatorAuth();
  whenListen(
    auth,
    const Stream<AuthState>.empty(),
    initialState: AuthState(
      sessionStatus: SessionStatus.active,
      user: UserModel(
        id: 'operator-test',
        name: 'Operator',
        phone: '+963944000001',
        role: 'warehouse',
        status: 'active',
        lang: 'en',
        warehouseRole: warehouseRole,
      ),
    ),
  );
  return BlocProvider<AuthCubit>.value(value: auth);
}
