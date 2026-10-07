import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/widgets/full_text.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_account_tab.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_orders_tab.dart';
import 'package:feniq/routes/route_names.dart';

/// Everything a warehouse account sees in the app: its orders, and its
/// account (with the way to the full web panel). The notifications are one
/// tap away in the app bar. The cubits are provided by the route.
class WarehouseShellView extends StatefulWidget {
  const WarehouseShellView({super.key});

  @override
  State<WarehouseShellView> createState() => _WarehouseShellViewState();
}

class _WarehouseShellViewState extends State<WarehouseShellView> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final titles = [l10n.warehouseNavOrders, l10n.warehouseNavAccount];

    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.navyOf(context),
        foregroundColor: Colors.white,
        automaticallyImplyLeading: false,
        title: FullText(titles[_index], minScale: 0.6),
        actions: [
          IconButton(
            tooltip: l10n.notificationsTitle,
            icon: const Icon(Icons.notifications_outlined),
            onPressed: () => context.pushNamed(RouteNames.notifications),
          ),
        ],
      ),
      body: IndexedStack(index: _index, children: const [WarehouseOrdersTab(), WarehouseAccountTab()]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (index) => setState(() => _index = index),
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.receipt_long_outlined),
            selectedIcon: Icon(Icons.receipt_long, color: AppColors.primaryOf(context)),
            label: l10n.warehouseNavOrders,
          ),
          NavigationDestination(
            icon: const Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person, color: AppColors.primaryOf(context)),
            label: l10n.warehouseNavAccount,
          ),
        ],
      ),
    );
  }
}
