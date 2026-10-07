// Carries the warehouse name and chosen manufacturer from ManufacturersView
// to CatalogView (passed as the go_router `extra`) - warehouseName is still
// needed there for cart operations (see CartCubit.addProduct), even though
// the AppBar now shows the manufacturer name instead of it.
class CatalogRouteArgs {
  const CatalogRouteArgs({
    required this.warehouseName,
    required this.manufacturer,
    this.manufacturerTitle,
    this.initialSearch,
  });

  final String warehouseName;
  final String manufacturer;
  // The company as shown in the app bar (its English name when it has one);
  // [manufacturer] stays the value the catalog filters on.
  final String? manufacturerTitle;
  // Opens the catalog already searched for this text - set when the
  // pharmacist comes from another warehouse's alternatives to this medicine.
  final String? initialSearch;
}
