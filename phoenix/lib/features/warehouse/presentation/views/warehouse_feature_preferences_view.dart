import 'package:flutter/material.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/core/error/error_translator.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_feature_preferences_repository.dart';
import 'package:feniq/generated/app_localizations.dart';

class WarehouseFeaturePreferencesView extends StatefulWidget {
  const WarehouseFeaturePreferencesView({
    super.key,
    required this.repository,
    required this.canConfigure,
  });
  final WarehouseFeaturePreferencesRepository repository;
  final bool canConfigure;
  @override
  State<WarehouseFeaturePreferencesView> createState() =>
      _WarehouseFeaturePreferencesViewState();
}

class _WarehouseFeaturePreferencesViewState
    extends State<WarehouseFeaturePreferencesView> {
  final _reason = TextEditingController();
  Map<String, dynamic>? _data;
  Map<String, bool> _preferences = {}, _effective = {};
  bool _loading = true, _saving = false, _saved = false;
  String? _error, _code;
  int _generation = 0;
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final generation = ++_generation;
    setState(() {
      _loading = true;
      _error = null;
      _code = null;
    });
    try {
      final data = await widget.repository.getFeaturePreferences();
      if (data['revision'] is! int ||
          data['configuration'] is! Map ||
          data['selfConfigurable'] is! List ||
          data['features'] is! Map) {
        throw ServerFailure(
          'Incomplete feature preferences.',
          code: FailureCode.unexpected,
        );
      }
      if (!mounted || generation != _generation) return;
      setState(() {
        _data = data;
        _preferences = {
          for (final entry
              in ((data['configuration'] as Map)['features'] as Map? ?? {})
                  .entries)
            entry.key.toString(): entry.value == true,
        };
        _effective = {
          for (final entry in (data['features'] as Map).entries)
            entry.key.toString(): entry.value == true,
        };
      });
    } on Failure catch (error) {
      if (mounted && generation == _generation) {
        setState(() {
          _error = error.errMessage;
          _code = error.code;
        });
      }
    } finally {
      if (mounted && generation == _generation) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _save() async {
    if (!widget.canConfigure ||
        _saving ||
        _data == null ||
        _reason.text.trim().isEmpty) {
      return;
    }
    setState(() {
      _saving = true;
      _saved = false;
      _error = null;
      _code = null;
    });
    try {
      final result = await widget.repository.saveFeaturePreferences(
        revision: _data!['revision'] as int,
        reason: _reason.text.trim(),
        features: _preferences,
      );
      if (result['revision'] is! int || result['features'] is! Map) {
        throw ServerFailure(
          'Could not confirm saved preferences.',
          code: FailureCode.unexpected,
        );
      }
      if (!mounted) return;
      setState(() {
        _data = {..._data!, 'revision': result['revision']};
        _effective = {
          for (final entry in (result['features'] as Map? ?? {}).entries)
            entry.key.toString(): entry.value == true,
        };
        _saved = true;
        _reason.clear();
      });
    } on Failure catch (error) {
      if (mounted) {
        setState(() {
          _error = error.errMessage;
          _code = error.code;
        });
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String _label(AppLocalizations l10n, String key) => switch (key) {
    'repTracking' => l10n.featurePreferencesRepTracking,
    'loyalty' => l10n.featurePreferencesLoyalty,
    'accounting' => l10n.featurePreferencesAccounting,
    'salesReports' => l10n.featurePreferencesSalesReports,
    'ownerInsights' => l10n.featurePreferencesOwnerInsights,
    'overdueReceivables' => l10n.featurePreferencesOverdue,
    'inactivePharmacies' => l10n.featurePreferencesInactive,
    'ownerAlerts' => l10n.featurePreferencesAlerts,
    'deliverySchedule' => l10n.featurePreferencesDelivery,
    _ => key,
  };

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.featurePreferencesTitle)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(l10n.featurePreferencesHelp),
          const SizedBox(height: 12),
          if (!widget.canConfigure) Text(l10n.featurePreferencesOwnerOnly),
          OutlinedButton(
            onPressed: _loading || _saving ? null : _load,
            child: Text(l10n.retryButton),
          ),
          if (_loading) const Center(child: CircularProgressIndicator()),
          if (_error != null)
            Text(
              translateErrorCode(l10n, _code, _error!),
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          if (_saved)
            Text(
              l10n.featurePreferencesSaved,
              key: const ValueKey('feature-preferences-saved'),
            ),
          if (_data != null && !_loading) ...[
            for (final value in _data!['selfConfigurable'] as List)
              SwitchListTile(
                title: Text(_label(l10n, value.toString())),
                subtitle: Text(
                  _effective[value] == true
                      ? l10n.featurePreferencesAvailable
                      : l10n.featurePreferencesUnavailable,
                ),
                value: _preferences[value] != false,
                onChanged: !widget.canConfigure || _saving
                    ? null
                    : (enabled) => setState(() {
                        _preferences = {
                          ..._preferences,
                          value.toString(): enabled,
                        };
                        _saved = false;
                      }),
              ),
            if (widget.canConfigure) ...[
              TextField(
                controller: _reason,
                maxLength: 1000,
                enabled: !_saving,
                decoration: InputDecoration(
                  labelText: l10n.featurePreferencesReason,
                ),
                onChanged: (_) => setState(() {}),
              ),
              FilledButton(
                onPressed: _saving || _reason.text.trim().isEmpty
                    ? null
                    : _save,
                child: Text(
                  _saving ? l10n.loading : l10n.featurePreferencesSave,
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }
}
