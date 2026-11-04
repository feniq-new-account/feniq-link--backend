import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/error/error_translator.dart';
import 'package:feniq/core/widgets/app_text_field.dart';
import 'package:feniq/core/widgets/primary_button.dart';
import 'package:feniq/features/auth/presentation/managers/auth_cubit.dart';
import 'package:feniq/features/auth/presentation/widgets/location_map_field.dart';

class EditProfileView extends StatefulWidget {
  const EditProfileView({super.key});
  @override
  State<EditProfileView> createState() => _EditProfileViewState();
}

class _EditProfileViewState extends State<EditProfileView> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _name, _pharmacy, _address, _area;
  late String _areaType;
  double? _latitude, _longitude;
  bool _locationChanged = false;
  bool _saving = false;
  @override
  void initState() {
    super.initState();
    final state = context.read<AuthCubit>().state;
    _name = TextEditingController(text: state.user?.name);
    _pharmacy = TextEditingController(text: state.pharmacy?.nameAr);
    _address = TextEditingController(text: state.pharmacy?.address);
    _area = TextEditingController(text: state.pharmacy?.areaName);
    _areaType = state.pharmacy?.areaType ?? 'city';
  }

  @override
  void dispose() {
    for (final controller in [_name, _pharmacy, _address, _area]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving || !_form.currentState!.validate()) return;
    setState(() => _saving = true);
    final cubit = context.read<AuthCubit>();
    final ok = await cubit.updateProfile({
      'name': _name.text.trim(),
      'pharmacyName': _pharmacy.text.trim(),
      'address': _address.text.trim(),
      'areaName': _area.text.trim(),
      'areaType': _areaType,
      if (_locationChanged) 'latitude': _latitude,
      if (_locationChanged) 'longitude': _longitude,
    });
    if (!mounted) return;
    setState(() => _saving = false);
    if (ok) {
      Navigator.of(context).pop();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            translateErrorCode(
              context.l10n,
              cubit.state.errorCode,
              cubit.state.errorMessage ?? '',
            ),
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    String? requiredText(String? value) =>
        value == null || value.trim().isEmpty ? l10n.fieldRequired : null;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.editProfileTitle)),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Form(
                key: _form,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    AppTextField(
                      label: l10n.fullNameLabel,
                      controller: _name,
                      validator: requiredText,
                    ),
                    const SizedBox(height: 12),
                    AppTextField(
                      label: l10n.pharmacyNameLabel,
                      controller: _pharmacy,
                      validator: requiredText,
                    ),
                    const SizedBox(height: 12),
                    AppTextField(
                      label: l10n.manualAddressLabel,
                      controller: _address,
                      validator: requiredText,
                    ),
                    const SizedBox(height: 12),
                    AppTextField(
                      label: l10n.areaNameLabel,
                      controller: _area,
                      validator: requiredText,
                    ),
                    DropdownButtonFormField<String>(
                      initialValue: _areaType,
                      decoration: InputDecoration(
                        labelText: l10n.areaTypeLabel,
                      ),
                      items: [
                        DropdownMenuItem(
                          value: 'city',
                          child: Text(l10n.areaTypeCity),
                        ),
                        DropdownMenuItem(
                          value: 'city_ring',
                          child: Text(l10n.areaTypeCityRing),
                        ),
                        DropdownMenuItem(
                          value: 'rural',
                          child: Text(l10n.areaTypeRural),
                        ),
                      ],
                      onChanged: _saving
                          ? null
                          : (value) => setState(() => _areaType = value!),
                    ),
                    ExpansionTile(
                      title: Text(l10n.optionalLocationLabel),
                      children: [
                        LocationMapField(
                          label: l10n.optionalLocationLabel,
                          onChanged: (lat, lng, address) {
                            _latitude = lat;
                            _longitude = lng;
                            _locationChanged = true;
                          },
                          onCleared: () {
                            _locationChanged = false;
                          },
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    PrimaryButton(
                      label: l10n.saveProfileButton,
                      isLoading: _saving,
                      onPressed: _save,
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
