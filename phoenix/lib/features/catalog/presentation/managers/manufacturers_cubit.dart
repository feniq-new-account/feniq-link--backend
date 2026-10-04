import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/core/offline/offline_syncable.dart';
import 'package:feniq/features/catalog/data/repositories/catalog_repository.dart';

import 'manufacturers_state.dart';

class ManufacturersCubit extends Cubit<ManufacturersState> {
  ManufacturersCubit({
    required CatalogRepository catalogRepository,
    required String warehouseId,
  }) : _catalogRepository = catalogRepository,
       _warehouseId = warehouseId,
       super(const ManufacturersState());

  final CatalogRepository _catalogRepository;
  final String _warehouseId;

  Future<void> loadManufacturers() async {
    emit(state.copyWith(status: ManufacturersStatus.loading));
    try {
      final manufacturers = await _catalogRepository.getManufacturers(warehouseId: _warehouseId);
      emit(
        state.copyWith(status: ManufacturersStatus.loaded, manufacturers: manufacturers),
      );
      // The warehouse opened with a connection: take its whole catalog onto the
      // phone in the background, so it can be browsed and searched later with
      // none. Not awaited - the screen has what it needs already.
      if (_catalogRepository case final OfflineSyncable syncable) {
        unawaited(syncable.syncForOffline(_warehouseId));
      }
    } on Failure catch (f) {
      emit(state.copyWith(status: ManufacturersStatus.error, errorMessage: f.errMessage, errorCode: f.code));
    }
  }
}
