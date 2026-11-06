import 'package:feniq/core/widgets/responsive_role_layout.dart';
import 'package:feniq/core/widgets/startup_location_permission.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/widgets/full_text.dart';
import 'package:feniq/features/rep/presentation/managers/rep_home_cubit.dart';
import 'package:feniq/features/rep/presentation/managers/rep_pharmacies_cubit.dart';
import 'package:feniq/features/rep/presentation/managers/rep_visits_cubit.dart';
import 'package:feniq/features/rep/presentation/views/rep_pharmacies_tab.dart';
import 'package:feniq/features/driver/data/driver_trip_repository.dart';
import 'package:feniq/features/driver/data/driver_position_stream.dart';
import 'package:feniq/features/driver/data/driver_stop_outbox.dart';
import 'package:feniq/features/auth/presentation/managers/auth_cubit.dart';
import 'package:feniq/features/driver/presentation/driver_trips_tab.dart';
import 'package:feniq/features/rep/data/services/location_provider.dart';
import 'package:feniq/features/rep/presentation/views/rep_profile_tab.dart';
import 'package:feniq/features/rep/presentation/views/rep_visits_tab.dart';
import 'package:feniq/routes/route_names.dart';

/// Everything the signed-in rep sees: their pharmacies, their visits and their
/// account, with the QR scan one tap away on the first tab. The cubits are
/// provided by the route (app_router.dart).
class RepShellView extends StatefulWidget {
  const RepShellView({super.key, this.driverTripRepository});

  final DriverTripRepository? driverTripRepository;

  @override
  State<RepShellView> createState() => _RepShellViewState();
}

class _RepShellViewState extends State<RepShellView> {
  int _index = 0;
  String? _outboxOwnerId;
  DriverTripRepository? _outboxRepository;
  DriverStopOutbox? _stopOutbox;

  Future<void> _scan() async {
    final logged = await context.pushNamed<bool>(RouteNames.repScan);
    if (logged == true && mounted) {
      // A visit changes all three: the pharmacy's "last visit", the log, and
      // the week's count.
      context.read<RepPharmaciesCubit>().load();
      context.read<RepVisitsCubit>().load();
      context.read<RepHomeCubit>().load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final driverEnabled = widget.driverTripRepository != null;
    final driverAccountId = context.read<AuthCubit>().state.user?.id;
    if (_outboxOwnerId != driverAccountId ||
        !identical(_outboxRepository, widget.driverTripRepository)) {
      _outboxOwnerId = driverAccountId;
      _outboxRepository = widget.driverTripRepository;
      _stopOutbox = driverAccountId == null || widget.driverTripRepository == null
        ? null : DriverStopOutbox(
            accountId: driverAccountId,
            repository: widget.driverTripRepository!,
            store: const SecureDriverStopOutboxStore(),
          );
    }
    final titles = [l10n.repNavPharmacies, l10n.repVisitsTitle,
      if (driverEnabled)
        (Localizations.localeOf(context).languageCode == 'ar' ? 'رحلات التوزيع' : 'Delivery trips'),
      l10n.profileTitle];

    return ResponsiveRoleScaffold(
      appBar: AppBar(
        backgroundColor: AppColors.navyOf(context),
        foregroundColor: Colors.white,
        automaticallyImplyLeading: false,
        title: FullText(titles[_index], minScale: 0.6),
      ),
      body: Column(
        children: [
          const StartupLocationPermission(),
          Expanded(
            child: IndexedStack(index: _index, children: [
              const RepPharmaciesTab(),
              const RepVisitsTab(),
              if (driverEnabled) DriverTripsTab(
                repository: widget.driverTripRepository!,
                locationProvider: const GeolocatorLocationProvider(),
                positionStream: const GeolocatorDriverPositionStream(),
                stopOutbox: _stopOutbox,
              ),
              const RepProfileTab(),
            ]),
          ),
        ],
      ),
      floatingActionButton: _index == 0
          ? FloatingActionButton.extended(
              onPressed: _scan,
              icon: const Icon(Icons.qr_code_scanner),
              label: Text(l10n.repScanAction),
            )
          : null,
      selectedIndex: _index,
      onSelected: (index) => setState(() => _index = index),
      destinations: [
        NavigationDestination(
          icon: const Icon(Icons.storefront_outlined),
          selectedIcon: Icon(Icons.storefront, color: AppColors.primaryOf(context)),
          label: l10n.repNavPharmacies,
        ),
        NavigationDestination(
          icon: const Icon(Icons.place_outlined),
          selectedIcon: Icon(Icons.place, color: AppColors.primaryOf(context)),
          label: l10n.repNavVisits,
        ),
        if (driverEnabled) NavigationDestination(
          icon: const Icon(Icons.local_shipping_outlined),
          selectedIcon: Icon(Icons.local_shipping, color: AppColors.primaryOf(context)),
          label: Localizations.localeOf(context).languageCode == 'ar' ? 'رحلاتي' : 'My trips',
        ),
        NavigationDestination(
          icon: const Icon(Icons.person_outline),
          selectedIcon: Icon(Icons.person, color: AppColors.primaryOf(context)),
          label: l10n.profileTitle,
        ),
      ],
    );
  }
}
