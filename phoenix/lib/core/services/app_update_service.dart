import 'package:url_launcher/url_launcher.dart';
import 'dart:convert';
import 'android_release_policy.dart';
import 'apk_update_installer.dart';

import 'package:feniq/core/services/logger_service.dart';
import 'package:feniq/core/services/remote_config_service.dart';
import 'package:feniq/core/services/storage_service.dart';
import 'package:feniq/core/utils/app_version.dart';

enum AppUpdateStatus { none, optional, mandatory }

// The update checker. Deliberately UI-free - a widget in the startup flow
// calls [checkForUpdate] once and shows a dialog only for `optional` /
// `mandatory`.
//
// Two independent "at most once per 24h" guards:
//   1. this class records the last fetch attempt in local storage and skips
//      fetching when < 24h have passed; a cached mandatory update still applies;
//   2. Remote Config's own `minimumFetchInterval` (24h) means even the fetch
//      inside [refresh] won't touch the network more than once a day.
class AppUpdateService {
  AppUpdateService({
    required RemoteConfigService remoteConfigService,
    required StorageService storageService,
    required String currentVersion,
    Duration checkInterval = const Duration(hours: 24),
    DateTime Function()? now,
    Future<Map<String, dynamic>> Function()? fetchRelease,
    int currentBuild = 0,
    ApkUpdateInstaller? apkInstaller,
  }) : _remoteConfig = remoteConfigService,
       _storage = storageService,
       _currentVersion = currentVersion,
       _checkInterval = checkInterval,
       _now = now ?? DateTime.now,
       _fetchRelease = fetchRelease,
       _currentBuild = currentBuild,
       _apkInstaller = apkInstaller ?? ApkUpdateInstaller();

  static const _lastCheckKey = 'app_update.last_check_at';

  final RemoteConfigService _remoteConfig;
  final StorageService _storage;
  final String _currentVersion;
  final Duration _checkInterval;
  final DateTime Function() _now;
  final _logger = LoggerService();
  final Future<Map<String, dynamic>> Function()? _fetchRelease;
  final int _currentBuild;
  final ApkUpdateInstaller _apkInstaller;
  static const _policyKey = 'app_update.android_policy';
  static const _policyCheckKey = 'app_update.android_policy_checked';
  static const _requiredRolesKey = 'app_update.required_roles';
  static const _policyInterval = Duration(minutes: 15);
  AndroidReleasePolicy? _release;
  Map<String, dynamic>? _memoryPolicy;
  Map<String, dynamic>? _requiredRoles;
  ApkInstallResult? lastInstallResult;
  bool get needsInstallPermission =>
      lastInstallResult == ApkInstallResult.permissionRequired;
  bool get downloadCancelled => lastInstallResult == ApkInstallResult.cancelled;
  AndroidReleasePolicy? get release => _release;
  void cancelDownload() => _apkInstaller.cancel();

  Future<void> _remember(String key, String value) async {
    try { await _storage.setString(key, value); } catch (error) {
      _logger.info('Update state remains in memory: $error');
    }
  }

  Future<void> acceptRequiredPolicy(Map<String, dynamic> payload) async {
    if (payload['release'] is! Map) return;
    await _savePolicy(payload);
    await _remember(_policyCheckKey, _now().toIso8601String());
  }

  Future<void> _savePolicy(Map<String, dynamic> payload) async {
    if (!payload.containsKey('release') ||
        payload['serverTime'] is! String ||
        DateTime.tryParse(payload['serverTime'] as String) == null) {
      throw const FormatException('Invalid release policy envelope');
    }
    final raw = payload['release'];
    if (raw != null) {
      AndroidReleasePolicy.fromJson(Map<String, dynamic>.from(raw as Map));
    }
    final envelope = {
      ...payload,
      'receivedAt': _now().toUtc().toIso8601String(),
    };
    _memoryPolicy = envelope;
    _requiredRoles = {};
    try {
      await _storage.setString(_policyKey, jsonEncode(envelope));
      await _storage.remove(_requiredRolesKey);
    } catch (error) {
      _logger.info('Android policy stays active in memory: $error');
    }
    // A fresh trusted server response may cancel a previous bad release.
    // Offline clock changes cannot erase an already known requirement.
  }

