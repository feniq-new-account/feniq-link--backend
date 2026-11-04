import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_insights_models.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_management_repository.dart';

class WarehouseInsightsState {
  const WarehouseInsightsState({
    this.status = RepLoadStatus.initial,
    this.tabs = const [],
    this.tab = 'overview',
    this.period = 'month',
    this.report,
    this.followUp,
    this.alerts = const [],
    this.flags = const {},
    this.errorMessage,
    this.errorCode,
    this.actionErrorMessage,
    this.actionErrorCode,
    this.loadingMore = false,
    this.saving = false,
    this.alertsAsOf = '',
  });
  final RepLoadStatus status;
  final List<String> tabs;
  final String tab, period;
  final WarehouseInsightsReport? report;
  final WarehouseFollowUpPage? followUp;
  final List<WarehouseInsightAlert> alerts;
  final Map<String, bool> flags;
  final String? errorMessage, errorCode, actionErrorMessage, actionErrorCode;
  final bool loadingMore, saving;
  final String alertsAsOf;
  String get asOfBusiness => report?.asOfBusiness ?? followUp?.asOfBusiness ?? alertsAsOf;
  FollowUpSettings? get settings => report?.settings ?? followUp?.settings;
  WarehouseInsightsState action({
    List<WarehouseInsightAlert>? alerts,
    WarehouseFollowUpPage? followUp,
    bool loadingMore = false,
    bool saving = false,
    String? errorMessage,
    String? errorCode,
  }) => WarehouseInsightsState(
    status: status,
    tabs: tabs,
    tab: tab,
    period: period,
    report: report,
    followUp: followUp ?? this.followUp,
    alerts: alerts ?? this.alerts,
    flags: flags,
    actionErrorMessage: errorMessage,
    actionErrorCode: errorCode,
    loadingMore: loadingMore,
    saving: saving,
    alertsAsOf: alertsAsOf,
  );
}

class WarehouseInsightsCubit extends Cubit<WarehouseInsightsState> {
  WarehouseInsightsCubit({required WarehouseManagementRepository repository, required String warehouseRole})
    : _repository = repository,
      _warehouseRole = warehouseRole,
      super(const WarehouseInsightsState());
  final WarehouseManagementRepository _repository;
  final String _warehouseRole;
  int _generation = 0;

  Future<void> loadAccess() async {
    final request = ++_generation;
    emit(
      WarehouseInsightsState(
        status: RepLoadStatus.loading,
        tabs: state.tabs,
        tab: state.tab,
        period: state.period,
        flags: state.flags,
      ),
    );
    try {
      final flags = await _repository.getInsightAccess();
      if (isClosed || request != _generation) return;
      final tabs = [
        if (flags[_warehouseRole == 'owner' ? 'ownerInsights' : 'salesReports'] == true) 'overview',
        if (flags['overdueReceivables'] == true) 'overdue',
        if (flags['inactivePharmacies'] == true) 'inactive',
        if (flags['ownerAlerts'] == true) 'alerts',
      ];
      emit(
        WarehouseInsightsState(
          status: tabs.isEmpty ? RepLoadStatus.loaded : RepLoadStatus.loading,
          tabs: tabs,
          flags: flags,
          tab: tabs.contains(state.tab) ? state.tab : tabs.firstOrNull ?? 'overview',
          period: state.period,
        ),
      );
      if (tabs.isNotEmpty) await load(force: true);
    } on Failure catch (error) {
      if (isClosed || request != _generation) return;
      emit(
        WarehouseInsightsState(
          status: RepLoadStatus.error,
          tabs: state.tabs,
          tab: state.tab,
          period: state.period,
          flags: state.flags,
          errorMessage: error.errMessage,
          errorCode: error.code,
        ),
      );
    }
  }

  Future<void> setTab(String tab) async {
    if (!state.tabs.contains(tab) || state.tab == tab) return;
    emit(
      WarehouseInsightsState(
        status: RepLoadStatus.loading,
        tabs: state.tabs,
        tab: tab,
        period: state.period,
        flags: state.flags,
      ),
    );
    await load();
  }

  Future<void> setPeriod(String period) async {
    if (!['today', 'week', 'month'].contains(period) || period == state.period) return;
    emit(
      WarehouseInsightsState(
        status: RepLoadStatus.loading,
        tabs: state.tabs,
        tab: state.tab,
        period: period,
        flags: state.flags,
      ),
    );
    await load();
  }

  Future<void> load({bool force = false}) async {
    final request = ++_generation;
    final current = state;
    emit(
      WarehouseInsightsState(
        status: RepLoadStatus.loading,
        tabs: current.tabs,
        tab: current.tab,
        period: current.period,
        flags: current.flags,
      ),
    );
    try {
      WarehouseInsightsReport? report;
      WarehouseFollowUpPage? page;
      List<WarehouseInsightAlert> alerts = const [];
      String alertsAsOf = '';
      if (current.tab == 'overview') {
        report = await _repository.getInsights(period: current.period, force: force);
      } else if (current.tab == 'alerts') {
        final data = await _repository.getInsightAlerts();
        alerts = data.alerts;
        alertsAsOf = data.asOfBusiness;
      } else {
        page = await _repository.getFollowUp(kind: current.tab, force: force);
      }
      if (isClosed || request != _generation) return;
      emit(
        WarehouseInsightsState(
          status: RepLoadStatus.loaded,
          tabs: current.tabs,
          tab: current.tab,
          period: current.period,
          flags: current.flags,
          report: report,
          followUp: page,
          alerts: alerts,
          alertsAsOf: alertsAsOf,
        ),
      );
    } on Failure catch (error) {
      if (isClosed || request != _generation) return;
      emit(
        WarehouseInsightsState(
          status: RepLoadStatus.error,
          tabs: current.tabs,
          tab: current.tab,
          period: current.period,
          flags: current.flags,
          errorMessage: error.errMessage,
          errorCode: error.code,
        ),
      );
    }
  }

  Future<void> loadMore() async {
    final page = state.followUp;
    if (page == null || !page.hasMore || page.nextCursor == null || state.loadingMore) return;
    final request = _generation;
    final tab = state.tab;
    emit(state.action(loadingMore: true));
    try {
      final next = await _repository.getFollowUp(kind: tab, after: page.nextCursor);
      if (isClosed || request != _generation) return;
      final ids = page.rows.map((row) => row.pharmacyId).toSet();
      emit(
        state.action(
          followUp: WarehouseFollowUpPage(
            rows: [...page.rows, ...next.rows.where((row) => ids.add(row.pharmacyId))],
            total: next.total,
            hasMore: next.hasMore,
            nextCursor: next.nextCursor,
            asOfBusiness: page.asOfBusiness,
            settings: next.settings,
          ),
        ),
      );
    } on Failure catch (error) {
      if (isClosed || request != _generation) return;
      emit(state.action(errorMessage: error.errMessage, errorCode: error.code));
    }
  }

  Future<bool> saveSettings(FollowUpSettings settings) async {
    if (state.saving) return false;
    final request = _generation;
    emit(state.action(saving: true));
    try {
      await _repository.updateFollowUp(settings);
      if (isClosed || request != _generation) return false;
      await load(force: true);
      return state.status == RepLoadStatus.loaded;
    } on Failure catch (error) {
      if (!isClosed && request == _generation) {
        emit(state.action(errorMessage: error.errMessage, errorCode: error.code));
      }
      return false;
    }
  }
}
