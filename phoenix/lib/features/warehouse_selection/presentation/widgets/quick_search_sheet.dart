import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_radius.dart';
import 'package:feniq/features/catalog/data/models/catalog_route_args.dart';
import 'package:feniq/features/catalog/data/models/product_model.dart';
import 'package:feniq/features/catalog/data/models/manufacturers_route_args.dart';
import 'package:feniq/features/catalog/data/repositories/catalog_repository.dart';
import 'package:feniq/features/warehouse_selection/data/models/warehouse_model.dart';
import 'package:feniq/features/warehouse_selection/data/repositories/warehouse_repository.dart';
import 'package:feniq/routes/route_names.dart';

/// Home's one-tap search for products, manufacturers and warehouses.
/// Reuses the authenticated warehouse and product APIs: no new endpoint or
/// public/unscoped product access. Results are first-page previews per
/// warehouse; selecting one opens its existing paginated catalogue search.
class QuickSearchSheet extends StatefulWidget {
  const QuickSearchSheet({
    super.key,
    required this.warehouseRepository,
    required this.catalogRepository,
    required this.visibleWarehouses,
  });

  final WarehouseRepository warehouseRepository;
  final CatalogRepository catalogRepository;
  final List<WarehouseModel> visibleWarehouses;

  @override
  State<QuickSearchSheet> createState() => _QuickSearchSheetState();
}

class _SearchResult {
  const _SearchResult(this.warehouse, this.products);
  final WarehouseModel warehouse;
  final List<ProductModel> products;
}

class _QuickSearchSheetState extends State<QuickSearchSheet> {
  final _controller = TextEditingController();
  final _focusNode = FocusNode();
  Timer? _debounce;
  int _generation = 0;
  bool _loadingWarehouses = true;
  bool _searching = false;
  bool _partial = false;
  bool _limitedToVisible = false;
  List<WarehouseModel> _warehouses = const [];
  List<_SearchResult> _results = const [];
  String _query = '';

  bool get _arabic => Localizations.localeOf(context).languageCode == 'ar';
  String _name(WarehouseModel w) => _arabic ? w.nameAr : (w.nameEn.isNotEmpty ? w.nameEn : w.nameAr);