  Future<AppUpdateStatus?> _checkReleasePolicy(String? role, bool force) async {
    if (_fetchRelease == null || _currentBuild < 1) return null;
    final now = _now();
    final last = DateTime.tryParse(_storage.getString(_policyCheckKey) ?? '');
    if (force || last == null || now.difference(last) >= _policyInterval) {
      await _remember(_policyCheckKey, now.toIso8601String());
      try {
        await _savePolicy(await _fetchRelease());
      } catch (error) {
        _logger.info('Android update policy uses its saved copy: $error');
      }
    }
    final saved = _storage.getString(_policyKey);
    if (saved == null && _memoryPolicy == null) return null;
    try {
      final payload = _memoryPolicy ?? jsonDecode(saved!) as Map<String, dynamic>;
      final raw = payload['release'];
      if (raw == null) {
        _release = null;
        return AppUpdateStatus.none;
      }
      _release = AndroidReleasePolicy.fromJson(
        Map<String, dynamic>.from(raw as Map),
      );
      final receivedAt = DateTime.tryParse(
        payload['receivedAt'] as String? ?? '',
      );
      final serverTime = DateTime.tryParse(
        payload['serverTime'] as String? ?? '',
      );
      final effectiveNow = receivedAt != null && serverTime != null
          ? now.add(serverTime.difference(receivedAt))
          : now;
      if (_requiredRoles == null) {
        try {
          _requiredRoles = Map<String, dynamic>.from(jsonDecode(_storage.getString(_requiredRolesKey) ?? '{}') as Map);
        } catch (_) { _requiredRoles = {}; }
      }
      final required = _requiredRoles!;
      final roleKey = AndroidReleasePolicy.roleNames.contains(role)
          ? role!
          : 'anonymous';
      if (required[roleKey] is int &&
          _currentBuild < (required[roleKey] as int)) {
        return AppUpdateStatus.mandatory;
      }
      final status = _release!.statusFor(role, _currentBuild, effectiveNow);
      if (status == ReleaseUpdateStatus.mandatory) {
        required[roleKey] = roleKey == 'anonymous'
            ? _release!.roles.values
                  .map((value) => value.minimumBuild)
                  .reduce((a, b) => a < b ? a : b)
            : _release!.roles[roleKey]!.minimumBuild;
        await _remember(_requiredRolesKey, jsonEncode(required));
      }
      return switch (status) {
        ReleaseUpdateStatus.none => AppUpdateStatus.none,
        ReleaseUpdateStatus.optional => AppUpdateStatus.optional,
        ReleaseUpdateStatus.mandatory => AppUpdateStatus.mandatory,
      };
    } catch (error) {
      _logger.info('Invalid saved Android update policy: $error');
      return null;
    }
  }

  DateTime? _lastCheck() {
    final raw = _storage.getString(_lastCheckKey);
    return raw == null ? null : DateTime.tryParse(raw);
  }

  bool get _dueForCheck {
    final last = _lastCheck();
    return last == null || _now().difference(last) >= _checkInterval;
  }

  /// The whole flow from the requirement's diagram. Never throws.
  ///
  ///   < 24h since last check           -> cached mandatory or none (no fetch)
  ///   >= 24h -> fetch, then:
  ///     current < min_version          -> mandatory
  ///     current < latest_version       -> optional
  ///     otherwise                      -> none
  Future<AppUpdateStatus> checkForUpdate({
    String? role,
    bool force = false,
  }) async {
    try {
      final policyStatus = await _checkReleasePolicy(role, force);
      if (policyStatus != null) return policyStatus;
      if (_fetchRelease != null) return AppUpdateStatus.none;
      if (!_dueForCheck) return _cachedMandatoryUpdate();

      // Record the attempt up front, so a fetch that fails (offline, plugin
      // error) still counts as "checked" and we don't retry every launch -
      // "at most once every 24 hours" applies to failures too.
      await _storage.setString(_lastCheckKey, _now().toIso8601String());

      await _remoteConfig.refresh();
      return _evaluate();
    } catch (e) {
      _logger.info('AppUpdateService.checkForUpdate skipped: $e');
      if (_fetchRelease != null) return AppUpdateStatus.none;
      return _cachedMandatoryUpdate();
    }
  }

  // Closing and reopening the app must not bypass a minimum supported
  // version we already know about. Optional prompts still respect the daily
  // interval. Reading cached values never needs another network request.
  AppUpdateStatus _cachedMandatoryUpdate() {
    try {
      return AppVersion.isLessThan(_currentVersion, _remoteConfig.minVersion)
          ? AppUpdateStatus.mandatory
          : AppUpdateStatus.none;
    } catch (_) {
      return AppUpdateStatus.none;
    }
  }

  AppUpdateStatus _evaluate() {
    // Can't read our own version -> can't compare -> show nothing.
    if (AppVersion.parse(_currentVersion) == null) return AppUpdateStatus.none;

    final minVersion = _remoteConfig.minVersion;
    if (AppVersion.isLessThan(_currentVersion, minVersion)) {
      return AppUpdateStatus.mandatory;
    }
    final latestVersion = _remoteConfig.latestVersion;
    if (AppVersion.isLessThan(_currentVersion, latestVersion)) {
      return AppUpdateStatus.optional;
    }
    return AppUpdateStatus.none;
  }

  /// Opens the store page from `update_url`. Returns false (never throws) when
  /// the url is missing/invalid or the launch fails - the dialog then shows a
  /// localized retry message and stays open.
  Future<bool> openUpdateUrl({void Function(int, int)? onProgress}) async {
    try {
      if (_release != null) {
        lastInstallResult = await _apkInstaller.install(
          _release!,
          onProgress: onProgress,
        );
        return lastInstallResult == ApkInstallResult.started;
      }
      final raw = _remoteConfig.updateUrl.trim();
      if (raw.isEmpty) return false;
      final uri = Uri.tryParse(raw);
      if (uri == null || !uri.hasScheme || !uri.hasAuthority) return false;
      return await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (e) {
      _logger.info('AppUpdateService.openUpdateUrl failed: $e');
      return false;
    }
  }
}
