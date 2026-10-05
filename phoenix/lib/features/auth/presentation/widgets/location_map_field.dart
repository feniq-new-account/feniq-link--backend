import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_radius.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';

// Section 6.2 update: the address field is gone - this embedded map is now
// the only way to set the pharmacy's location, and its resolved address is
// what gets submitted as `address` (see registration_view.dart's _submit()).
// Same geolocator/Nominatim logic as the earlier bottom-sheet picker, just
// hosted inline in the form instead of a modal - see location_picker_sheet's
// prior version in git history for that.

// Latakia, Syria - the app's only served city today (see
// auth.service.js's registerOrLogin), used only as where the map opens if
// the device's current position isn't available yet.
const _defaultCenter = LatLng(35.5317, 35.7911);

const _nominatimUserAgent = 'FeniqPharmacyApp/1.0';

Future<bool> ensureLocationPermission() async {
  final serviceEnabled = await Geolocator.isLocationServiceEnabled();
  if (!serviceEnabled) return false;

  var permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied) {
    permission = await Geolocator.requestPermission();
  }
  return permission == LocationPermission.always ||
      permission == LocationPermission.whileInUse;
}

Future<String?> _reverseGeocode(LatLng point, String languageCode) async {
  try {
    final response = await Dio().get<Map<String, dynamic>>(
      'https://nominatim.openstreetmap.org/reverse',
      queryParameters: {
        'format': 'jsonv2',
        'lat': point.latitude,
        'lon': point.longitude,
        'accept-language': languageCode,
      },
      options: Options(headers: {'User-Agent': _nominatimUserAgent}),
    );
    return response.data?['display_name'] as String?;
  } catch (_) {
    // Best-effort - the map still reports its coordinates even when the
    // address lookup itself fails (rate-limited, offline, ...).
    return null;
  }
}

class LocationMapField extends StatefulWidget {
  const LocationMapField({
    super.key,
    required this.label,
    required this.onChanged,
    required this.onCleared,
  });

  final String label;
  // Called only once the pharmacist taps "choose this location": with the
  // pin's point and its address, and again if the address for that same
  // point resolves after the tap. Panning the map alone never reports - a
  // stray swipe used to silently move the submitted location.
  final void Function(double latitude, double longitude, String? address)
  onChanged;
  // Called when a confirmed location is reopened for editing.
  final VoidCallback onCleared;

  @override
  State<LocationMapField> createState() => _LocationMapFieldState();
}

