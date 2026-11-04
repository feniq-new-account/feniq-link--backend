import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:feniq/core/services/app_update_events.dart';

class AppBuildInterceptor extends Interceptor {
  Future<String?>? _build;
  Future<String?> _installedBuild() async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return null;
    try {
      final info = await PackageInfo.fromPlatform();
      final value = int.tryParse(info.buildNumber);
      return value != null && value > 0 ? '$value' : null;
    } catch (_) {
      return null;
    }
  }

  @override
  void onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final build = await (_build ??= _installedBuild());
    if (build != null) {
      options.headers['X-Feniq-Client'] = 'android';
      options.headers['X-App-Build'] = build;
    }
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final body = err.response?.data;
    if (err.response?.statusCode == 426 &&
        body is Map &&
        body['code'] == 'APP_UPDATE_REQUIRED' &&
        body['details'] is Map) {
      AppUpdateEvents.required(
        Map<String, dynamic>.from(body['details'] as Map),
      );
    }
    handler.next(err);
  }
}
