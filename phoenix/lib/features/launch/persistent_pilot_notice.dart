import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/config/app_config.dart';
import 'package:feniq/core/services/storage_service.dart';

/// A purely informational admin-controlled notice, independent of the
/// ordering gate. No checkout, account, receipt or warehouse data is changed.
class PilotNotice {
  const PilotNotice({
    required this.enabled,
    required this.textAr,
    required this.textEn,
  });

  final bool enabled;
  final String textAr;
  final String textEn;

  factory PilotNotice.fromJson(Map<String, dynamic> json) {
    final enabled = json['enabled'];
    final textAr = json['textAr'];
    final textEn = json['textEn'];
    if (enabled is! bool ||
        textAr is! String || textEn is! String ||
        textAr.trim().isEmpty || textEn.trim().isEmpty ||
        textAr.length > 240 || textEn.length > 240) {
      throw const FormatException('Invalid pilot notice response');
    }
    return PilotNotice(enabled: enabled, textAr: textAr, textEn: textEn);
  }

  Map<String, dynamic> toJson() =>
      {'enabled': enabled, 'textAr': textAr, 'textEn': textEn};
}

Future<PilotNotice> fetchPilotNotice() async {
  final dio = Dio(BaseOptions(
    baseUrl: AppConfig.apiBaseUrl,
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 10),
    headers: {'Cache-Control': 'no-store'},
  ));
  try {
    final response = await dio.get<Map<String, dynamic>>('/app/pilot-notice');
    return PilotNotice.fromJson(
      Map<String, dynamic>.from(response.data!['notice'] as Map),
    );
  } finally {
    dio.close();
  }
}

/// Persistent, compact strip above the navigator. The last valid server
/// setting is cached, including OFF, so the notice remains consistent if the
/// phone is offline on the next launch. Recheck on resume and periodically.
class PersistentPilotNoticeFrame extends StatefulWidget {
  const PersistentPilotNoticeFrame({
    super.key,
    required this.storageService,
    required this.child,
    this.load,
    this.refreshInterval = const Duration(minutes: 2),
    this.routeChanges,
    this.startWhen,
  });

  final StorageService storageService;
  final Widget child;
  final Future<PilotNotice> Function()? load;
  final Duration refreshInterval;
  /// The application router is observed without rebuilding the navigator.
  /// Do not run a network request over the initial brand splash animation.
  final Listenable? routeChanges;
  final bool Function()? startWhen;

  @override
  State<PersistentPilotNoticeFrame> createState() =>
      _PersistentPilotNoticeFrameState();
}

class _PersistentPilotNoticeFrameState extends State<PersistentPilotNoticeFrame>
    with WidgetsBindingObserver {
  static const _cacheKey = 'launch.persistent_pilot_notice';
  Timer? _timer;
  PilotNotice? _notice;
  bool _started = false;
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    try {
      final raw = widget.storageService.getString(_cacheKey);
      if (raw != null) {
        _notice = PilotNotice.fromJson(Map<String, dynamic>.from(jsonDecode(raw) as Map));
      }
    } catch (_) {
      // Invalid local data is unknown, not a presumed active notice.
    }
    WidgetsBinding.instance.addObserver(this);
    widget.routeChanges?.addListener(_activateIfReady);
    WidgetsBinding.instance.addPostFrameCallback((_) => _activateIfReady());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) return;
    if (_started) {
      _refresh();
    } else {
      _activateIfReady();
    }
  }

  void _activateIfReady() {
    if (!mounted || _started || !(widget.startWhen?.call() ?? true)) return;
    setState(() => _started = true);
    _timer = Timer.periodic(widget.refreshInterval, (_) => _refresh());
    _refresh();
  }

  @override
  void didUpdateWidget(covariant PersistentPilotNoticeFrame oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.routeChanges != widget.routeChanges) {
      oldWidget.routeChanges?.removeListener(_activateIfReady);
      widget.routeChanges?.addListener(_activateIfReady);
      _activateIfReady();
    }
  }

  Future<void> _refresh() async {
    if (!mounted || !_started) return;
    final request = ++_generation;
    try {
      final notice = await (widget.load ?? fetchPilotNotice)();
      if (!mounted || request != _generation) return;
      setState(() => _notice = notice);
      await widget.storageService.setString(_cacheKey, jsonEncode(notice.toJson()));
    } catch (_) {
      // Preserve only the last *valid* server response; never fabricate data.
    }
  }

  @override
  void dispose() {
    _generation++;
    _timer?.cancel();
    widget.routeChanges?.removeListener(_activateIfReady);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // The model is shared with the page without painting a global overlay.
    // The pharmacist announcement belongs below the warehouse page header
    // (the user's requested position), not inside the Android status bar.
    return _PilotNoticeScope(
      notice: _started ? _notice : null,
      child: widget.child,
    );
  }
}

class _PilotNoticeScope extends InheritedWidget {
  const _PilotNoticeScope({required this.notice, required super.child});

  final PilotNotice? notice;

  static PilotNotice? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<_PilotNoticeScope>()?.notice;

  @override
  bool updateShouldNotify(_PilotNoticeScope oldWidget) =>
      oldWidget.notice != notice;
}

/// An always-present notice in the pharmacist home content, exactly between
/// the home header and promotional banners; no background, border or overlay.
/// Its visibility and text remain controlled by the admin's saved settings.
class PersistentPilotInlineNotice extends StatelessWidget {
  const PersistentPilotInlineNotice({super.key});

  @override
  Widget build(BuildContext context) {
    final notice = _PilotNoticeScope.maybeOf(context);
    if (notice == null || !notice.enabled) return const SizedBox.shrink();

    final isArabic = Localizations.localeOf(context).languageCode == 'ar';
    final value = (isArabic ? notice.textAr : notice.textEn).trim();
    final parts = value.split('\\n');
    final heading = parts.first;
    final detail = parts.skip(1).join('\\n');
    final theme = Theme.of(context);
    // The original announcement used the brand orange heading and muted
    // explanatory copy, not a solid coloured banner.
    final headingColor = theme.colorScheme.primary;
    final detailColor = theme.colorScheme.onSurface.withValues(alpha: 0.76);
    return Semantics(
      key: const ValueKey('persistentPilotNotice'),
      label: value,
      container: true,
      explicitChildNodes: false,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              heading,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                height: 1.35,
                color: headingColor,
              ),
            ),
            if (detail.isNotEmpty) ...[
              const SizedBox(height: 5),
              Text(
                detail,
                textAlign: TextAlign.center,
                maxLines: 5,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  height: 1.45,
                  color: detailColor,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
