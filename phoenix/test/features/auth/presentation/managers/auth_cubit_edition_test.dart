import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/config/app_edition.dart';
import 'package:feniq/core/constants/storage_keys.dart';
import 'package:feniq/core/services/fcm_service.dart';
import 'package:feniq/core/services/secure_storage_service.dart';
import 'package:feniq/features/auth/data/models/auth_response.dart';
import 'package:feniq/features/auth/data/models/user_model.dart';
import 'package:feniq/features/auth/data/repositories/auth_repository_impl.dart';
import 'package:feniq/features/auth/presentation/managers/auth_cubit.dart';
import 'package:feniq/features/auth/presentation/managers/auth_state.dart';
import 'package:feniq/features/notifications/data/repositories/notification_repository.dart';

class MockAuthRepository extends Mock implements AuthRepositoryImpl {}

class MockSecureStorage extends Mock implements SecureStorageService {}

class MockFcmService extends Mock implements FcmService {}

class MockNotificationRepository extends Mock implements NotificationRepository {}

UserModel _account(String role) => UserModel(
  id: 'u1',
  name: 'Test',
  phone: '+963940000201',
  role: role,
  status: 'active',
  lang: 'ar',
);

// The pharmacy app and the rep app each take only their own accounts, and a
// refused sign-in leaves nothing stored on the phone (AppEdition).
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

  Future<bool> signInAs(AuthCubit cubit, String role) {
    when(() => repo.loginWithPassword(phone: any(named: 'phone'), password: any(named: 'password')))
        .thenAnswer((_) async => AuthResponse(token: 'jwt', refreshToken: 'refresh', user: _account(role)));
    return cubit.loginWithPassword(phone: '+963940000201', password: 'secret-pass');
  }

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

  tearDown(() => AppEdition.isRepApp = false);

  group('the rep app', () {
    setUp(() => AppEdition.isRepApp = true);

    test('signs a rep in and stores the session', () async {
      final cubit = build();
      expect(await signInAs(cubit, 'rep'), isTrue);

      expect(cubit.state.sessionStatus, SessionStatus.active);
      expect(cubit.state.user?.isRep, isTrue);
      verify(() => storage.write(StorageKeys.authToken, 'jwt')).called(1);
      await cubit.close();
    });

    for (final role in ['pharmacy', 'warehouse', 'admin']) {
      test('refuses a $role account and stores nothing', () async {
        final cubit = build();
        expect(await signInAs(cubit, role), isFalse);

        expect(cubit.state.errorCode, 'REP_APP_ONLY');
        expect(cubit.state.user, isNull);
        expect(cubit.state.isSubmitting, isFalse);
        verifyNever(() => storage.write(any(), any()));
        await cubit.close();
      });
    }
  });

  group('the pharmacy app', () {
    test('signs a pharmacy in', () async {
      final cubit = build();
      expect(await signInAs(cubit, 'pharmacy'), isTrue);

      expect(cubit.state.sessionStatus, SessionStatus.active);
      verify(() => storage.write(StorageKeys.authToken, 'jwt')).called(1);
      await cubit.close();
    });

    test('refuses a rep account, says where to go, and stores nothing', () async {
      final cubit = build();
      expect(await signInAs(cubit, 'rep'), isFalse);

      expect(cubit.state.errorCode, 'PHARMACY_APP_ONLY');
      expect(cubit.state.user, isNull);
      verifyNever(() => storage.write(any(), any()));
      await cubit.close();
    });
  });
}
