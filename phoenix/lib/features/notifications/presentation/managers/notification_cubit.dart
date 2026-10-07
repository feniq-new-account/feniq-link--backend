import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/config/app_features.dart';
import 'package:feniq/features/notifications/data/models/notification_model.dart';
import 'package:feniq/features/notifications/data/repositories/notification_repository.dart';

import 'notification_state.dart';

/// Thin view-model over [NotificationRepository] (which owns persistence).
/// App-wide, provided once in main.dart - the AppBar badge and the inbox
/// screen both read this same instance.
class NotificationCubit extends Cubit<NotificationState> {
  NotificationCubit({required NotificationRepository repository})
    : _repository = repository,
      super(const NotificationState()) {
    _apply(_repository.current);
    _subscription = _repository.changes.listen(_apply);
  }

  final NotificationRepository _repository;
  late final StreamSubscription<List<NotificationModel>> _subscription;

  void _apply(List<NotificationModel> all) {
    if (isClosed) return;
    // Discount codes are switched off for now (AppFeatures): a code's
    // announcement would point at something the pharmacy cannot use.
    final items = AppFeatures.discountCodes ? all : all.where((n) => !n.isDiscountCode).toList();
    emit(
      NotificationState(
        notifications: items,
        unreadCount: items.where((n) => !n.isRead).length,
      ),
    );
  }

  /// Re-read from disk (picks up notifications saved by the FCM background
  /// isolate). Called on app-resume and when the inbox opens.
  Future<void> refresh() => _repository.refresh();

  Future<void> markAsRead(String id) => _repository.markAsRead(id);

  Future<void> markAllAsRead() => _repository.markAllAsRead();

  @override
  Future<void> close() {
    _subscription.cancel();
    return super.close();
  }
}
