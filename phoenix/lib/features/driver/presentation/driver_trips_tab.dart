import 'dart:async';
import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:feniq/features/rep/data/services/location_provider.dart';
import 'package:feniq/features/driver/data/driver_trip_repository.dart';
import 'package:feniq/features/driver/data/driver_position_stream.dart';
import 'package:feniq/features/driver/data/driver_stop_outbox.dart';
import 'package:feniq/features/driver/data/driver_trip_snapshot.dart';

/// Operational delivery checklist. No accounting or payment actions.
class DriverTripsTab extends StatefulWidget {
  const DriverTripsTab({super.key, required this.repository, this.locationProvider,
    this.stopOutbox, this.tripCache, this.positionStream});
  final DriverTripRepository repository;
  final LocationProvider? locationProvider;
  final DriverStopOutbox? stopOutbox;
  final DriverTripSnapshotCache? tripCache;
  final DriverPositionStream? positionStream;
  @override
  State<DriverTripsTab> createState() => _DriverTripsTabState();
}

class _DriverTripsTabState extends State<DriverTripsTab> with WidgetsBindingObserver {
  List<DriverTrip> _trips = const [];
  bool _loading = true;
  String? _error;
  String? _busyId;
  String? _trackingTripId;
  String? _gpsError;
  DateTime? _lastGpsSend;
  Timer? _trackingTimer;
  StreamSubscription<DeviceLocation>? _positionSubscription;
  int _trackingGeneration = 0;
  bool _streamEstablished = false;
  bool _sendingLocation = false;
  bool _syncingStops = false;
  bool _outboxLoaded = false;
  List<PendingDriverStop> _pendingStops = const [];
  String? _outboxError;
  bool _showingSavedTrips = false;
  DateTime? _tripSnapshotAt;
  String? _tripCacheError;

