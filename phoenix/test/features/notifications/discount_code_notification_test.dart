import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/services/fcm_service.dart';
import 'package:feniq/core/services/navigation_service.dart';
import 'package:feniq/core/session/session_scope.dart';
import 'package:feniq/features/auth/data/repositories/auth_repository.dart';
import 'package:feniq/features/catalog/data/models/manufacturers_route_args.dart';
import 'package:feniq/features/notifications/data/models/notification_model.dart';
import 'package:feniq/features/notifications/data/repositories/notification_repository.dart';
import 'package:feniq/features/notifications/presentation/utils/discount_code_deep_link.dart';
import 'package:feniq/routes/route_names.dart';
import 'package:feniq/routes/route_paths.dart';

class _MockAuthRepository extends Mock implements AuthRepository {}

class _MockNotificationRepository extends Mock implements NotificationRepository {}

// "You have a discount code": a pharmacy-specific code became usable. Tapping
// it opens the warehouse the code works on - or, for an admin's code (every
// warehouse), the warehouse list.
void main() {
  group('the notification', () {
    test('is parsed as a discount-code notification carrying its warehouse', () {
      final model = NotificationModel.fromRemoteMessage(
        const RemoteMessage(
          messageId: 'm1',
          data: {'type': 'discount_code', 'relatedWarehouseId': 'wh-1', 'warehouseName': 'مستودع أ'},
          notification: RemoteNotification(title: 'كود خصم خاص بك', body: 'استخدم الكود ABCD2345'),
        ),
      )!;
      expect(model.type, NotificationType.discountCode);
      expect(model.isDiscountCode, isTrue);
      expect(model.relatedWarehouseId, 'wh-1');
      expect(model.warehouseName, 'مستودع أ');
      expect(model.hasOrderDeepLink, isFalse);
    });

    test('an admin code carries no warehouse', () {
      final model = NotificationModel.fromRemoteMessage(
        const RemoteMessage(
          data: {'type': 'discount_code'},
          notification: RemoteNotification(title: 't', body: 'b'),
        ),
      )!;
      expect(model.isDiscountCode, isTrue);
      expect(model.relatedWarehouseId, isNull);
    });

    test('its local-notification payload round-trips the warehouse, even with a | in the name', () {
      final payload = discountCodePayload({'relatedWarehouseId': 'wh-1', 'warehouseName': 'A | B'});
      expect(payload, 'warehouse:wh-1|A | B');
      final target = parseWarehousePayload(payload.substring('warehouse:'.length));
      expect(target.warehouseId, 'wh-1');
      expect(target.warehouseName, 'A | B');
      expect(discountCodePayload({}), 'warehouses:all');
    });
  });

  group('tapping it', () {
    late FcmService fcm;

    Future<void> pumpApp(WidgetTester tester) async {
      final router = GoRouter(
        navigatorKey: NavigationService.instance.navigatorKey,
        initialLocation: '/',
        routes: [
          GoRoute(path: '/', builder: (context, state) => const Text('SHELL')),
          GoRoute(
            name: RouteNames.manufacturers,
            path: RoutePaths.manufacturers,
            builder: (context, state) => Text(
              'WAREHOUSE ${state.pathParameters['warehouseId']} '
              '${(state.extra as ManufacturersRouteArgs).warehouseName}',
            ),
          ),
          GoRoute(
            name: RouteNames.warehouseSelection,
            path: RoutePaths.warehouseSelection,
            builder: (context, state) => const Text('WAREHOUSE LIST'),
          ),
        ],
      );
      await tester.pumpWidget(MaterialApp.router(routerConfig: router));
      await tester.pumpAndSettle();
    }

    setUp(() {
      fcm = FcmService(
        authRepository: _MockAuthRepository(),
        notificationRepository: _MockNotificationRepository(),
        sessionScope: SessionScope(),
      );
    });

    testWidgets('a warehouse code opens that warehouse', (tester) async {
      await pumpApp(tester);
      fcm.parkInitialMessage(const RemoteMessage(
        data: {'type': 'discount_code', 'relatedWarehouseId': 'wh-1', 'warehouseName': 'Alpha'},
      ));
      fcm.markAppReady();
      await tester.pumpAndSettle();
      expect(find.text('WAREHOUSE wh-1 Alpha'), findsOneWidget);
    });

    testWidgets('an admin code opens the warehouse list', (tester) async {
      await pumpApp(tester);
      fcm.parkInitialMessage(const RemoteMessage(data: {'type': 'discount_code'}));
      fcm.markAppReady();
      await tester.pumpAndSettle();
      expect(find.text('WAREHOUSE LIST'), findsOneWidget);
    });
  });
}
