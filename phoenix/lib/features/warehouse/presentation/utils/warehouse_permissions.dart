import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/features/auth/presentation/managers/auth_cubit.dart';

bool canRecordWarehousePayments(BuildContext context) =>
    context.read<AuthCubit?>()?.state.user?.canRecordPayments == true;
