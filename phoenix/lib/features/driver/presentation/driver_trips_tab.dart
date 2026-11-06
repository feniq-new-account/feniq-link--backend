import 'dart:async';
import 'package:flutter/material.dart';
import 'package:feniq/features/rep/data/services/location_provider.dart';
import 'package:feniq/features/driver/data/driver_trip_repository.dart';
import 'package:feniq/features/driver/data/driver_stop_outbox.dart';

/// Operational delivery checklist. No accounting or payment actions.
class DriverTripsTab extends StatefulWidget {
  const DriverTripsTab({super.key, required this.repository, this.locationProvider,
    this.stopOutbox});
  final DriverTripRepository repository;
  final LocationProvider? locationProvider;
  final DriverStopOutbox? stopOutbox;
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
  bool _sendingLocation = false;
  bool _syncingStops = false;
  bool _outboxLoaded = false;
  List<PendingDriverStop> _pendingStops = const [];
  String? _outboxError;

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
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) {
      _stopTracking();
    } else {
      unawaited(_syncOutbox());
    }
  }

  @override
  void dispose() {
    _stopTracking();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  void _stopTracking() {
    _trackingTimer?.cancel();
    _trackingTimer = null;
    if (mounted && _trackingTripId != null) {
      setState(() => _trackingTripId = null);
    } else {
      _trackingTripId = null;
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
    if (widget.locationProvider == null) return;
    _stopTracking();
    setState(() {
      _trackingTripId = tripId;
      _gpsError = null;
      _lastGpsSend = null;
    });
    unawaited(_capturePosition(tripId));
    _trackingTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      unawaited(_capturePosition(tripId));
    });
  }

  Future<void> _restoreOutbox() async {
    final outbox = widget.stopOutbox;
    if (outbox == null) return;
    try {
      await outbox.restore();
      if (!mounted) return;
      setState(() {
        _pendingStops = outbox.pending;
        _outboxLoaded = true;
        _outboxError = null;
      });
      if (_pendingStops.isNotEmpty) await _syncOutbox();
    } catch (_) {
      if (mounted) setState(() => _outboxError = _t(
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
      if (!mounted) return;
      setState(() {
        _pendingStops = outbox.pending;
        _outboxError = result.failure == null ? null : _t(
          'في تسليم محفوظ لم يتأكد من الخادم. أعد المزامنة عند عودة الإنترنت؛ إذا استمر الرفض راجع حالة الرحلة مع الإدارة.',
          'A saved stop has not been acknowledged. Retry when online; contact operations if the server rejects it.',
        );
      });
      if (result.confirmed > 0) await _reload();
    } catch (_) {
      if (mounted) setState(() => _outboxError = _t(
        'تعذّر حفظ نتيجة المزامنة بأمان. بقي أمر التسليم محفوظاً.',
        'Could not safely persist the sync result; the stop command remains queued.',
      ));
    } finally {
      if (mounted) setState(() => _syncingStops = false);
    }
  }

  Future<void> _refreshAndSync() async {
    await _syncOutbox();
    await _reload();
  }

  Future<void> _reload() async {
    if (!_loading && mounted) setState(() => _loading = true);
    try {
      final trips = await widget.repository.listTrips();
      if (!mounted) return;
      setState(() {
        _trips = trips;
        if (_trackingTripId != null && !trips.any((trip) =>
          trip.id == _trackingTripId && trip.status == 'in_progress')) {
          _stopTracking();
        }
        _loading = false;
        _error = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
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
                  if (trip.status == 'in_progress' && widget.locationProvider != null) ...[
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
                    Text(_t('التتبع شغّال فقط والتطبيق مفتوح. الخروج عن الطريق لا يوقفه.',
                      'Foreground only. Leaving the route does not stop tracking.'),
                      style: Theme.of(context).textTheme.bodySmall),
                    if (_trackingTripId == trip.id && _lastGpsSend != null)
                      Text(_t('آخر إرسال ناجح: ', 'Last sent: ') +
                        _lastGpsSend!.toLocal().toIso8601String().substring(11, 19)),
                    if (_trackingTripId == trip.id && _gpsError != null)
                      Text(_gpsError!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
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
