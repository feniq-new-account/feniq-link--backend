import 'package:flutter/material.dart';
import 'package:feniq/features/driver/data/driver_trip_repository.dart';

/// Operational delivery checklist. No accounting or payment actions.
class DriverTripsTab extends StatefulWidget {
  const DriverTripsTab({super.key, required this.repository});
  final DriverTripRepository repository;
  @override
  State<DriverTripsTab> createState() => _DriverTripsTabState();
}

class _DriverTripsTabState extends State<DriverTripsTab> {
  List<DriverTrip> _trips = const [];
  bool _loading = true;
  String? _error;
  String? _busyId;

  bool get _ar => Localizations.localeOf(context).languageCode == 'ar';
  String _t(String ar, String en) => _ar ? ar : en;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    if (!_loading && mounted) setState(() => _loading = true);
    try {
      final trips = await widget.repository.listTrips();
      if (!mounted) return;
      setState(() {
        _trips = trips;
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
    await _run(trip, () => widget.repository.updateStop(
      trip.id, stop.id, trip.revision, status: status, note: note,
    ));
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
      onRefresh: _reload,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(_t('رحلاتي', 'My delivery trips'),
            style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          Text(_t('تظهر فقط الرحلات المسندة لحسابك. كل تعديل يحتاج اتصالاً بالخادم.',
            'Only your assigned trips are shown. Changes require a server connection.')),
          const SizedBox(height: 16),
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
                            onPressed: _busyId == null ? () => _mark(trip, stop, 'delivered') : null,
                          ),
                          IconButton(
                            tooltip: _t('تعذر التسليم', 'Delivery failed'),
                            icon: const Icon(Icons.report_problem_outlined),
                            onPressed: _busyId == null ? () => _mark(trip, stop, 'failed') : null,
                          ),
                        ])
                      : null,
                  ),
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
                      onPressed: _busyId == null
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