class _LocationMapFieldState extends State<LocationMapField> {
  final _mapController = MapController();
  LatLng _center = _defaultCenter;
  String? _resolvedAddress;
  bool _isResolving = true;
  // True once "choose this location" is tapped: the map is locked and the
  // point is what gets submitted, until "change location" reopens it.
  bool _confirmed = false;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    // _initializeLocation eventually reads Localizations.localeOf(context)
    // (inside _resolveAddress) - calling that from an async chain kicked off
    // in initState throws even after an await, because the element hasn't
    // finished its first build yet. Deferring the kickoff to right after
    // that first frame sidesteps it entirely.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _initializeLocation();
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _mapController.dispose();
    super.dispose();
  }

  Future<void> _initializeLocation() async {
    final granted = await ensureLocationPermission();
    if (mounted && granted) {
      try {
        final position = await Geolocator.getCurrentPosition(
          timeLimit: const Duration(seconds: 6),
        );
        if (mounted) {
          _center = LatLng(position.latitude, position.longitude);
          _mapController.move(_center, 15);
        }
      } catch (_) {
        // Falls back to the default center already set.
      }
    }
    await _resolveAddress();
  }

  Future<void> _resolveAddress() async {
    if (!mounted) return;
    setState(() => _isResolving = true);
    final languageCode = Localizations.localeOf(context).languageCode;
    final address = await _reverseGeocode(_center, languageCode);
    if (!mounted) return;
    setState(() {
      _resolvedAddress = address;
      _isResolving = false;
    });
    if (_confirmed) {
      widget.onChanged(_center.latitude, _center.longitude, address);
    }
  }

  void _onCenterSettled(LatLng center) {
    if (_confirmed) return;
    _center = center;
    setState(() => _isResolving = true);
    _debounce?.cancel();
    // At most one Nominatim request per second, and never mid-drag - only
    // once the map has been still for a second.
    _debounce = Timer(const Duration(seconds: 1), _resolveAddress);
  }

  Future<void> _useCurrentLocation() async {
    final l10n = context.l10n;
    final granted = await ensureLocationPermission();
    if (!mounted) return;
    if (!granted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.locationPermissionDeniedMessage)),
      );
      return;
    }
    try {
      final position = await Geolocator.getCurrentPosition(
        timeLimit: const Duration(seconds: 6),
      );
      if (!mounted) return;
      final target = LatLng(position.latitude, position.longitude);
      _mapController.move(target, _mapController.camera.zoom);
      _onCenterSettled(target);
    } catch (_) {
      // Silently ignored - the pharmacist can still drag the map manually.
    }
  }

  void _confirmLocation() {
    setState(() => _confirmed = true);
    // An address still resolving is reported again by _resolveAddress once
    // it lands; until then the pin's coordinates are already final.
    widget.onChanged(
      _center.latitude,
      _center.longitude,
      _isResolving ? null : _resolvedAddress,
    );
  }

  void _changeLocation() {
    setState(() => _confirmed = false);
    widget.onCleared();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          widget.label,
          style: context.textTheme.bodySmall?.copyWith(
            fontWeight: FontWeight.w700,
            color: AppColors.textSecondaryOf(context),
          ),
        ),
        const SizedBox(height: AppSizes.spacingXSmall),
        // Same border radius/color as AppTextField's own OutlineInputBorder -
        // reads as one more form field, not a separate floating element.
        ClipRRect(
          borderRadius: AppRadius.medium,
          child: Container(
            height: 260,
            decoration: BoxDecoration(
              borderRadius: AppRadius.medium,
              border: Border.all(color: AppColors.borderOf(context)),
            ),
            child: Stack(
              alignment: Alignment.center,
              children: [
                // Locked once confirmed, so a scroll that brushes the map
                // can't drag the chosen point away.
                AbsorbPointer(
                  absorbing: _confirmed,
                  child: FlutterMap(
                    mapController: _mapController,
                    options: MapOptions(
                      initialCenter: _center,
                      initialZoom: 15,
                      onPositionChanged: (position, hasGesture) {
                        if (hasGesture && position.center != null) {
                          _onCenterSettled(position.center!);
                        }
                      },
                    ),
                    children: [
                      TileLayer(
                        urlTemplate:
                            'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                        userAgentPackageName: 'com.feniq.pharmacy',
                      ),
                    ],
                  ),
                ),
                // The marker stays fixed at screen-center; the map pans
                // underneath it - reads as "drag to place the pin" without
                // needing a separate draggable-marker plugin. Green once the
                // location is confirmed.
                IgnorePointer(
                  child: Icon(
                    Icons.location_pin,
                    size: 40,
                    color: _confirmed
                        ? AppColors.secondaryOf(context)
                        : AppColors.errorOf(context),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: AppSizes.spacingSmall),
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Icon(
              Icons.place_outlined,
              size: 16,
              color: AppColors.textSecondaryOf(context),
            ),
            const SizedBox(width: AppSizes.spacingXSmall),
            Expanded(
              child: Text(
                _isResolving
                    ? l10n.resolvingAddressText
                    : (_resolvedAddress ?? l10n.pickLocationHint),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: context.textTheme.bodySmall?.copyWith(
                  color: AppColors.textSecondaryOf(context),
                ),
              ),
            ),
            const SizedBox(width: AppSizes.spacingSmall),
            TextButton.icon(
              onPressed: _confirmed ? null : _useCurrentLocation,
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSizes.spacingSmall,
                ),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              icon: const Icon(Icons.my_location, size: 16),
              label: Text(
                l10n.useCurrentLocationTooltip,
                style: const TextStyle(fontSize: 12.5),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSizes.spacingSmall),
        if (_confirmed)
          Row(
            children: [
              Icon(
                Icons.check_circle,
                size: 18,
                color: AppColors.secondaryOf(context),
              ),
              const SizedBox(width: AppSizes.spacingXSmall),
              Expanded(
                child: Text(
                  l10n.locationConfirmedText,
                  style: context.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: AppColors.secondaryOf(context),
                  ),
                ),
              ),
              TextButton.icon(
                onPressed: _changeLocation,
                icon: const Icon(Icons.edit_location_alt_outlined, size: 18),
                label: Text(l10n.changeLocationButton),
              ),
            ],
          )
        else
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: _confirmLocation,
              icon: const Icon(Icons.check),
              label: Text(l10n.confirmLocationButton),
            ),
          ),
      ],
    );
  }
}
