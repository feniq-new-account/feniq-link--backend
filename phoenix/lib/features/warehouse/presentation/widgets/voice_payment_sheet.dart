import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:speech_to_text/speech_to_text.dart';
import 'package:uuid/uuid.dart';
import 'package:feniq/core/constants/app_padding.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/utils/currency_formatter.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_management_models.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_accounts_cubit.dart';
import 'package:feniq/features/warehouse/presentation/utils/voice_payment_parser.dart';
import 'package:feniq/features/warehouse/presentation/utils/warehouse_order_labels.dart';

/// Turns speech into text. The real one is Android's own recognizer (free);
/// tests give a fake.
abstract class SpeechListener {
  /// Starts listening; [onText] gets what has been heard so far, [onEnd] is
  /// called when listening stops. False when voice isn't available.
  Future<bool> start({required void Function(String text) onText, required void Function() onEnd});

  Future<void> stop();
}

class DeviceSpeechListener implements SpeechListener {
  final SpeechToText _speech = SpeechToText();

  @override
  Future<bool> start({required void Function(String text) onText, required void Function() onEnd}) async {
    final ready = await _speech.initialize(
      onStatus: (status) {
        if (status == 'done' || status == 'notListening') onEnd();
      },
      onError: (_) => onEnd(),
    );
    if (!ready) return false;
    final locales = await _speech.locales();
    final arabic = locales.where((l) => l.localeId.toLowerCase().startsWith('ar')).toList();
    final syrian = arabic.where((l) => l.localeId.toLowerCase().replaceAll('-', '_') == 'ar_sy');
    final localeId = syrian.isNotEmpty ? syrian.first.localeId : (arabic.isNotEmpty ? arabic.first.localeId : null);
    await _speech.listen(
      onResult: (result) => onText(result.recognizedWords),
      listenOptions: SpeechListenOptions(
        partialResults: true,
        localeId: localeId,
        listenFor: const Duration(seconds: 30),
      ),
    );
    return true;
  }

  @override
  Future<void> stop() => _speech.stop();
}

/// Opens the voice sheet over the accounts: loads every account to match the
/// spoken name against, then records the confirmed payment.
Future<void> showVoicePaymentSheet(BuildContext context, {SpeechListener? listener}) async {
  final cubit = context.read<WarehouseAccountsCubit>();
  final messenger = ScaffoldMessenger.of(context);
  final l10n = context.l10n;
  final List<WarehouseAccountRow> accounts;
  try {
    accounts = await cubit.allAccounts();
  } catch (_) {
    return;
  }
  if (!context.mounted) return;
  final done = await showModalBottomSheet<({String name, double amount})>(
    context: context,
    isScrollControlled: true,
    builder: (_) => VoicePaymentSheet(
      accounts: accounts,
      listener: listener ?? DeviceSpeechListener(),
      onRecord: (pharmacyId, amount) =>
          cubit.recordPayment(pharmacyId: pharmacyId, amountSyp: amount, idempotencyKey: const Uuid().v4()),
    ),
  );
  if (done == null) return;
  messenger.showSnackBar(
    SnackBar(content: Text('${done.name}: ${l10n.warehouseAccountPayRecorded(formatSyp(done.amount, l10n.currencySuffix))}')),
  );
}

class VoicePaymentSheet extends StatefulWidget {
  const VoicePaymentSheet({super.key, required this.accounts, required this.listener, required this.onRecord});

  final List<WarehouseAccountRow> accounts;
  final SpeechListener listener;
  final Future<bool> Function(String pharmacyId, double amountSyp) onRecord;

  @override
  State<VoicePaymentSheet> createState() => _VoicePaymentSheetState();
}

class _VoicePaymentSheetState extends State<VoicePaymentSheet> {
  final TextEditingController _text = TextEditingController();
  bool _listening = false;
  bool _micMissing = false;
  bool _saving = false;
  bool _failed = false;
  String? _chosenId;

  @override
  void dispose() {
    unawaited(widget.listener.stop());
    _text.dispose();
    super.dispose();
  }

  Future<void> _toggleListening() async {
    if (_listening) {
      await widget.listener.stop();
      if (mounted) setState(() => _listening = false);
      return;
    }
    setState(() {
      _listening = true;
      _micMissing = false;
    });
    final ok = await widget.listener.start(
      onText: (heard) {
        if (!mounted) return;
        setState(() {
          _text.text = heard;
          _chosenId = null;
        });
      },
      onEnd: () {
        if (mounted) setState(() => _listening = false);
      },
    );
    if (!ok && mounted) {
      setState(() {
        _listening = false;
        _micMissing = true;
      });
    }
  }

