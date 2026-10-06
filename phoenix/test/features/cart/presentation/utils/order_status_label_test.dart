import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/features/cart/data/models/order_model.dart';
import 'package:feniq/features/cart/data/models/order_status_history_entry.dart';
import 'package:feniq/features/cart/presentation/utils/order_status_label.dart';
import 'package:feniq/generated/app_localizations.dart';

// The pharmacist follows an order through: sent, (edited by the warehouse,
// only when it was), waiting for approval, on the way, delivered. The
// warehouse approves straight into "on the way"; 'confirmed' / 'preparing' are
// no longer reached, and an older order left in one reads as waiting.
void main() {
  late AppLocalizations en;
  late AppLocalizations ar;

  setUpAll(() async {
    en = await AppLocalizations.delegate.load(const Locale('en'));
    ar = await AppLocalizations.delegate.load(const Locale('ar'));
  });

  group('orderStatusLabel - where the order stands now', () {
    test('English', () {
      expect(orderStatusLabel(en, 'pending'), 'Waiting for Approval');
      expect(orderStatusLabel(en, 'confirmed'), 'Waiting for Approval');
      expect(orderStatusLabel(en, 'preparing'), 'Waiting for Approval');
      expect(orderStatusLabel(en, 'out_for_delivery'), 'On the Way');
      expect(orderStatusLabel(en, 'delivered'), 'Delivered');
      expect(orderStatusLabel(en, 'cancelled'), 'Cancelled');
    });

    test('Arabic', () {
      expect(orderStatusLabel(ar, 'pending'), 'بانتظار الموافقة');
      expect(orderStatusLabel(ar, 'preparing'), 'بانتظار الموافقة');
      expect(orderStatusLabel(ar, 'out_for_delivery'), 'بالطريق');
      expect(orderStatusLabel(ar, 'delivered'), 'تم التسليم');
      expect(orderStatusLabel(ar, 'modified'), 'تم تعديل الطلب');
    });
  });

  group('orderHistoryLabel - one line of the history', () {
    test('the first entry is the moment it was sent', () {
      expect(orderHistoryLabel(ar, 'pending'), 'تم الإرسال');
      expect(orderHistoryLabel(ar, 'modified'), 'تم تعديل الطلب');
      expect(orderHistoryLabel(ar, 'out_for_delivery'), 'بالطريق');
      expect(orderHistoryLabel(ar, 'preparing'), 'قيد التحضير');
    });
  });

  group('orderStatusDescription', () {
    test('every stage before delivery and delivery itself have one (EN + AR)', () {
      expect(orderStatusDescription(en, 'pending'), 'Your order has reached the warehouse');
      expect(orderStatusDescription(en, 'out_for_delivery'), 'Your order has left the warehouse');
      expect(orderStatusDescription(en, 'delivered'), 'You received the order');

      expect(orderStatusDescription(ar, 'pending'), 'وصل طلبك إلى المستودع');
      expect(orderStatusDescription(ar, 'confirmed'), 'وصل طلبك إلى المستودع');
      expect(orderStatusDescription(ar, 'out_for_delivery'), 'طلبك طلع من المستودع');
      expect(orderStatusDescription(ar, 'delivered'), 'استلمت الطلب');
    });

    test('cancelled / modified / unknown carry none', () {
      expect(orderStatusDescription(en, 'cancelled'), isNull);
      expect(orderStatusDescription(en, 'modified'), isNull);
      expect(orderStatusDescription(en, 'whatever'), isNull);
    });
  });

  group('the tracked stages', () {
    OrderModel orderWith(String status, {List<OrderStatusHistoryEntry> history = const []}) => OrderModel(
      id: '1',
      orderNumber: 1,
      status: status,
      totalPrice: 0,
      discountAmount: 0,
      commissionAmount: 0,
      finalPrice: 0,
      statusHistory: history,
    );

    test('four steps; a new order is past "sent" and waiting for approval', () {
      final order = orderWith('pending');
      expect(order.trackedStages, [
        OrderStage.sent,
        OrderStage.awaitingApproval,
        OrderStage.outForDelivery,
        OrderStage.delivered,
      ]);
      expect(order.stageIndex, 1);
      expect(orderWith('out_for_delivery').stageIndex, 2);
      expect(orderWith('delivered').stageIndex, 3);
      expect(orderWith('cancelled').stageIndex, -1);
      expect(orderWith('cancelled').currentStage, isNull);
    });

    test('an older order left in confirmed / preparing reads as waiting for approval', () {
      expect(orderWith('confirmed').currentStage, OrderStage.awaitingApproval);
      expect(orderWith('preparing').currentStage, OrderStage.awaitingApproval);
    });

    test('an order the warehouse edited gets an "edited" step', () {
      final order = orderWith(
        'pending',
        history: [
          OrderStatusHistoryEntry(status: 'pending', changedAt: DateTime(2026, 1, 1)),
          OrderStatusHistoryEntry(status: 'modified', changedAt: DateTime(2026, 1, 2)),
        ],
      );
      expect(order.trackedStages, [
        OrderStage.sent,
        OrderStage.modified,
        OrderStage.awaitingApproval,
        OrderStage.outForDelivery,
        OrderStage.delivered,
      ]);
      expect(order.stageIndex, 2);
    });

    test('every step has a label', () {
      expect(OrderStage.values.map((stage) => orderStageLabel(ar, stage)), [
        'تم الإرسال',
        'تم تعديل الطلب',
        'بانتظار الموافقة',
        'بالطريق',
        'تم التسليم',
      ]);
    });
  });
}
