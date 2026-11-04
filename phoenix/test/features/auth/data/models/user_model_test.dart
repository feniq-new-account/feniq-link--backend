import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/features/auth/data/models/user_model.dart';

void main() {
  group('Server role permissions', () {
    UserModel actor({String role = 'warehouse', String status = 'active', String warehouseRole = 'accountant', Map<String, dynamic>? permissions}) => UserModel.fromJson({
      'id': 'role-test', 'name': 'Role test', 'phone': '+963944000001', 'role': role,
      'status': status, 'lang': 'en', 'warehouseRole': warehouseRole,
      if (permissions != null) 'permissions': permissions,
    });
    test('explicit server denial overrides an older role hint; legacy responses retain valid operator access', () {
      expect(actor().canRecordPayments, isTrue);
      expect(actor(permissions: {'paymentRecord': false}).canRecordPayments, isFalse);
      expect(actor(warehouseRole: 'owner').canRecordPayments, isFalse);
      expect(actor(warehouseRole: 'owner').canConfigureFeatures, isTrue);
      expect(actor(permissions: {}).canRecordPayments, isFalse);
    });
    test('inactive and non-warehouse identities cannot use cash permissions', () {
      expect(actor(status: 'blocked', permissions: {'paymentRecord': true}).canRecordPayments, isFalse);
      expect(actor(role: 'pharmacy', permissions: {'paymentRecord': true}).canRecordPayments, isFalse);
    });
  });
  group('UserModel', () {
    group('constructor', () {
      test('creates instance with required parameters', () {
        const user = UserModel(
          id: 'user123',
          name: 'John Doe',
          phone: '+96393123456',
          role: 'pharmacy',
          status: 'active',
          lang: 'ar',
        );

        expect(user.id, equals('user123'));
        expect(user.name, equals('John Doe'));
        expect(user.phone, equals('+96393123456'));
        expect(user.role, equals('pharmacy'));
        expect(user.status, equals('active'));
        expect(user.lang, equals('ar'));
      });
    });

    group('fromJson', () {
      test('creates instance from JSON', () {
        final json = {
          'id': 'user123',
          'name': 'John Doe',
          'phone': '+96393123456',
          'role': 'pharmacy',
          'status': 'active',
          'lang': 'ar',
        };

        final user = UserModel.fromJson(json);

        expect(user.id, equals('user123'));
        expect(user.name, equals('John Doe'));
        expect(user.phone, equals('+96393123456'));
        expect(user.role, equals('pharmacy'));
        expect(user.status, equals('active'));
        expect(user.lang, equals('ar'));
      });

      test('handles all fields correctly from JSON', () {
        final json = {
          'id': 'id456',
          'name': 'Jane Smith',
          'phone': '0993456789',
          'role': 'admin',
          'status': 'pending',
          'lang': 'en',
        };

        final user = UserModel.fromJson(json);

        expect(user.id, equals('id456'));
        expect(user.name, equals('Jane Smith'));
        expect(user.phone, equals('0993456789'));
        expect(user.role, equals('admin'));
        expect(user.status, equals('pending'));
        expect(user.lang, equals('en'));
      });
    });

    group('status getters', () {
      test('isPending returns true when status is pending', () {
        const user = UserModel(
          id: 'user1',
          name: 'User',
          phone: '0993123456',
          role: 'pharmacy',
          status: 'pending',
          lang: 'ar',
        );

        expect(user.isPending, isTrue);
        expect(user.isBlocked, isFalse);
        expect(user.isActive, isFalse);
      });

      test('isBlocked returns true when status is blocked', () {
        const user = UserModel(
          id: 'user1',
          name: 'User',
          phone: '0993123456',
          role: 'pharmacy',
          status: 'blocked',
          lang: 'ar',
        );

        expect(user.isPending, isFalse);
        expect(user.isBlocked, isTrue);
        expect(user.isActive, isFalse);
      });

      test('isActive returns true when status is active', () {
        const user = UserModel(
          id: 'user1',
          name: 'User',
          phone: '0993123456',
          role: 'pharmacy',
          status: 'active',
          lang: 'ar',
        );

        expect(user.isPending, isFalse);
        expect(user.isBlocked, isFalse);
        expect(user.isActive, isTrue);
      });

      test('all status getters are false for unknown status', () {
        const user = UserModel(
          id: 'user1',
          name: 'User',
          phone: '0993123456',
          role: 'pharmacy',
          status: 'unknown',
          lang: 'ar',
        );

        expect(user.isPending, isFalse);
        expect(user.isBlocked, isFalse);
        expect(user.isActive, isFalse);
      });
    });
  });

  group('UserModel.mustChangePassword', () {
    Map<String, dynamic> json([Map<String, dynamic> extra = const {}]) => {
      'id': 'user123',
      'name': 'John Doe',
      'phone': '+96393123456',
      'role': 'pharmacy',
      'status': 'active',
      'lang': 'ar',
      ...extra,
    };

    test('is read from the server response', () {
      expect(UserModel.fromJson(json({'mustChangePassword': true})).mustChangePassword, isTrue);
      expect(UserModel.fromJson(json({'mustChangePassword': false})).mustChangePassword, isFalse);
    });

    test('a server that predates the field reads as false', () {
      expect(UserModel.fromJson(json()).mustChangePassword, isFalse);
      expect(UserModel.fromJson(json({'mustChangePassword': null})).mustChangePassword, isFalse);
    });
  });
}
