import 'dart:async';
import 'package:flutter/material.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/utils/number_input.dart';
import 'package:feniq/core/widgets/custom_card.dart';

typedef DeliveryRescheduler =
    Future<void> Function(String expectedBusiness, String reason, int revision);

class DeliveryEstimateCard extends StatefulWidget {
  const DeliveryEstimateCard({
    super.key,
    this.estimate,
    this.status,
    this.preview = false,
    this.onReschedule,
  });
  final Map<String, dynamic>? estimate;
  final String? status;
  final bool preview;
  final DeliveryRescheduler? onReschedule;
  @override
  State<DeliveryEstimateCard> createState() => _DeliveryEstimateCardState();
}

class _DeliveryEstimateCardState extends State<DeliveryEstimateCard> {
  Timer? _timer;
  final Stopwatch _elapsed = Stopwatch();
  DateTime? _observed;
  bool _editing = false, _busy = false;
  String? _error;
  final _form = GlobalKey<FormState>();
  final _dateTime = TextEditingController(), _reason = TextEditingController();
  @override
  void initState() {
    super.initState();
    _reset();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) {
        setState(() {});
      }
    });
  }

  void _reset() {
    _observed = DateTime.tryParse('${widget.estimate?['observedAt']}');
    _elapsed.reset();
    _elapsed.start();
  }

  @override
  void didUpdateWidget(covariant DeliveryEstimateCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.estimate != widget.estimate) {
      _reset();
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _elapsed.stop();
    _dateTime.dispose();
    _reason.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_busy || !_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.onReschedule!(
        westernDigits(_dateTime.text.trim()),
        _reason.text.trim(),
        (widget.estimate?['revision'] as num?)?.toInt() ?? 0,
      );
      if (mounted) {
        setState(() => _editing = false);
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = context.l10n.deliveryInvalid);
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final e = widget.estimate;
    if (e == null) return const SizedBox.shrink();
    final l = context.l10n;
    final terminal = ['delivered', 'cancelled'].contains(widget.status);
    final end = DateTime.tryParse('${e['to']}');
    final remaining = end != null && _observed != null
        ? end.difference(_observed!.add(_elapsed.elapsed))
        : null;
    final late =
        !terminal &&
        (e['state'] == 'late' || (remaining != null && remaining.isNegative));
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: CustomCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              l.deliveryArrivalTitle,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            if (e['unavailable'] == true)
              Text(l.deliveryUnavailable)
            else ...[
              if (e['zoneName'] != null) Text('${e['zoneName']}'),
              const SizedBox(height: 8),
              Text(l.deliveryRange),
              Text(
                '${e['fromBusiness']}\n— ${e['toBusiness']}',
                textDirection: TextDirection.ltr,
              ),
              Text(
                l.localeName == 'ar'
                    ? 'توقيت دمشق · هامش \u2066±12\u2069 ساعة'
                    : 'Damascus time · ±12 hours',
              ),
              if (widget.preview) Text(l.deliveryPreview),
              if (terminal)
                Text(
                  widget.status == 'delivered'
                      ? l.deliveryDelivered
                      : l.deliveryCancelled,
                )
              else if (late)
                Text(
                  l.deliveryLate,
                  style: TextStyle(
                    color: Theme.of(context).brightness == Brightness.dark
                        ? const Color(0xFFFFB471)
                        : const Color(0xFF9B3B0B),
                  ),
                )
              else if (remaining != null) ...[
                Text(l.deliveryUntil),
                Text(
                  l.deliveryHoursMinutes(
                    '\u2066${remaining.inHours}\u2069',
                    '\u2066${remaining.inMinutes % 60}\u2069',
                  ),
                ),
              ],
              if (e['reason'] != null)
                Text('${l.deliveryChanged}: ${e['reason']}'),
              if ((e['history'] as List?)?.isNotEmpty == true)
                ExpansionTile(
                  title: Text(l.deliveryChanged),
                  tilePadding: EdgeInsets.zero,
                  children: [
                    for (final row in e['history'] as List)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Text(
                          '${row['fromBusiness']} — ${row['toBusiness']}\n${row['reason'] ?? ''}',
                        ),
                      ),
                  ],
                ),
              if (widget.onReschedule != null && !terminal)
                TextButton(
                  onPressed: _busy
                      ? null
                      : () {
                          setState(() {
                            _editing = !_editing;
                            _dateTime.text = '${e['expectedBusiness'] ?? ''}';
                          });
                        },
                  child: Text(l.deliveryReschedule),
                ),
              if (_editing && !terminal)
                Form(
                  key: _form,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      TextFormField(
                        controller: _dateTime,
                        enabled: !_busy,
                        textDirection: TextDirection.ltr,
                        keyboardType: TextInputType.datetime,
                        inputFormatters: [const WesternDigitsFormatter()],
                        decoration: InputDecoration(
                          labelText: l.deliveryNewTime,
                          helperText: 'YYYY-MM-DD HH:mm',
                        ),
                        validator: (value) =>
                            RegExp(
                              r'^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$',
                            ).hasMatch(value?.trim() ?? '')
                            ? null
                            : l.deliveryInvalid,
                      ),
                      TextFormField(
                        controller: _reason,
                        enabled: !_busy,
                        maxLength: 300,
                        decoration: InputDecoration(
                          labelText: l.deliveryReason,
                        ),
                        validator: (value) => value?.trim().isNotEmpty == true
                            ? null
                            : l.deliveryInvalid,
                      ),
                      if (_error != null) Text(_error!),
                      FilledButton(
                        onPressed: _busy ? null : _save,
                        child: Text(_busy ? l.loading : l.deliverySave),
                      ),
                    ],
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}