  Future<void> _save(WarehouseAccountRow account, int paid) async {
    setState(() {
      _saving = true;
      _failed = false;
    });
    final saved = await widget.onRecord(account.pharmacyId, paid.toDouble());
    if (!mounted) return;
    if (saved) {
      Navigator.of(context).pop((name: warehouseLocalName(context, account.nameAr, account.nameEn), amount: paid.toDouble()));
    } else {
      setState(() {
        _saving = false;
        _failed = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final suffix = l10n.currencySuffix;
    final muted = context.textTheme.bodySmall;
    final parsed = parseVoicePayment(_text.text);
    final matches = matchPharmacies(parsed.name, [
      for (final a in widget.accounts) (id: a.pharmacyId, nameAr: a.nameAr, nameEn: a.nameEn),
    ]);
    // The best match is picked unless it is a weak one.
    final selectedId = _chosenId ?? (matches.isNotEmpty && matches.first.score >= 0.6 ? matches.first.id : null);
    final selected = selectedId == null ? null : widget.accounts.where((a) => a.pharmacyId == selectedId).firstOrNull;
    final payment = selected == null ? null : paymentFor(parsed, selected.balanceSyp);
    final hasText = _text.text.trim().isNotEmpty;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: AppPadding.screen,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(l10n.warehouseVoiceTitle, style: context.textTheme.titleMedium),
              const SizedBox(height: AppSizes.spacingSmall),
              Text(l10n.warehouseVoiceHint, style: muted),
              const SizedBox(height: AppSizes.spacingMedium),
              FilledButton.icon(
                onPressed: _toggleListening,
                icon: Icon(_listening ? Icons.stop : Icons.mic),
                label: Text(_listening ? l10n.warehouseVoiceStop : l10n.warehouseVoiceSpeak),
              ),
              if (_micMissing) ...[
                const SizedBox(height: AppSizes.spacingSmall),
                Text(l10n.warehouseVoiceNoMic, style: muted),
              ],
              const SizedBox(height: AppSizes.spacingMedium),
              TextField(
                controller: _text,
                onChanged: (_) => setState(() => _chosenId = null),
                decoration: InputDecoration(labelText: l10n.warehouseVoiceHeard),
              ),
              if (hasText && parsed.kind == 'unknown') ...[
                const SizedBox(height: AppSizes.spacingSmall),
                Text(l10n.warehouseVoiceNotUnderstood, style: muted?.copyWith(color: Theme.of(context).colorScheme.error)),
              ],
              if (parsed.kind != 'unknown') ...[
                const SizedBox(height: AppSizes.spacingSmall),
                if (matches.isEmpty)
                  Text(l10n.warehouseVoiceNoPharmacy, style: muted?.copyWith(color: Theme.of(context).colorScheme.error)),
                RadioGroup<String>(
                  groupValue: selectedId,
                  onChanged: (v) => setState(() => _chosenId = v),
                  child: Column(
                    children: [
                      for (final m in matches)
                        Builder(
                          builder: (_) {
                            final account = widget.accounts.firstWhere((a) => a.pharmacyId == m.id);
                            return RadioListTile<String>(
                              dense: true,
                              contentPadding: EdgeInsets.zero,
                              value: m.id,
                              title: Text(warehouseLocalName(context, account.nameAr, account.nameEn)),
                              subtitle: Text(l10n.warehouseVoiceOwes(formatSyp(account.balanceSyp, suffix))),
                            );
                          },
                        ),
                    ],
                  ),
                ),
                if (selected != null && payment != null) ...[
                  const SizedBox(height: AppSizes.spacingSmall),
                  Text(
                    l10n.warehouseVoiceWillRecord(formatSyp(payment.paid.toDouble(), suffix)),
                    style: context.textTheme.titleSmall,
                  ),
                  Text(l10n.warehouseVoiceLeftAfter(formatSyp(payment.left.toDouble(), suffix)), style: muted),
                ],
                if (selected != null && payment == null)
                  Text(l10n.warehouseVoiceCannotRecord, style: muted?.copyWith(color: Theme.of(context).colorScheme.error)),
              ],
              if (_failed) ...[
                const SizedBox(height: AppSizes.spacingSmall),
                Text(l10n.warehouseAccountPayFailed, style: muted?.copyWith(color: Theme.of(context).colorScheme.error)),
              ],
              const SizedBox(height: AppSizes.spacingMedium),
              FilledButton(
                onPressed: selected == null || payment == null || _saving ? null : () => _save(selected, payment.paid),
                child: Text(l10n.warehouseVoiceConfirm),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