  @override
  void initState() {
    super.initState();
    _loadWarehouses();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focusNode.requestFocus();
    });
  }

  Future<void> _loadWarehouses() async {
    try {
      // Unlike home, search covers all warehouses accessible to this pharmacy,
      // not only those within the selected city scope.
      final response = await widget.warehouseRepository.getWarehouses(onlyMyCity: false);
      if (!mounted) return;
      setState(() {
        _warehouses = response.warehouses;
        _loadingWarehouses = false;
        _limitedToVisible = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _warehouses = widget.visibleWarehouses;
        _loadingWarehouses = false;
        _limitedToVisible = true;
      });
    }
    if (_query.length >= 2) _search(_query);
  }

  void _onChanged(String text) {
    _debounce?.cancel();
    final query = text.trim();
    _generation++;
    setState(() {
      _query = query;
      _results = const [];
      _partial = false;
      _searching = query.length >= 2;
    });
    if (query.length < 2 || _loadingWarehouses) return;
    _debounce = Timer(const Duration(milliseconds: 350), () => _search(query));
  }

  Future<void> _search(String query) async {
    final request = ++_generation;
    setState(() {
      _searching = true;
      _results = const [];
      _partial = false;
    });
    final found = <_SearchResult>[];
    var failures = 0;
    // Bound concurrency: an unrestricted Future.wait would flood the server
    // as the platform grows beyond its initial few warehouses.
    for (var start = 0; start < _warehouses.length; start += 4) {
      if (!mounted || request != _generation) return;
      final group = _warehouses.skip(start).take(4).toList();
      final results = await Future.wait(group.map((warehouse) async {
        try {
          final page = await widget.catalogRepository.getProducts(
            warehouseId: warehouse.id,
            search: query,
            limit: 6,
          );
          return _SearchResult(warehouse, page.items);
        } catch (_) {
          failures++;
          return _SearchResult(warehouse, const []);
        }
      }));
      if (!mounted || request != _generation) return;
      found.addAll(results.where((result) =>
          result.products.isNotEmpty ||
          _name(result.warehouse).toLowerCase().contains(query.toLowerCase())));
    }
    if (!mounted || request != _generation) return;
    setState(() {
      _results = found;
      _partial = failures > 0;
      _searching = false;
    });
  }

  void _openWarehouse(WarehouseModel warehouse) {
    final name = _name(warehouse);
    // Capture the router before closing this sheet's BuildContext.
    final router = GoRouter.of(context);
    Navigator.of(context).pop();
    router.pushNamed(
      RouteNames.manufacturers,
      pathParameters: {'warehouseId': warehouse.id},
      extra: ManufacturersRouteArgs(warehouseName: name, warehousePhone: warehouse.phone),
    );
  }

  void _openProduct(WarehouseModel warehouse, ProductModel product) {
    final name = _name(warehouse);
    final router = GoRouter.of(context);
    Navigator.of(context).pop();
    router.pushNamed(
      RouteNames.catalog,
      pathParameters: {'warehouseId': warehouse.id},
      extra: CatalogRouteArgs(
        warehouseName: name,
        manufacturer: product.manufacturerAr,
        manufacturerTitle: product.displayManufacturer,
        initialSearch: _query,
      ),
    );
  }

  @override
  void dispose() {
    _generation++;
    _debounce?.cancel();
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final arabic = _arabic;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      arabic ? 'البحث السريع في فينيق' : 'Quick search in Feniq',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                    ),
                  ),
                  IconButton(
                    tooltip: arabic ? 'إغلاق' : 'Close',
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: TextField(
                key: const ValueKey('quickSearch.input'),
                controller: _controller,
                focusNode: _focusNode,
                onChanged: _onChanged,
                textInputAction: TextInputAction.search,
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: _query.isEmpty ? null : IconButton(
                    tooltip: arabic ? 'مسح البحث' : 'Clear search',
                    icon: const Icon(Icons.close),
                    onPressed: () {
                      _controller.clear();
                      _onChanged('');
                    },
                  ),
                  hintText: arabic
                      ? 'اسم الدواء أو الشركة أو المستودع'
                      : 'Medicine, manufacturer or warehouse',
                  border: OutlineInputBorder(borderRadius: AppRadius.small),
                ),
              ),
            ),
            if (_limitedToVisible)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 5),
                child: Text(
                  arabic ? 'الاتصال غير متاح؛ البحث ضمن المستودعات المحمّلة فقط.' : 'Offline: searching loaded warehouses only.',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context)),
                ),
              ),
            Expanded(
              child: _loadingWarehouses || _searching
                  ? const Center(child: CircularProgressIndicator())
                  : _query.length < 2
                      ? Center(child: Text(
                          arabic ? 'اكتب حرفين على الأقل للبحث' : 'Enter at least two characters',
                          style: TextStyle(color: AppColors.textSecondaryOf(context)),
                        ))
                      : _results.isEmpty
                          ? Center(child: Text(
                              _partial
                                  ? (arabic ? 'تعذر تحميل بعض النتائج. حاول مرة ثانية.' : 'Some results could not load. Try again.')
                                  : (arabic ? 'لا توجد نتائج مطابقة' : 'No matching results'),
                            ))
                          : ListView(
                              padding: const EdgeInsets.fromLTRB(12, 8, 12, 20),
                              children: [
                                if (_partial)
                                  Padding(
                                    padding: const EdgeInsets.all(8),
                                    child: Text(
                                      arabic ? 'تعذر تحميل نتائج بعض المستودعات.' : 'Some warehouse results were unavailable.',
                                    ),
                                  ),
                                for (final result in _results) ...[
                                  ListTile(
                                    dense: true,
                                    leading: const Icon(Icons.storefront_outlined),
                                    title: Text(_name(result.warehouse), style: const TextStyle(fontWeight: FontWeight.w700)),
                                    trailing: const Icon(Icons.chevron_right),
                                    onTap: () => _openWarehouse(result.warehouse),
                                  ),
                                  for (final product in result.products)
                                    ListTile(
                                      dense: true,
                                      contentPadding: const EdgeInsetsDirectional.only(start: 20, end: 12),
                                      leading: Icon(Icons.medication_outlined, color: AppColors.primaryOf(context)),
                                      title: Text(product.displayName, maxLines: 2, overflow: TextOverflow.ellipsis),
                                      subtitle: Text(product.displayManufacturer, maxLines: 1, overflow: TextOverflow.ellipsis),
                                      trailing: const Icon(Icons.chevron_right, size: 18),
                                      onTap: () => _openProduct(result.warehouse, product),
                                    ),
                                  const Divider(height: 10),
                                ],
                              ],
                            ),
            ),
          ],
        ),
      ),
    );
  }
}
