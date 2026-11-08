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
    // Keep the server-driven ON/OFF state above the navigator, but render no
    // banner here: the pharmacist landing page has its own inline slot below
    // "Choose warehouse". This leaves the Android status bar and AppBars alone.
    final notice = _started && _notice?.enabled == true ? _notice : null;
    return PilotNoticeScope(notice: notice, child: widget.child);
  }
}

/// The last verified administrator notice, inherited without recreating the
/// router or resetting any page when its text / ON-OFF flag changes.
class PilotNoticeScope extends InheritedWidget {
  const PilotNoticeScope({super.key, required this.notice, required super.child});

  final PilotNotice? notice;

  static PilotNotice? of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<PilotNoticeScope>()?.notice;

  @override
  bool updateShouldNotify(PilotNoticeScope oldWidget) => 
      notice?.enabled != oldWidget.notice?.enabled ||
      notice?.textAr != oldWidget.notice?.textAr ||
      notice?.textEn != oldWidget.notice?.textEn;
}

/// Plain text only, in the existing announcement slot below the warehouse
/// screen header. No card, background, border, or fixed system-bar overlay.
/// Splitting on the em dash keeps both styled parts editable in one Admin field.
class PilotNoticeInline extends StatelessWidget {
  const PilotNoticeInline({super.key});

  @override
  Widget build(BuildContext context) {
    final notice = PilotNoticeScope.of(context);
    if (notice == null || !notice.enabled) {
      return const SizedBox.shrink();
    }

    final isArabic = Localizations.localeOf(context).languageCode == 'ar';
    final message = (isArabic ? notice.textAr : notice.textEn).trim();
    final separatorIndex = message.indexOf('—');
    final heading = separatorIndex >= 0
        ? message.substring(0, separatorIndex).trim()
        : message;
    final description = separatorIndex >= 0
        ? message.substring(separatorIndex + 1).trim()
        : '';

    return Padding(
      key: const ValueKey('persistentPilotNotice'),
      padding: const EdgeInsetsDirectional.fromSTEB(16, 14, 16, 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsetsDirectional.only(end: 8, top: 1),
            child: Icon(Icons.rocket_launch_outlined,
                size: 22, color: AppColors.primaryOf(context)),
          ),
          Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (heading.isNotEmpty)
                  Text(
                    heading,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: AppColors.primaryOf(context),
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                if (description.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    description,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: AppColors.textSecondaryOf(context),
                      height: 1.55,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
