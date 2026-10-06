import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/core/utils/debouncer.dart';
import 'package:feniq/features/catalog/data/repositories/catalog_repository.dart';

import 'catalog_state.dart';

class CatalogCubit extends Cubit<CatalogState> {
  CatalogCubit({
    required CatalogRepository catalogRepository,
    required String warehouseId,
    String? manufacturer,
    // Opens already searched (arriving from another warehouse's alternatives
    // sheet, straight onto the medicine).
    String? initialSearch,
  }) : _catalogRepository = catalogRepository,
       _warehouseId = warehouseId,
       _manufacturer = manufacturer,
       super(CatalogState(searchQuery: initialSearch?.trim() ?? ''));

  final CatalogRepository _catalogRepository;
  final String _warehouseId;
  // Section 16: CatalogView is scoped to one manufacturer, chosen on
  // ManufacturersView just before it - never cleared from here.
  //
  // Null is the warehouse-wide search on ManufacturersView itself: no
  // manufacturer filter, and nothing is loaded until the pharmacist types -
  // an empty query means "show the manufacturers list", not "every product".
  final String? _manufacturer;

  bool get _isWarehouseSearch => _manufacturer == null;
  final Debouncer _searchDebouncer = Debouncer(duration: const Duration(milliseconds: 400));

  // Generation token for in-flight fetches. Every request takes the next id
  // and only commits its result if that id is still the newest when it
  // resolves - responses arrive out of order (a broad search is slower than
  // the narrower one typed right after it), and without this an older one
  // overwrites a newer one's results, or a loadMore that started under the
  // previous filter appends its page onto the new list and restores its
  // cursor. web/src/hooks/usePaginatedData.js solves the same problem the
  // same way for the admin panel's lists.
  int _requestId = 0;

  bool _isStale(int requestId) => requestId != _requestId || isClosed;

  Future<void> initialize() async {
    final requestId = ++_requestId;
    emit(state.copyWith(status: CatalogStatus.loading));
    try {
      final categories = await _catalogRepository.getCategories();
      final query = state.searchQuery.trim();
      final result = await _catalogRepository.getProducts(
        warehouseId: _warehouseId,
        manufacturer: _manufacturer,
        search: query.isEmpty ? null : query,
      );
      if (_isStale(requestId)) return;
      emit(
        state.copyWith(
          status: CatalogStatus.loaded,
          categories: categories,
          products: result.items,
          hasMore: result.hasMore,
          nextCursor: result.nextCursor,
          clearNextCursor: result.nextCursor == null,
        ),
      );
    } on Failure catch (f) {
      if (_isStale(requestId)) return;
      emit(state.copyWith(status: CatalogStatus.error, errorMessage: f.errMessage, errorCode: f.code));
    }
  }

  void search(String query) {
    // Warehouse-wide search, query cleared: back to the idle state at once -
    // no request, and any fetch still in flight is made stale so its result
    // can't land after the screen has gone back to the manufacturers list.
    if (_isWarehouseSearch && query.trim().isEmpty) {
      _searchDebouncer.cancel();
      _requestId++;
      emit(const CatalogState());
      return;
    }
    emit(state.copyWith(searchQuery: query));
    _searchDebouncer.run(_reloadProducts);
  }

  // The error state's retry: a scoped catalog reloads everything (categories
  // included); the warehouse-wide search just re-runs the current query.
  Future<void> retry() => _isWarehouseSearch ? _reloadProducts() : initialize();

  void selectCategory(String? categoryId) {
    // Cancels any search fetch still waiting out its debounce: it would fire
    // just after this reload and re-run the same request, and the two
    // resolving in either order is exactly what the generation token above
    // has to clean up. The query itself is untouched - the pending call is
    // redundant because _reloadProducts below already reads state.searchQuery.
    _searchDebouncer.cancel();
    emit(
      state.copyWith(selectedCategoryId: categoryId, clearCategory: categoryId == null),
    );
    _reloadProducts();
  }

  // Manufacturer/search/category all restart pagination from page one - the
  // cursor from the previous filter combination means nothing under a new
  // one, so it's never carried over here.
  Future<void> _reloadProducts() async {
    if (_isWarehouseSearch && state.searchQuery.trim().isEmpty) {
      return;
    }
    final requestId = ++_requestId;
    emit(state.copyWith(status: CatalogStatus.loading, hasMore: false, clearNextCursor: true));
    try {
      final result = await _catalogRepository.getProducts(
        warehouseId: _warehouseId,
        manufacturer: _manufacturer,
        search: state.searchQuery.trim().isEmpty ? null : state.searchQuery.trim(),
        categoryId: state.selectedCategoryId,
      );
      if (_isStale(requestId)) return;
      emit(
        state.copyWith(
          status: CatalogStatus.loaded,
          products: result.items,
          hasMore: result.hasMore,
          nextCursor: result.nextCursor,
          clearNextCursor: result.nextCursor == null,
        ),
      );
    } on Failure catch (f) {
      if (_isStale(requestId)) return;
      emit(state.copyWith(status: CatalogStatus.error, errorMessage: f.errMessage, errorCode: f.code));
    }
  }

  // Called as the product grid/list nears its end. Searches paginate like any
  // other listing now (product.service.js), so this applies to them too.
  Future<void> loadMore() async {
    if (!state.hasMore || state.isLoadingMore || state.nextCursor == null) return;

    final requestId = ++_requestId;
    emit(state.copyWith(isLoadingMore: true, clearLoadMoreError: true));
    try {
      final result = await _catalogRepository.getProducts(
        warehouseId: _warehouseId,
        manufacturer: _manufacturer,
        search: state.searchQuery.trim().isEmpty ? null : state.searchQuery.trim(),
        categoryId: state.selectedCategoryId,
        after: state.nextCursor,
      );
      // A filter change while this was in flight makes this page belong to a
      // result set that is no longer on screen - appending it would mix two
      // filters' products and restore the old filter's cursor.
      if (_isStale(requestId)) return;
      emit(
        state.copyWith(
          products: [...state.products, ...result.items],
          hasMore: result.hasMore,
          nextCursor: result.nextCursor,
          clearNextCursor: result.nextCursor == null,
          isLoadingMore: false,
        ),
      );
    } on Failure catch (f) {
      // The cursor/hasMore stay exactly as they were - a retry just repeats
      // this same call rather than needing any state to be rebuilt first.
      if (_isStale(requestId)) return;
      emit(state.copyWith(
        isLoadingMore: false,
        loadMoreErrorMessage: f.errMessage,
        loadMoreErrorCode: f.code,
      ));
    }
  }

  @override
  Future<void> close() {
    _searchDebouncer.cancel();
    return super.close();
  }
}
