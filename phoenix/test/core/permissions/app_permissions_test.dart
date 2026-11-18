import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/core/permissions/app_permissions.dart';
import 'package:feniq/core/services/fcm_service.dart';

void main() {
  group('permissionsFor', () {
    test('a warehouse manager gets the push-reliability trio first on a Xiaomi', () {
      final kinds = permissionsFor(const PermissionAudience(role: 'warehouse', warehouseRole: 'owner'),
          manufacturer: 'Xiaomi');
      expect(kinds.take(3), [
        AppPermissionKind.notifications,
        AppPermissionKind.battery,
        AppPermissionKind.autostart,
      ]);
      expect(kinds, contains(AppPermissionKind.microphone));
      expect(kinds, contains(AppPermissionKind.camera));
      expect(kinds, isNot(contains(AppPermissionKind.location)));
    });

    test('the autostart row is only shown on phones that have that switch', () {
      const owner = PermissionAudience(role: 'warehouse');
      expect(permissionsFor(owner, manufacturer: 'samsung'), isNot(contains(AppPermissionKind.autostart)));
      expect(permissionsFor(owner, manufacturer: ' Redmi '), contains(AppPermissionKind.autostart));
      expect(permissionsFor(owner), isNot(contains(AppPermissionKind.autostart)));
    });

    test('an accountant keeps notifications, battery and the microphone, not the camera', () {
      final kinds = permissionsFor(const PermissionAudience(role: 'warehouse', warehouseRole: 'accountant'));
      expect(kinds, [AppPermissionKind.notifications, AppPermissionKind.battery, AppPermissionKind.microphone]);
    });

    test('only a driver is asked for background location', () {
      expect(permissionsFor(const PermissionAudience(role: 'driver')), contains(AppPermissionKind.backgroundLocation));
      for (final role in ['warehouse', 'rep', 'pharmacy']) {
        expect(permissionsFor(PermissionAudience(role: role)), isNot(contains(AppPermissionKind.backgroundLocation)),
            reason: role);
      }
    });

    test('a pharmacy is never asked for battery or microphone', () {
      final kinds = permissionsFor(const PermissionAudience(role: 'pharmacy'), manufacturer: 'xiaomi');
      expect(kinds, [AppPermissionKind.notifications, AppPermissionKind.location, AppPermissionKind.camera]);
    });
  });

  group('channelForPushData', () {
    test('a new-order push shows on the ringing new-orders channel', () {
      expect(channelForPushData({'androidChannel': 'feniq_new_orders'}).id, 'feniq_new_orders');
      expect(newOrdersAndroidChannel.playSound, isTrue);
      expect(newOrdersAndroidChannel.enableVibration, isTrue);
    });

    test('anything else, or an unknown name, stays on the general channel', () {
      expect(channelForPushData({}).id, 'phoenix_default_channel');
      expect(channelForPushData({'androidChannel': 'made_up'}).id, 'phoenix_default_channel');
    });
  });
}
