import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/core/error/error_translator.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/utils/number_input.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_management_repository.dart';

class WarehouseDeliveryView extends StatefulWidget {
  const WarehouseDeliveryView({super.key});
  @override
  State<WarehouseDeliveryView> createState() => _WarehouseDeliveryViewState();
}

class _WarehouseDeliveryViewState extends State<WarehouseDeliveryView> {
  final _form = GlobalKey<FormState>();
  Map<String, dynamic>? _settings;
  List<Map<String, dynamic>> _pharmacies = [];
  bool _entitled = false,
      _busy = false,
      _searching = false,
      _dirty = false,
      _saved = false;
  String? _error, _searchError;
  String _query = '';
  int _generation = 0, _formVersion = 0, _assignmentAttempt = 0;
  WarehouseManagementRepository get _repository =>
      context.read<WarehouseManagementRepository>();
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _generation++;
    super.dispose();
  }

  String _message(Object error) => error is Failure
      ? translateErrorCode(context.l10n, error.code, error.errMessage)
      : context.l10n.deliveryInvalid;
  Future<void> _load() async {
    try {
      final result = await _repository.getDeliverySettings();
      final settings = (result['settings'] as Map).cast<String, dynamic>();
      if (settings['zones'] is! List ||
          settings['revision'] is! num ||
          settings['enabled'] is! bool) {
        throw const FormatException();
      }
      if (mounted) {
        setState(() {
          _settings = jsonDecode(jsonEncode(settings));
          _entitled = result['entitled'] == true;
          _error = null;
          _dirty = false;
          _formVersion++;
        });
      }
    } catch (error) {
      if (mounted) {
        setState(() => _error = _message(error));
      }
    }
  }

  List<dynamic> get _zones => _settings!['zones'] as List;
  Map<String, dynamic> _newSlot() => {
    'weekday': 6,
    'departureTime': '10:00',
    'arrivalHours': 4,
    'cutoffHours': 12,
  };
  void _change(VoidCallback action) {
    setState(() {
      action();
      _dirty = true;
      _saved = false;
    });
  }

  Future<void> _save() async {
    if (_busy || !_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
      _saved = false;
    });
    try {
      final result = await _repository.saveDeliverySettings(_settings!);
      if (mounted) {
        setState(() {
          _settings = jsonDecode(jsonEncode(result['settings']));
          _dirty = false;
          _saved = true;
          _formVersion++;
        });
      }
    } catch (error) {
      if (mounted) {
        setState(() => _error = _message(error));
      }
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _assignmentAttempt++;
        });
      }
    }
  }

  Future<void> _search() async {
    if (_query.trim().length < 2 || _busy || _searching) return;
    final generation = ++_generation;
    setState(() {
      _searching = true;
      _searchError = null;
      _pharmacies = [];
    });
    try {
      final rows = await _repository.searchDeliveryPharmacies(_query.trim());
      if (mounted && generation == _generation) {
        setState(() => _pharmacies = rows);
      }
    } catch (error) {
      if (mounted && generation == _generation) {
        setState(() => _searchError = _message(error));
      }
    } finally {
      if (mounted && generation == _generation) {
        setState(() => _searching = false);
      }
    }
  }

  Future<void> _assign(Map<String, dynamic> pharmacy, String? zoneId) async {
    if (_busy || _dirty) return;
    setState(() {
      _busy = true;
      _searchError = null;
    });
    try {
      final result = await _repository.assignDeliveryPharmacy(
        pharmacy['id'] as String,
        zoneId,
        (pharmacy['assignment']['revision'] as num).toInt(),
      );
      if (mounted) {
        setState(() => pharmacy['assignment'] = result['assignment']);
      }
    } catch (error) {
      if (mounted) {
        setState(() => _searchError = _message(error));
      }
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _assignmentAttempt++;
        });
      }
    }
  }

  Widget _field(
    Map<String, dynamic> row,
    String name,
    String label,
    String identity, {
    bool number = false,
    bool time = false,
    bool date = false,
    double max = 168,
  }) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(label),
        const SizedBox(height: 8),
        TextFormField(
          key: ValueKey('$_formVersion-$identity-$name'),
          initialValue: '${row[name] ?? ''}',
          decoration: InputDecoration(
            helperText: time
                ? 'HH:mm · 10:00'
                : date
                ? 'YYYY-MM-DD'
                : null,
          ),
          maxLength: number
              ? 8
              : time
              ? 5
              : date
              ? 10
              : 80,
          keyboardType: number
              ? const TextInputType.numberWithOptions(decimal: true)
              : time || date
              ? TextInputType.datetime
              : TextInputType.text,
          textDirection: number || time || date ? TextDirection.ltr : null,
          inputFormatters: number || time || date
              ? [const WesternDigitsFormatter()]
              : null,
          validator: (value) {
            final text = value?.trim() ?? '';
            if (text.isEmpty) return context.l10n.deliveryInvalid;
            if (time && !RegExp(r'^([01]\d|2[0-3]):[0-5]\d$').hasMatch(text)) {
              return 'HH:mm · 10:00';
            }
            if (date &&
                (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(text) ||
                    DateTime.tryParse(text) == null)) {
              return 'YYYY-MM-DD';
            }
            if (number) {
              final n = double.tryParse(text);
              if (n == null ||
                  !n.isFinite ||
                  n < 0 ||
                  n > max ||
                  n * 4 != (n * 4).round()) {
                return context.l10n.deliveryInvalid;
              }
            }
            return null;
          },
          onChanged: (value) => _change(
            () => row[name] = number
                ? num.tryParse(westernDigits(value)) ?? value
                : value,
          ),
        ),
      ],
    ),
  );
  Widget _slot(
    Map<String, dynamic> row,
    String identity,
    VoidCallback remove, {
    bool exception = false,
  }) {
    final l = context.l10n;
    final weekdays = [
      l.deliveryDays0,
      l.deliveryDays1,
      l.deliveryDays2,
      l.deliveryDays3,
      l.deliveryDays4,
      l.deliveryDays5,
      l.deliveryDays6,
    ];
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (!exception)
              DropdownButtonFormField<int>(
                isExpanded: true,
                initialValue: row['weekday'] as int,
                decoration: InputDecoration(labelText: l.deliveryDay),
                items: List.generate(
                  7,
                  (i) => DropdownMenuItem(value: i, child: Text(weekdays[i])),
                ),
                onChanged: (value) {
                  if (value != null) {
                    _change(() => row['weekday'] = value);
                  }
                },
              ),
            if (exception) ...[
              _field(row, 'date', l.deliveryDate, identity, date: true),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(l.deliveryCancelTrip),
                value: row['cancelled'] == true,
                onChanged: (value) => _change(() => row['cancelled'] = value),
              ),
            ],
            if (!exception || row['cancelled'] != true) ...[
              _field(
                row,
                'departureTime',
                l.deliveryDepartureTime,
                identity,
                time: true,
              ),
              _field(
                row,
                'arrivalHours',
                l.deliveryArrivalHours,
                identity,
                number: true,
                max: 72,
              ),
              _field(
                row,
                'cutoffHours',
                l.deliveryCutoffHours,
                identity,
                number: true,
              ),
            ],
            TextButton(
              onPressed: () => _change(remove),
              child: Text(
                exception ? l.deliveryRemoveException : l.deliveryRemoveTrip,
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.navyOf(context),
        foregroundColor: Colors.white,
        title: Text(l.deliveryArrivalTitle, maxLines: 2),
        toolbarHeight:
            64 * MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 2.0),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(l.deliveryExplanation),
          if (_error != null) ...[
            Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
            TextButton(
              onPressed: _busy ? null : _load,
              child: Text(l.deliveryReload),
            ),
          ],
          if (_saved)
            Padding(
              padding: const EdgeInsets.all(8),
              child: Text(l.deliverySaved),
            ),
          if (_settings == null && _error == null)
            const Center(child: CircularProgressIndicator()),
          if (_settings != null) ...[
            if (!_entitled)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Text(l.deliveryFeatureOff),
              ),
            AbsorbPointer(
              absorbing: _busy || !_entitled,
              child: Opacity(
                opacity: _entitled ? 1 : 0.6,
                child: Form(
                  key: _form,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(l.deliveryEnable),
                        value: _settings!['enabled'] == true,
                        onChanged: (value) =>
                            _change(() => _settings!['enabled'] = value),
                      ),
                      for (int i = 0; i < _zones.length; i++)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 16),
                          child: CustomCard(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                _field(
                                  _zones[i] as Map<String, dynamic>,
                                  'name',
                                  l.deliveryZoneName,
                                  'zone-$i',
                                ),
                                _field(
                                  _zones[i] as Map<String, dynamic>,
                                  'preparationHours',
                                  l.deliveryPreparation,
                                  'zone-$i',
                                  number: true,
                                ),
                                SwitchListTile(
                                  contentPadding: EdgeInsets.zero,
                                  title: Text(l.deliveryZoneActive),
                                  value: _zones[i]['active'] == true,
                                  onChanged: (value) => _change(
                                    () => _zones[i]['active'] = value,
                                  ),
                                ),
                                for (
                                  int j = 0;
                                  j < (_zones[i]['slots'] as List).length;
                                  j++
                                )
                                  _slot(
                                    _zones[i]['slots'][j]
                                        as Map<String, dynamic>,
                                    'zone-$i-slot-$j',
                                    () {
                                      (_zones[i]['slots'] as List).removeAt(j);
                                      _formVersion++;
                                    },
                                  ),
                                OutlinedButton(
                                  onPressed:
                                      (_zones[i]['slots'] as List).length >= 7
                                      ? null
                                      : () => _change(() {
                                          final used =
                                              (_zones[i]['slots'] as List).map(
                                                (row) => row['weekday'],
                                              );
                                          (_zones[i]['slots'] as List).add({
                                            ..._newSlot(),
                                            'weekday':
                                                List.generate(
                                                  7,
                                                  (d) => d,
                                                ).firstWhere(
                                                  (d) => !used.contains(d),
                                                ),
                                          });
                                        }),
                                  child: Text(l.deliveryAddTrip),
                                ),
                                ExpansionTile(
                                  title: Text(l.deliveryExceptions),
                                  tilePadding: EdgeInsets.zero,
                                  children: [
                                    for (
                                      int j = 0;
                                      j <
                                          (_zones[i]['exceptions'] as List)
                                              .length;
                                      j++
                                    )
                                      _slot(
                                        _zones[i]['exceptions'][j]
                                            as Map<String, dynamic>,
                                        'zone-$i-ex-$j',
                                        () {
                                          (_zones[i]['exceptions'] as List)
                                              .removeAt(j);
                                          _formVersion++;
                                        },
                                        exception: true,
                                      ),
                                    TextButton(
                                      onPressed:
                                          (_zones[i]['exceptions'] as List)
                                                  .length >=
                                              90
                                          ? null
                                          : () => _change(
                                              () =>
                                                  (_zones[i]['exceptions']
                                                          as List)
                                                      .add({
                                                        ..._newSlot(),
                                                        'date': '',
                                                        'cancelled': true,
                                                      }),
                                            ),
                                      child: Text(l.deliveryAddException),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ),
                      OutlinedButton(
                        onPressed: _zones.length >= 30
                            ? null
                            : () => _change(
                                () => _zones.add({
                                  'name': '',
                                  'active': true,
                                  'preparationHours': 2,
                                  'slots': [_newSlot()],
                                  'exceptions': [],
                                }),
                              ),
                        child: Text(l.deliveryAddZone),
                      ),
                      const SizedBox(height: 12),
                      FilledButton(
                        onPressed: _entitled && !_busy ? _save : null,
                        child: Text(_busy ? l.loading : l.deliverySave),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            if (_entitled) ...[
              const SizedBox(height: 24),
              Text(
                l.deliveryAssignTitle,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              Text(l.deliveryAssignHint),
              if (_dirty) Text(l.deliveryUnsaved),
              Text(l.deliverySearch),
              TextField(
                enabled: !_busy && !_searching,
                decoration: InputDecoration(hintText: l.deliverySearch),
                key: const Key('delivery-pharmacy-search'),
                onChanged: (value) => _query = value,
                onSubmitted: (_) => _search(),
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: _busy || _searching ? null : _search,
                child: Text(_searching ? l.loading : l.deliverySearchButton),
              ),
              if (_searchError != null) Text(_searchError!),
              for (final ph in _pharmacies)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: CustomCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          '${ph['nameAr'] ?? ph['nameEn']}',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        Text('${ph['city'] ?? ''} · ${ph['address'] ?? ''}'),
                        DropdownButtonFormField<String>(
                          key: ValueKey(
                            '${ph['id']}-${ph['assignment']['revision']}-$_assignmentAttempt',
                          ),
                          isExpanded: true,
                          initialValue:
                              ph['assignment']['zoneId'] != null &&
                                  _zones.any(
                                    (zone) =>
                                        zone['_id'] ==
                                        ph['assignment']['zoneId'],
                                  )
                              ? ph['assignment']['zoneId'] as String?
                              : '',
                          items: [
                            DropdownMenuItem(
                              value: '',
                              child: Text(
                                l.deliveryUnassigned,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            for (final zone in _zones.where(
                              (zone) => zone['_id'] != null,
                            ))
                              DropdownMenuItem(
                                value: zone['_id'] as String,
                                child: Text(
                                  '${zone['name']}${zone['active'] == true ? '' : ' (${l.deliveryPaused})'}',
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                          ],
                          onChanged: _busy || _dirty
                              ? null
                              : (value) =>
                                    _assign(ph, value == '' ? null : value),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ],
        ],
      ),
    );
  }
}
