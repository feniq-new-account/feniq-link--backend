// Navigation context for an individual warehouse. The phone is optional
// because banners/deep links may not have a warehouse card in memory yet.
class ManufacturersRouteArgs {
  const ManufacturersRouteArgs({
    required this.warehouseName,
    this.warehousePhone,
    this.autoFilterManufacturer,
  });

  final String warehouseName;
  final String? warehousePhone;
  final String? autoFilterManufacturer;
}
