import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'android_release_policy.dart';

enum ApkInstallResult { started, permissionRequired, cancelled, failed }

/// The only installer path. Android verifies digest, package, build and the
/// installed signing certificate before granting the system installer a URI.
class ApkUpdateInstaller {
  ApkUpdateInstaller({
    Dio? dio,
    MethodChannel? channel,
    Future<Directory> Function()? directoryProvider,
  }) : _dio =
           dio ??
           Dio(
             BaseOptions(
               connectTimeout: const Duration(seconds: 20),
               receiveTimeout: const Duration(minutes: 3),
             ),
           ),
       _channel = channel ?? const MethodChannel('com.feniq.link/app_update'),
       _directoryProvider = directoryProvider ?? getApplicationSupportDirectory;
  final Dio _dio;
  final MethodChannel _channel;
  final Future<Directory> Function() _directoryProvider;
  CancelToken? _cancel;
  bool _busy = false;
  bool _userCancelled = false;

  void cancel() {
    _userCancelled = true;
    _cancel?.cancel('User cancelled update download');
  }

  Future<void> _remove(File? file) async {
    try {
      if (file != null && await file.exists()) await file.delete();
    } catch (_) {
      /* Retry may replace it. */
    }
  }

  Future<ApkInstallResult> install(
    AndroidReleasePolicy release, {
    void Function(int, int)? onProgress,
  }) async {
    if (_busy) return ApkInstallResult.failed;
    _busy = true;
    _userCancelled = false;
    File? temporary;
    try {
      final base = await _directoryProvider();
      final directory = Directory('${base.path}/updates');
      await directory.create(recursive: true);
      final file = File('${directory.path}/feniq-${release.latestBuild}.apk');
      if (_userCancelled) return ApkInstallResult.cancelled;
      if (!await file.exists() || await file.length() != release.size) {
        temporary = File('${file.path}.part');
        _cancel = CancelToken();
        var target = Uri.parse(release.apkUrl);
        Response<dynamic>? response;
        for (var redirects = 0; redirects <= 3; redirects++) {
          if (target.scheme != 'https' || target.userInfo.isNotEmpty) {
            throw const FormatException('An update needs HTTPS');
          }
          response = await _dio.download(
            target.toString(),
            temporary.path,
            cancelToken: _cancel,
            options: Options(
              followRedirects: false,
              validateStatus: (status) =>
                  status != null && status >= 200 && status < 400,
            ),
            onReceiveProgress: (received, total) {
              if (received > release.size) {
                _cancel?.cancel('APK exceeds the signed manifest size');
              }
              onProgress?.call(received, release.size);
            },
          );
          if (response.statusCode! < 300) break;
          final location = response.headers.value('location');
          if (location == null || redirects == 3) {
            throw const FormatException('Invalid update redirect');
          }
          target = target.resolve(location);
        }
        if (response == null ||
            response.realUri.scheme != 'https' ||
            await temporary.length() != release.size) {
          throw const FormatException(
            'APK size or transport differs from manifest',
          );
        }
        if (await file.exists()) await file.delete();
        await temporary.rename(file.path);
        temporary = null;
      }
      if (_userCancelled) return ApkInstallResult.cancelled;
      onProgress?.call(release.size, release.size);
      final result = await _channel.invokeMethod<String>('installApk', {
        'path': file.path,
        'sha256': release.sha256,
        'build': release.latestBuild,
      });
      if (result == 'permission_required') {
        return ApkInstallResult.permissionRequired;
      }
      if (result == 'install_started') return ApkInstallResult.started;
      // A corrupt saved candidate must not poison retries.
      await _remove(file);
      return ApkInstallResult.failed;
    } on DioException catch (error) {
      return CancelToken.isCancel(error) && _userCancelled
          ? ApkInstallResult.cancelled
          : ApkInstallResult.failed;
    } on PlatformException catch (error) {
      if (error.code == 'INVALID_APK') {
        try {
          final directory = await _directoryProvider();
          await _remove(
            File('${directory.path}/updates/feniq-${release.latestBuild}.apk'),
          );
        } catch (_) {
          /* Keep a failed cleanup from hiding the install error. */
        }
      }
      return ApkInstallResult.failed;
    } catch (_) {
      return ApkInstallResult.failed;
    } finally {
      await _remove(temporary);
      _cancel = null;
      _busy = false;
    }
  }
}
