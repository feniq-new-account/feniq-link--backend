import '../../helpers/android_release_fixture.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:feniq/core/services/android_release_policy.dart';
import 'package:feniq/core/services/app_update_service.dart';
import 'package:feniq/core/services/remote_config_service.dart';
import 'package:feniq/core/services/storage_service.dart';

class RemoteConfigMock extends Mock implements RemoteConfigService {}
class BrokenStorage extends Mock implements StorageService {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late StorageService storage;
  late RemoteConfigMock remote;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    storage = StorageService(await SharedPreferences.getInstance());
    remote = RemoteConfigMock();
    when(() => remote.refresh()).thenAnswer((_) async {});
    when(() => remote.latestVersion).thenReturn('0.0.0');
    when(() => remote.minVersion).thenReturn('0.0.0');
  });

  AppUpdateService checker(
    Future<Map<String, dynamic>> Function() fetch,
    DateTime Function() now, {
    int build = 1049,
  }) => AppUpdateService(
    remoteConfigService: remote,
    storageService: storage,
    currentVersion: '1.0.0',
    currentBuild: build,
    now: now,
    fetchRelease: fetch,
  );

  test(
    'role changes reuse one policy without forcing a supported pharmacy build',
    () async {
      var now = DateTime.utc(2026, 10, 29, 10);
      var calls = 0;
      final service = checker(() async {
        calls++;
        return releasePayload(now);
      }, () => now);
      expect(
        await service.checkForUpdate(role: 'pharmacy'),
        AppUpdateStatus.none,
      );
      expect(
        await service.checkForUpdate(role: 'rep'),
        AppUpdateStatus.optional,
      );
      expect(calls, 1);
      now = DateTime.utc(2026, 10, 30, 10);
      expect(
        await service.checkForUpdate(role: 'rep'),
        AppUpdateStatus.mandatory,
      );
      expect(
        await service.checkForUpdate(role: 'pharmacy'),
        AppUpdateStatus.none,
      );
    },
  );

  test(
    'a saved deadline becomes mandatory offline and remains required after restart and clock rollback',
    () async {
      var now = DateTime.utc(2026, 10, 29, 10);
      var offline = false;
      Future<Map<String, dynamic>> fetch() async {
        if (offline) throw Exception('offline');
        return releasePayload(now);
      }

      final service = checker(fetch, () => now);
      expect(
        await service.checkForUpdate(role: 'rep'),
        AppUpdateStatus.optional,
      );
      now = DateTime.utc(2026, 10, 31, 10);
      offline = true;
      expect(
        await service.checkForUpdate(role: 'rep'),
        AppUpdateStatus.mandatory,
      );
      now = DateTime.utc(2026, 10, 1);
      final restarted = checker(fetch, () => now);
      expect(
        await restarted.checkForUpdate(role: 'rep'),
        AppUpdateStatus.mandatory,
      );
      final updated = checker(fetch, () => now, build: 1050);
      expect(await updated.checkForUpdate(role: 'rep'), AppUpdateStatus.none);
    },
  );

  test(
    'a 426 policy immediately applies without waiting for the polling interval or another fetch',
    () async {
      final now = DateTime.utc(2026, 10, 31);
      var calls = 0;
      final service = checker(() async {
        calls++;
        throw Exception('must use API policy');
      }, () => now);
      await service.acceptRequiredPolicy(releasePayload(now));
      expect(
        await service.checkForUpdate(role: 'rep'),
        AppUpdateStatus.mandatory,
      );
      expect(calls, 0);
    },
  );

  test(
    'a malformed response cannot erase a mandatory policy; a valid disabled policy can',
    () async {
      final now = DateTime.utc(2026, 10, 31);
      var response = releasePayload(now);
      final service = checker(() async => response, () => now);
      expect(
        await service.checkForUpdate(role: 'rep'),
        AppUpdateStatus.mandatory,
      );
      response = {};
      expect(
        await service.checkForUpdate(role: 'rep', force: true),
        AppUpdateStatus.mandatory,
      );
      response = {'release': null, 'serverTime': now.toIso8601String()};
      expect(
        await service.checkForUpdate(role: 'rep', force: true),
        AppUpdateStatus.none,
      );
    },
  );

  test('anonymous sign-in is blocked only if all roles require an update', () {
    final now = DateTime.utc(2026, 10, 31);
    final policy = AndroidReleasePolicy.fromJson(
      releasePayload(now)['release'] as Map<String, dynamic>,
    );
    expect(policy.statusFor(null, 1049, now), ReleaseUpdateStatus.optional);
    final all = AndroidReleasePolicy.fromJson(
      releasePayload(now, allMandatory: true)['release']
          as Map<String, dynamic>,
    );
    expect(all.statusFor(null, 1049, now), ReleaseUpdateStatus.mandatory);
  });

  test('a known mandatory policy still blocks this session when persistent storage cannot be written', () async {
    final broken = BrokenStorage();
    when(() => broken.getString(any())).thenReturn(null);
    when(() => broken.setString(any(), any())).thenThrow(Exception('Disk full'));
    when(() => broken.remove(any())).thenThrow(Exception('Disk full'));
    final now = DateTime.utc(2026, 10, 31);
    final service = AppUpdateService(remoteConfigService: remote, storageService: broken,
      currentVersion: '1.0.0', currentBuild: 1049, now: () => now,
      fetchRelease: () async => releasePayload(now));
    expect(await service.checkForUpdate(role: 'rep'), AppUpdateStatus.mandatory);
    expect(await service.checkForUpdate(role: 'pharmacy'), AppUpdateStatus.none);
  });

  test(
    'bad URLs, package identities and build bounds are rejected before downloading',
    () {
      final source =
          releasePayload(DateTime.utc(2026, 10, 31))['release']
              as Map<String, dynamic>;
      for (final patch in [
        {'apkUrl': 'http://feniq-site.onrender.com/feniq.apk'},
        {'applicationId': 'another.package'},
        {'sha256': 'broken'},
        {'size': 0},
      ]) {
        expect(
          () => AndroidReleasePolicy.fromJson({...source, ...patch}),
          throwsFormatException,
        );
      }
    },
  );
}