  bool get _ar => Localizations.localeOf(context).languageCode == 'ar';
  String _t(String ar, String en) => _ar ? ar : en;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _reload();
    unawaited(_restoreOutbox());
  }

  @override
  void didUpdateWidget(covariant DriverTripsTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(oldWidget.tripCache, widget.tripCache)) {
      // Never keep a GPS foreground service across account/owner changes.
      _stopTracking(notify: false);
      _gpsError = null;
      _trips = const [];
      _showingSavedTrips = false;
      _tripSnapshotAt = null;
      _tripCacheError = null;
      unawaited(_reload());
    }
    if (!identical(oldWidget.stopOutbox, widget.stopOutbox)) {
      // A different owner or router instance must reload its own encrypted
      // commands; never reuse another account's previous pending UI state.
      _pendingStops = const [];
      _outboxLoaded = false;
      _syncingStops = false;
      _outboxError = null;
      unawaited(_restoreOutbox());
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) {
      // A foreground location service with a persistent OS notification may
      // continue through pause/screen lock. A normal timer may not.
      // Do not START a new FGS after the app moves into the background.
      if (widget.positionStream == null || !_streamEstablished) _stopTracking();
    } else {
      unawaited(_syncOutbox());
    }
  }

  @override
  void dispose() {
    _stopTracking(notify: false);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  void _stopTracking({bool notify = true}) {
    ++_trackingGeneration;
    _trackingTimer?.cancel();
    _trackingTimer = null;
    final subscription = _positionSubscription;
    _positionSubscription = null;
    _streamEstablished = false;
    if (subscription != null) unawaited(subscription.cancel());
    if (notify && mounted && _trackingTripId != null) {
      setState(() => _trackingTripId = null);
    } else {
      _trackingTripId = null;
    }
  }

  Future<void> _sendStreamFix(String tripId, DeviceLocation fix) async {
    if (_sendingLocation || _trackingTripId != tripId) return;
    // The server permits one update per 15 seconds. Throttle rapid
    // platform callbacks locally to avoid network floods.
    final now = DateTime.now();
    if (_lastGpsSend != null &&
        now.difference(_lastGpsSend!) < const Duration(seconds: 25)) return;
    if (fix.isMocked || fix.accuracy < 0 || fix.accuracy > 150 ||
        fix.capturedAt == null ||
        now.difference(fix.capturedAt!).abs() > const Duration(minutes: 2)) {
      if (mounted && _trackingTripId == tripId) {
        setState(() => _gpsError = _t(
          'قراءة الموقع غير دقيقة أو قديمة؛ لم تُرسل إلى الإدارة.',
          'Unreliable, mocked or stale GPS position was not shared.',
        ));
      }
      return;
    }
    _sendingLocation = true;
    try {
      await widget.repository.sendLocation(tripId, fix);
      if (!mounted || _trackingTripId != tripId) return;
      setState(() {
        _lastGpsSend = DateTime.now();
        _gpsError = null;
      });
    } catch (error) {
      if (mounted && _trackingTripId == tripId) {
        final statusCode = error is DioException ? error.response?.statusCode : null;
        if ([401, 403, 404, 409].contains(statusCode)) {
          // The trip may have been completed remotely or reassigned. Stop
          // collecting rather than continuing an unauthorized GPS stream.
          _stopTracking();
          setState(() => _gpsError = _t(
            'انتهت صلاحية مشاركة هذه الرحلة؛ توقف تتبع الموقع.',
            'Trip sharing is no longer authorized; location tracking stopped.',
          ));
        } else {
          setState(() => _gpsError = _t(
            'فشل إرسال الموقع. سيُجرّب مجدداً عند توفر إشارة GPS والإنترنت.',
            'GPS upload failed. It will retry when GPS and connectivity permit.',
          ));
        }
      }
    } finally {
      _sendingLocation = false;
    }
  }

  Future<void> _beginBackgroundCapableTracking(String tripId, int generation) async {
    final source = widget.positionStream;
    if (source == null) return;
    try {
      final stream = await source.start();
      if (!mounted || generation != _trackingGeneration || _trackingTripId != tripId) {
        return; // User stopped while permissions were being requested.
      }
      // Subscribing starts Android's notification-backed foreground service.
      _positionSubscription = stream.listen(
        (fix) { unawaited(_sendStreamFix(tripId, fix)); },
        onError: (Object error) {
          if (mounted && _trackingTripId == tripId) {
            _stopTracking();
            setState(() => _gpsError = _t(
              'انقطع التتبع. افتح التطبيق وأعد تفعيل مشاركة الموقع.',
              'Tracking stopped. Reopen the app and enable sharing again.',
            ));
          }
        },
        cancelOnError: true,
      );
      _streamEstablished = true;
    } catch (_) {
      if (mounted && generation == _trackingGeneration && _trackingTripId == tripId) {
        _stopTracking();
        setState(() => _gpsError = _t(
          'تعذر بدء مشاركة الموقع مع الإشعار المستمر. تحقق من الأذونات والموقع.',
          'Could not start notification-backed location sharing. Check permissions and GPS.',
        ));
      }
    }
  }

  Future<void> _capturePosition(String tripId) async {
    if (_sendingLocation || _trackingTripId != tripId || widget.locationProvider == null) return;
    _sendingLocation = true;
    try {
      final fix = await widget.locationProvider!.current();
      if (fix.isMocked) throw StateError('Mock GPS location refused.');
      if (_trackingTripId != tripId) return;
      await widget.repository.sendLocation(tripId, fix);
      if (!mounted || _trackingTripId != tripId) return;
      setState(() {
        _gpsError = null;
        _lastGpsSend = DateTime.now();
      });
    } catch (_) {
      if (mounted && _trackingTripId == tripId) {
        setState(() => _gpsError = _t(
          'لم تصل قراءة الموقع إلى الإدارة. تأكد من GPS والإنترنت.',
          'Location could not be shared. Check GPS and network.',
        ));
      }
    } finally {
      _sendingLocation = false;
    }
  }

  void _startTracking(String tripId) {
    if (widget.locationProvider == null && widget.positionStream == null) return;
    _stopTracking();
    setState(() {
      _trackingTripId = tripId;
      _gpsError = null;
      _lastGpsSend = null;
    });
    if (widget.positionStream != null) {
      unawaited(_beginBackgroundCapableTracking(tripId, _trackingGeneration));
    } else {
      // Compatibility path for older embedded clients and existing tests.
      unawaited(_capturePosition(tripId));
      _trackingTimer = Timer.periodic(const Duration(seconds: 30), (_) {
        unawaited(_capturePosition(tripId));
      });
    }
  }

  Future<void> _restoreOutbox() async {
    final outbox = widget.stopOutbox;
    if (outbox == null) return;
    try {
      await outbox.restore();
      if (!mounted || !identical(widget.stopOutbox, outbox)) return;
      setState(() {
        _pendingStops = outbox.pending;
        _outboxLoaded = true;
        _outboxError = null;
      });
      if (_pendingStops.isNotEmpty) await _syncOutbox();
    } catch (_) {
      if (mounted && identical(widget.stopOutbox, outbox)) setState(() => _outboxError = _t(
        'تعذّر قراءة أوامر التسليم المحفوظة. لن نستبدلها أو نمسحها.',
        'Saved delivery queue cannot be read; it has not been overwritten.',
      ));
    }
  }

  Future<void> _syncOutbox() async {
    final outbox = widget.stopOutbox;
    if (outbox == null || !_outboxLoaded || _syncingStops || _pendingStops.isEmpty) return;
    setState(() => _syncingStops = true);
    try {
      final result = await outbox.flush();
      if (!mounted || !identical(widget.stopOutbox, outbox)) return;
      setState(() {
        _pendingStops = outbox.pending;
        _outboxError = result.failure == null ? null : _t(
          'في تسليم محفوظ لم يتأكد من الخادم. أعد المزامنة عند عودة الإنترنت؛ إذا استمر الرفض راجع حالة الرحلة مع الإدارة.',
          'A saved stop has not been acknowledged. Retry when online; contact operations if the server rejects it.',
        );
      });
      if (result.confirmed > 0) await _reload();
    } catch (_) {
      if (mounted && identical(widget.stopOutbox, outbox)) setState(() => _outboxError = _t(
        'تعذّر حفظ نتيجة المزامنة بأمان. بقي أمر التسليم محفوظاً.',
        'Could not safely persist the sync result; the stop command remains queued.',
      ));
    } finally {
      if (mounted && identical(widget.stopOutbox, outbox)) setState(() => _syncingStops = false);
    }
  }

  Future<void> _discardOldestAfterReview() async {
    final outbox = widget.stopOutbox;
    if (outbox == null || _syncingStops || _pendingStops.isEmpty) return;
    final confirm = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(_t('مراجعة تسليم غير متزامن', 'Review unsynced delivery')),
        content: Text(_t(
          'لا تحذف الأمر إلا بعد التأكد من حالة التسليم على الخادم مع الإدارة. قد يكون التسليم قد سُجّل بالفعل ولم يصل الرد.',
          'Only remove this pending action after verifying the server delivery state with operations. It may already have been recorded despite the lost reply.',
        )),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(_t('إبقاء الأمر', 'Keep pending'))),
          TextButton(onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(_t('حذف الأمر بعد التحقق', 'Discard after verification'))),
        ],
      ),
    );
    if (!mounted || confirm != true) return;
    try {
      await outbox.discardFirst();
      if (mounted) setState(() {
        _pendingStops = outbox.pending;
        _outboxError = null;
      });
      await _reload();
    } catch (_) {
      if (mounted) setState(() => _outboxError = _t(
        'تعذّر حذف الأمر من التخزين المشفّر؛ بقي محفوظاً.',
        'Could not remove the encrypted pending command; it was preserved.',
      ));
    }
  }

  Future<void> _refreshAndSync() async {
    await _syncOutbox();
    await _reload();
  }

  bool _isTransportFailure(Object error) =>
    error is DioException && [
      DioExceptionType.connectionError,
      DioExceptionType.connectionTimeout,
      DioExceptionType.sendTimeout,
      DioExceptionType.receiveTimeout,
    ].contains(error.type);

  Future<void> _reload() async {
    if (!_loading && mounted) setState(() => _loading = true);
    final cache = widget.tripCache;
    try {
      final trips = await widget.repository.listTrips();
      String? cacheError;
      if (cache != null) {
        try {
          await cache.save(trips);
        } catch (_) {
          cacheError = _t('لم يتم حفظ الرحلات للاستخدام دون إنترنت.',
            'Could not save trips for offline use.');
        }
      }
      if (!mounted || !identical(cache, widget.tripCache)) return;
      setState(() {
        _trips = trips;
        if (_trackingTripId != null && !trips.any((trip) =>
          trip.id == _trackingTripId && trip.status == 'in_progress')) {
          _stopTracking();
        }
        _loading = false;
        _showingSavedTrips = false;
        _tripSnapshotAt = null;
        _tripCacheError = cacheError;
        _error = null;
      });
    } catch (error) {
      if (!mounted || !identical(cache, widget.tripCache)) return;
      // Never display cache following 401, 403 or a malformed API response.
      // A transport-layer failure alone is evidence of an offline situation.
      if (cache != null && _isTransportFailure(error)) {
        try {
          final snapshot = await cache.read();
          if (!mounted || !identical(cache, widget.tripCache)) return;
          if (snapshot != null) {
            setState(() {
              _trips = snapshot.trips;
              _showingSavedTrips = true;
              _tripSnapshotAt = snapshot.savedAt;
              _tripCacheError = null;
              _loading = false;
              _error = null;
            });
            return;
          }
        } catch (_) {
          // Corrupted or unavailable secure storage must fail closed.
        }
      }
      setState(() {
        _loading = false;
        _showingSavedTrips = false;
        _tripSnapshotAt = null;
        _trips = const [];
        _error = _t('تعذر تحميل الرحلات. تأكد من الاتصال.',
            'Could not load trips. Check the connection.');
      });
    }
  }

  Future<void> _run(DriverTrip trip, Future<DriverTrip> Function() work) async {
    if (_busyId != null) return;
    setState(() { _busyId = trip.id; _error = null; });
    try {
      final updated = await work();
      if (!mounted) return;
      if (_trackingTripId == updated.id && updated.status != 'in_progress') {
        _stopTracking();
      }
      setState(() {
        _trips = updated.status == 'completed' || updated.status == 'cancelled'
          ? _trips.where((x) => x.id != updated.id).toList()
          : _trips.map((x) => x.id == updated.id ? updated : x).toList();
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = _t('لم يُحفظ التعديل. جارٍ تحميل آخر حالة من الخادم.',
          'Update failed. Reloading the latest state.');
      });
      // Do not retry a mutation with a stale revision or uncertain result.
      try {
        final trips = await widget.repository.listTrips();
        if (mounted) setState(() => _trips = trips);
      } catch (_) { /* Keep the visible error for a manual retry. */ }
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _mark(DriverTrip trip, DriverTripStop stop, String status) async {
    String note = '';
    if (status == 'failed') {
      final controller = TextEditingController();
      final entered = await showDialog<String>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(_t('سبب عدم التسليم', 'Reason for failed delivery')),
          content: TextField(
            controller: controller,
            maxLength: 500,
            autofocus: true,
            decoration: InputDecoration(hintText: _t('اكتب السبب', 'Enter a reason')),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx),
              child: Text(_t('إلغاء', 'Cancel'))),
            FilledButton(onPressed: () => Navigator.pop(ctx, controller.text.trim()),
              child: Text(_t('حفظ', 'Save'))),
          ],
        ),
      );
      controller.dispose();
      if (!mounted || entered == null || entered.isEmpty) return;
      note = entered;
    }
    final outbox = widget.stopOutbox;
    if (outbox == null) {
      await _run(trip, () => widget.repository.updateStop(
        trip.id, stop.id, trip.revision, status: status, note: note,
      ));
      return;
    }
    if (!_outboxLoaded || _pendingStops.any((item) => item.tripId == trip.id)) {
      setState(() => _outboxError = _t(
        'زامن تسليم هذه الرحلة المحفوظ أولاً، قبل تسجيل تسليم جديد.',
        'Synchronize the previously saved stop for this trip first.',
      ));
      return;
    }
    if (_busyId != null) return;
    setState(() { _busyId = trip.id; _outboxError = null; });
    try {
      // This happens BEFORE HTTP: if the connection drops after server commit
      // the original idempotency key and revision survive an app restart.
      await outbox.enqueue(tripId: trip.id, stopId: stop.id,
        revision: trip.revision, status: status, note: note);
      if (!mounted) return;
      setState(() => _pendingStops = outbox.pending);
      await _syncOutbox();
    } catch (_) {
      if (mounted) setState(() => _outboxError = _t(
        'تعذّر حفظ أمر التسليم بأمان، ولم نرسله.',
        'Could not safely save the delivery decision; nothing was sent.',
      ));
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  String _status(String value) => switch (value) {
    'planned' => _t('مخططة', 'Planned'),
    'in_progress' => _t('جارية', 'In progress'),
    'delivered' => _t('تم التسليم', 'Delivered'),
    'failed' => _t('لم يتم التسليم', 'Failed'),
    _ => value,
  };

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _refreshAndSync,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(_t('رحلاتي', 'My delivery trips'),
            style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          Text(_t('تظهر فقط الرحلات المسندة لحسابك. كل تعديل يحتاج اتصالاً بالخادم.',
            'Only your assigned trips are shown. Changes require a server connection.')),
          const SizedBox(height: 16),
          if (_showingSavedTrips) ...[
            Text(_t(
              '⚠️ هذه نسخة محفوظة من الرحلات، وليست حالة مباشرة من السيرفر. قد تكون تغيرت.',
              '⚠️ Saved trip snapshot, not live server state. Assignments may have changed.',
            ), style: TextStyle(color: Theme.of(context).colorScheme.error)),
            if (_tripSnapshotAt != null)
              Text(_t('آخر مزامنة: ', 'Last sync: ') +
                _tripSnapshotAt!.toLocal().toIso8601String().substring(0, 19)),
          ],
          if (_tripCacheError != null)
            Text(_tripCacheError!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          if (_gpsError != null)
            Semantics(liveRegion: true, child: Text(_gpsError!,
              style: TextStyle(color: Theme.of(context).colorScheme.error))),
          if (_pendingStops.isNotEmpty || _outboxError != null) ...[
            Semantics(
              liveRegion: true,
              child: Text(_t(
                'تسليمات بانتظار المزامنة: ', 'Saved stops awaiting sync: ',
              ) + _pendingStops.length.toString()),
            ),
            if (_outboxError != null)
              Text(_outboxError!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            if (_pendingStops.isNotEmpty)
              TextButton.icon(
                onPressed: _syncingStops ? null : _syncOutbox,
                icon: const Icon(Icons.sync),
                label: Text(_t('إعادة مزامنة التسليمات', 'Retry saved deliveries')),
              ),
            if (_pendingStops.isNotEmpty)
              TextButton(
                onPressed: _syncingStops ? null : _discardOldestAfterReview,
                child: Text(_t('حذف أقدم تسليم بعد التحقق من الإدارة',
                  'Discard oldest after verifying with operations')),
              ),
            Text(_t('لا ترسل نفس التسليم من جديد قبل التأكد من نتيجته.',
              'Do not record a saved stop again until its outcome is confirmed.')),
          ],
          if (_syncingStops) const LinearProgressIndicator(),
          if (_error != null) ...[
            Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            TextButton.icon(onPressed: _reload, icon: const Icon(Icons.refresh),
              label: Text(_t('إعادة المحاولة', 'Retry'))),
          ],
          if (_loading) const Center(child: CircularProgressIndicator()),
          if (!_loading && _trips.isEmpty)
            Text(_t('ما عندك رحلات مسندة حاليًا.', 'No assigned trips yet.')),
          for (final trip in _trips) Card(
            key: ValueKey('driver-trip-' + trip.id),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(trip.region, style: Theme.of(context).textTheme.titleMedium),
                  Text(trip.serviceDate.toLocal().toIso8601String().split('T').first +
                    ' • ' + _status(trip.status)),
                  const SizedBox(height: 8),
                  for (final stop in trip.stops) ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(stop.pharmacyName),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(stop.address),
                        Text(_status(stop.status)),
                        if (stop.note.isNotEmpty) Text(stop.note),
                      ],
                    ),
                    isThreeLine: true,
                    trailing: stop.status == 'pending' && trip.status == 'in_progress'
                      ? Wrap(spacing: 4, children: [
                          IconButton(
                            tooltip: _t('تم التسليم', 'Delivered'),
                            icon: const Icon(Icons.check_circle_outline),
                            onPressed: _busyId == null && !_pendingStops.any((x) => x.tripId == trip.id)
                              ? () => _mark(trip, stop, 'delivered') : null,
                          ),
                          IconButton(
                            tooltip: _t('تعذر التسليم', 'Delivery failed'),
                            icon: const Icon(Icons.report_problem_outlined),
                            onPressed: _busyId == null && !_pendingStops.any((x) => x.tripId == trip.id)
                              ? () => _mark(trip, stop, 'failed') : null,
                          ),
                        ])
                      : null,
                  ),
                  if (trip.status == 'in_progress' &&
                      (widget.locationProvider != null || widget.positionStream != null)) ...[
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      icon: Icon(_trackingTripId == trip.id
                        ? Icons.location_off_outlined : Icons.my_location_outlined),
                      onPressed: () => _trackingTripId == trip.id
                        ? _stopTracking() : _startTracking(trip.id),
                      label: Text(_trackingTripId == trip.id
                        ? _t('إيقاف مشاركة الموقع', 'Stop sharing location')
                        : _t('مشاركة الموقع أثناء الرحلة', 'Share location during trip')),
                    ),
                    Text(widget.positionStream != null
                      ? _t(
                          'بعد تفعيل المشاركة يظهر إشعار دائم، ويستمر التتبع أثناء قفل الشاشة. إيقافه من هنا أو عند إنهاء الرحلة.',
                          'After opt-in, an ongoing notification keeps location sharing active while the screen is locked. Stop here or end the trip.',
                        )
                      : _t('التتبع شغّال فقط والتطبيق مفتوح. الخروج عن الطريق لا يوقفه.',
                          'Foreground only. Leaving the route does not stop tracking.'),
                      style: Theme.of(context).textTheme.bodySmall),
                    if (_trackingTripId == trip.id && _lastGpsSend != null)
                      Text(_t('آخر إرسال ناجح: ', 'Last sent: ') +
                        _lastGpsSend!.toLocal().toIso8601String().substring(11, 19)),
                  ],
                  if (trip.status == 'planned')
                    FilledButton.icon(
                      onPressed: _busyId == null
                        ? () => _run(trip, () => widget.repository.start(trip.id, trip.revision))
                        : null,
                      icon: const Icon(Icons.play_arrow),
                      label: Text(_t('بدء الرحلة', 'Start trip')),
                    ),
                  if (trip.status == 'in_progress' &&
                      trip.stops.every((s) => s.status != 'pending'))
                    FilledButton.icon(
                      onPressed: _busyId == null && !_pendingStops.any((x) => x.tripId == trip.id)
                        ? () => _run(trip, () => widget.repository.complete(trip.id, trip.revision))
                        : null,
                      icon: const Icon(Icons.flag_outlined),
                      label: Text(_t('إنهاء الرحلة', 'Complete trip')),
                    ),
                  if (_busyId == trip.id) const LinearProgressIndicator(),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
