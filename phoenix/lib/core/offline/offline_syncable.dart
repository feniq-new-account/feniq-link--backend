/// A repository that can pull a warehouse's whole catalog onto the phone so
/// it can be browsed and searched without a connection.
///
/// A separate interface (rather than a method on CatalogRepository) so a
/// repository stand-in that has no offline support is simply skipped.
abstract interface class OfflineSyncable {
  /// Downloads [warehouseId]'s catalog unless a recent copy is already saved
  /// ([force] re-downloads it anyway). Never throws: a failed download leaves
  /// the previous copy in place and is retried the next time.
  Future<void> syncForOffline(String warehouseId, {bool force = false});
}
