import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/core/services/android_release_policy.dart';
import 'package:feniq/core/services/apk_update_installer.dart';

class ApkAdapter implements HttpClientAdapter {
  ApkAdapter(this.answer);
  final Future<ResponseBody> Function(RequestOptions) answer;
  int calls = 0;
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) {
    calls++;
    return answer(options);
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('com.feniq.link/app_update');
  late Directory directory;
  final policy = AndroidReleasePolicy(
    latestBuild: 1050,
    versionName: '1.0.1',
    apkUrl: 'https://updates.example/feniq.apk',
    sha256: 'a' * 64,
    size: 500000,
    roles: {},
  );
  setUp(() async {
    directory = await Directory.systemTemp.createTemp('feniq-apk-test-');
  });
  tearDown(() async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
    await directory.delete(recursive: true);
  });

  test(
    'unknown-source permission retry reuses the downloaded APK and sends verification metadata to Android',
    () async {
      final adapter = ApkAdapter(
        (_) async => ResponseBody.fromBytes(
          Uint8List(500000),
          200,
          headers: {
            Headers.contentLengthHeader: ['500000'],
          },
        ),
      );
      final dio = Dio()..httpClientAdapter = adapter;
      var nativeCalls = 0;
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async {
            nativeCalls++;
            expect(call.arguments['build'], 1050);
            expect(call.arguments['sha256'], 'a' * 64);
            expect(
              await File(call.arguments['path'] as String).length(),
              500000,
            );
            return nativeCalls == 1 ? 'permission_required' : 'install_started';
          });
      final installer = ApkUpdateInstaller(
        dio: dio,
        channel: channel,
        directoryProvider: () async => directory,
      );
      expect(
        await installer.install(policy),
        ApkInstallResult.permissionRequired,
      );
      expect(await installer.install(policy), ApkInstallResult.started);
      expect(adapter.calls, 1);
      expect(nativeCalls, 2);
    },
  );

  test(
    'a partial file never reaches the Android installer and the next attempt can succeed',
    () async {
      var nativeCalls = 0;
      var full = false;
      final adapter = ApkAdapter(
        (_) async => ResponseBody.fromBytes(Uint8List(full ? 500000 : 20), 200),
      );
      final dio = Dio()..httpClientAdapter = adapter;
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (_) async {
            nativeCalls++;
            return 'install_started';
          });
      final installer = ApkUpdateInstaller(
        dio: dio,
        directoryProvider: () async => directory,
      );
      expect(await installer.install(policy), ApkInstallResult.failed);
      expect(nativeCalls, 0);
      expect(
        await File('${directory.path}/updates/feniq-1050.apk.part').exists(),
        false,
      );
      full = true;
      expect(await installer.install(policy), ApkInstallResult.started);
      expect(nativeCalls, 1);
    },
  );

  test('an HTTPS redirect cannot send a download to cleartext HTTP', () async {
    final adapter = ApkAdapter(
      (_) async => ResponseBody.fromBytes(
        [],
        302,
        headers: {
          'location': ['http://updates.example/feniq.apk'],
        },
      ),
    );
    final dio = Dio()..httpClientAdapter = adapter;
    final installer = ApkUpdateInstaller(
      dio: dio,
      directoryProvider: () async => directory,
    );
    expect(await installer.install(policy), ApkInstallResult.failed);
    expect(adapter.calls, 1);
  });
}
