import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/constants/storage_keys.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/core/services/fcm_service.dart';
import 'package:feniq/core/services/secure_storage_service.dart';
import 'package:feniq/features/auth/data/models/auth_response.dart';
import 'package:feniq/features/auth/data/models/me_response.dart';
import 'package:feniq/features/auth/data/models/user_model.dart';
import 'package:feniq/features/auth/data/repositories/auth_repository_impl.dart';
import 'package:feniq/features/auth/presentation/managers/auth_cubit.dart';
import 'package:feniq/features/auth/presentation/managers/auth_state.dart';
import 'package:feniq/features/notifications/data/repositories/notification_repository.dart';

// The forced password change after an admin reset, and the ordinary change
// from Settings, at the cubit level.

class MockAuthRepository extends Mock implements AuthRepositoryImpl {}

class MockSecureStorage extends Mock implements SecureStorageService {}

class MockFcmService extends Mock implements FcmService {}

class MockNotificationRepository extends Mock implements NotificationRepository {}

UserModel _user({String status = 'active', bool mustChangePassword = false}) => UserModel(
  id: 'u1',
  name: 'Dr. Test',
  phone: '+963999999999',
  role: 'pharmacy',
  status: status,
  lang: 'ar',
  mustChangePassword: mustChangePassword,
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late MockAuthRepository repo;
  late MockSecureStorage storage;
  late MockFcmService fcm;
  late MockNotificationRepository notifications;

  AuthCubit build() => AuthCubit(
    authRepository: repo,
    secureStorage: storage,
    fcmService: fcm,
    notificationRepository: notifications,
  );

  setUp(() {
    repo = MockAuthRepository();
    storage = MockSecureStorage();
    fcm = MockFcmService();
    notifications = MockNotificationRepository();
    when(() => storage.delete(any())).thenAnswer((_) async {});
    when(() => storage.write(any(), any())).thenAnswer((_) async {});
    when(() => fcm.initialize()).thenAnswer((_) async {});
    when(() => fcm.unregisterDevice()).thenAnswer((_) async {});
    when(() => notifications.clear()).thenAnswer((_) async {});
  });

  group('mustChangePassword -> SessionStatus.passwordChangeRequired', () {
    test('a stored session flagged by the server is forced on launch', () async {
      when(() => storage.read(StorageKeys.authToken)).thenAnswer((_) async => 'jwt');
      when(() => repo.getMe()).thenAnswer(
        (_) async => MeResponse(user: _user(mustChangePassword: true)),
      );
      final cubit = build();

      await cubit.checkSession();

      expect(cubit.state.sessionStatus, SessionStatus.passwordChangeRequired);
      // Not `active` yet, so no push registration until the change is done.
      verifyNever(() => fcm.initialize());
      await cubit.close();
    });

    test('signing in with the temporary password is forced', () async {
      when(() => repo.loginWithPassword(phone: any(named: 'phone'), password: any(named: 'password')))
          .thenAnswer(
            (_) async => AuthResponse(
              token: 'jwt',
              refreshToken: 'r',
              user: _user(mustChangePassword: true),
            ),
          );
      final cubit = build();

      final ok = await cubit.loginWithPassword(phone: '+963999999999', password: 'TempPass7xKq');

      expect(ok, isTrue);
      expect(cubit.state.sessionStatus, SessionStatus.passwordChangeRequired);
      await cubit.close();
    });

    test('blocked and pending still win over the flag', () async {
      when(() => storage.read(StorageKeys.authToken)).thenAnswer((_) async => 'jwt');
      when(() => repo.getMe()).thenAnswer(
        (_) async => MeResponse(user: _user(status: 'pending', mustChangePassword: true)),
      );
      final cubit = build();

      await cubit.checkSession();

      expect(cubit.state.sessionStatus, SessionStatus.pendingApproval);
      await cubit.close();
    });

    test('an unflagged user is active as before', () async {
      when(() => storage.read(StorageKeys.authToken)).thenAnswer((_) async => 'jwt');
      when(() => repo.getMe()).thenAnswer((_) async => MeResponse(user: _user()));
      final cubit = build();

      await cubit.checkSession();

      expect(cubit.state.sessionStatus, SessionStatus.active);
      await cubit.close();
    });
  });

  group('changePassword', () {
    void stubChange(UserModel user) {
      when(
        () => repo.changePassword(
          currentPassword: any(named: 'currentPassword'),
          newPassword: any(named: 'newPassword'),
        ),
      ).thenAnswer(
        (_) async => AuthResponse(token: 'new-jwt', refreshToken: 'new-refresh', user: user),
      );
    }

    test('a forced change stores the new tokens and lands the session on active', () async {
      when(() => storage.read(StorageKeys.authToken)).thenAnswer((_) async => 'jwt');
      when(() => repo.getMe()).thenAnswer(
        (_) async => MeResponse(user: _user(mustChangePassword: true)),
      );
      stubChange(_user());
      final cubit = build();
      await cubit.checkSession();
      expect(cubit.state.sessionStatus, SessionStatus.passwordChangeRequired);

      final ok = await cubit.changePassword(
        currentPassword: 'TempPass7xKq',
        newPassword: 'my-own-password-9',
      );

      expect(ok, isTrue);
      expect(cubit.state.sessionStatus, SessionStatus.active);
      expect(cubit.state.user!.mustChangePassword, isFalse);
      expect(cubit.state.isSubmitting, isFalse);
      verify(
        () => repo.changePassword(
          currentPassword: 'TempPass7xKq',
          newPassword: 'my-own-password-9',
        ),
      ).called(1);
      verify(() => storage.write(StorageKeys.authToken, 'new-jwt')).called(1);
      verify(() => storage.write(StorageKeys.refreshToken, 'new-refresh')).called(1);
      // Push registration was skipped while forced; it happens now.
      verify(() => fcm.initialize()).called(1);
      await cubit.close();
    });

    test('a change from Settings keeps the session active and swaps the tokens', () async {
      when(() => storage.read(StorageKeys.authToken)).thenAnswer((_) async => 'jwt');
      when(() => repo.getMe()).thenAnswer((_) async => MeResponse(user: _user()));
      stubChange(_user());
      final cubit = build();
      await cubit.checkSession();
      clearInteractions(fcm);

      final ok = await cubit.changePassword(currentPassword: 'old-pass-1', newPassword: 'new-pass-22');

      expect(ok, isTrue);
      expect(cubit.state.sessionStatus, SessionStatus.active);
      verify(() => storage.write(StorageKeys.authToken, 'new-jwt')).called(1);
      // Already registered for push at launch - not again.
      verifyNever(() => fcm.initialize());
      await cubit.close();
    });

    test('a wrong current password keeps the forced state and stores nothing', () async {
      when(() => storage.read(StorageKeys.authToken)).thenAnswer((_) async => 'jwt');
      when(() => repo.getMe()).thenAnswer(
        (_) async => MeResponse(user: _user(mustChangePassword: true)),
      );
      when(
        () => repo.changePassword(
          currentPassword: any(named: 'currentPassword'),
          newPassword: any(named: 'newPassword'),
        ),
      ).thenThrow(
        ServerFailure(
          'The current password is incorrect.',
          code: 'INVALID_CURRENT_PASSWORD',
          statusCode: 401,
        ),
      );
      final cubit = build();
      await cubit.checkSession();

      final ok = await cubit.changePassword(currentPassword: 'wrong', newPassword: 'my-own-password-9');

      expect(ok, isFalse);
      expect(cubit.state.sessionStatus, SessionStatus.passwordChangeRequired);
      expect(cubit.state.errorCode, 'INVALID_CURRENT_PASSWORD');
      expect(cubit.state.isSubmitting, isFalse);
      verifyNever(() => storage.write(any(), any()));
      verifyNever(() => storage.delete(any()));
      await cubit.close();
    });
  });
}
