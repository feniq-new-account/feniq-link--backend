abstract interface class WarehouseFeaturePreferencesRepository {
  Future<Map<String, dynamic>> getFeaturePreferences();
  Future<Map<String, dynamic>> saveFeaturePreferences({
    required int revision,
    required String reason,
    required Map<String, bool> features,
  });
}
