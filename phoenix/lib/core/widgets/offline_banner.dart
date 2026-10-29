import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/offline/offline_status.dart';

/// Flashes a small "no connection" notice over whatever screen is showing.
///
/// Used once, as the MaterialApp's `builder`. The notice appears when the app
/// falls back to the copy saved on the phone and goes away on its own after
/// [visibleFor] - it used to be a strip pinned above every screen, which a
/// slow first request (the server waking up) left on screen for good. It is
/// shown once per offline spell, not again on every fallback while still
/// offline.
///
/// The screen sits in one fixed place in a Stack, so the navigator (and every
/// page on it) is not rebuilt when the notice comes and goes.
class OfflineBannerFrame extends StatefulWidget {
  const OfflineBannerFrame({super.key, required this.child});

  static const visibleFor = Duration(seconds: 3);

  final Widget child;

  @override
  State<OfflineBannerFrame> createState() => _OfflineBannerFrameState();
}

class _OfflineBannerFrameState extends State<OfflineBannerFrame> {
  DateTime? _shownSavedAt;
  bool _wasOffline = false;
  Timer? _hideTimer;

  @override
  void initState() {
    super.initState();
    OfflineStatus.instance.cachedSince.addListener(_onStatusChanged);
    _onStatusChanged();
  }

  @override
  void dispose() {
    OfflineStatus.instance.cachedSince.removeListener(_onStatusChanged);
    _hideTimer?.cancel();
    super.dispose();
  }

  void _onStatusChanged() {
    final savedAt = OfflineStatus.instance.cachedSince.value;
    if (savedAt == null) {
      _wasOffline = false;
      _hide();
      return;
    }
    if (_wasOffline) return;
    _wasOffline = true;
    setState(() => _shownSavedAt = savedAt);
    _hideTimer?.cancel();
    _hideTimer = Timer(OfflineBannerFrame.visibleFor, _hide);
  }

  void _hide() {
    _hideTimer?.cancel();
    if (_shownSavedAt != null && mounted) setState(() => _shownSavedAt = null);
  }

  @override
  Widget build(BuildContext context) {
    final savedAt = _shownSavedAt;
    return Stack(
      children: [
        Positioned.fill(child: widget.child),
        if (savedAt != null)
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: OfflineToast(savedAt: savedAt, onTap: _hide),
          ),
      ],
    );
  }
}

/// "No connection - showing the copy saved on your phone from <time>."
class OfflineToast extends StatelessWidget {
  const OfflineToast({super.key, required this.savedAt, this.onTap});

  final DateTime savedAt;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final time = DateFormat('d/M HH:mm', 'en_US').format(savedAt.toLocal());
    return SafeArea(
      bottom: false,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Material(
            color: AppColors.warningOf(context),
            elevation: 4,
            borderRadius: BorderRadius.circular(20),
            child: InkWell(
              onTap: onTap,
              borderRadius: BorderRadius.circular(20),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.cloud_off_outlined, size: 16, color: Colors.black87),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        context.l10n.offlineToastMessage(time),
                        style: const TextStyle(fontSize: 12, color: Colors.black87),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
