import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/features/data_preparation/presentation/managers/data_preparation_cubit.dart';
import 'package:feniq/features/data_preparation/presentation/managers/data_preparation_state.dart';
import 'package:feniq/features/medicine_directory/data/medicine_directory.dart';
import 'package:feniq/features/medicine_directory/data/repositories/medicine_directory_repository.dart';

/// For the screens that merely sit inside the main shell: a preparation that is
/// already finished and never does anything, so a test sees none of its
/// full-screen page or its network.
class IdleDataPreparationCubit extends Cubit<DataPreparationState> implements DataPreparationCubit {
  IdleDataPreparationCubit() : super(const DataPreparationState());

  @override
  Future<void> start({bool force = false}) async {}

  @override
  Future<void> skip() async {}

  @override
  void resetForSignOut() {}

  @override
  Duration get doneLinger => Duration.zero;

  @override
  int get maxWarehouses => 0;
}

/// A medicine directory with nothing saved on the phone.
class EmptyDirectoryRepository implements MedicineDirectoryRepository {
  @override
  MedicineDirectory? get current => null;

  @override
  Future<MedicineDirectory?> load() async => null;

  @override
  Future<DirectorySyncOutcome> sync({bool force = false, void Function(int loaded, int total)? onProgress}) async =>
      DirectorySyncOutcome.upToDate;
}
