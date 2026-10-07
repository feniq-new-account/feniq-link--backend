import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/widgets/full_text.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_account_tab.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_accounts_tab.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_orders_tab.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_reps_tab.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_returns_tab.dart';
import 'package:feniq/routes/route_names.dart';

/// Everything a warehouse account sees in the app: its orders, the returns,
/// the pharmacies' accounts, its reps, and its own account (with the way to
/// the full web panel). The notifications are one tap away in the app bar.
/// The cubits are provided by the route; a tab is built the first time it is
/// opened, so its cubit only loads then.
class WarehouseShellView extends StatefulWidget {
  const WarehouseShellView({super.key});

  @override
  State<WarehouseShellView> createState() => _WarehouseShellViewState();
}

class _WarehouseShellViewState extends State<WarehouseShellView> {
  int _index = 0;
  final Set<int> _opened = {0};

  static const _tabs = <Widget>[
    WarehouseOrdersTab(),
    WarehouseReturnsTab(),
    WarehouseAccountsTab(),
    WarehouseRepsTab(),
    WarehouseAccountTab(),
  ];

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final titles = [
      l10n.warehouseNavOrders,
      l10n.warehouseNavReturns,
      l10n.warehouseNavAccounts,
      l10n.warehouseNavReps,
      l10n.warehouseNavAccount,
    ];

    Widget icon(IconData outlined, IconData filled, String label) => NavigationDestination(
      icon: Icon(outlined),
      selectedIcon: Icon(filled, color: AppColors.primaryOf(context)),
      label: label,
    );

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
      body: IndexedStack(
        index: _index,
        children: [for (var i = 0; i < _tabs.length; i++) _opened.contains(i) ? _tabs[i] : const SizedBox.shrink()],
      ),
      floatingActionButton: _index == 3
          ? Builder(
              builder: (context) => FloatingActionButton.extended(
                onPressed: () => WarehouseRepsTab.addRep(context),
                icon: const Icon(Icons.person_add_alt_1_outlined),
                label: Text(l10n.warehouseAddRep),
              ),
            )
          : null,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        onDestinationSelected: (index) => setState(() {
          _index = index;
          _opened.add(index);
        }),
        destinations: [
          icon(Icons.receipt_long_outlined, Icons.receipt_long, l10n.warehouseNavOrders),
          icon(Icons.assignment_return_outlined, Icons.assignment_return, l10n.warehouseNavReturns),
          icon(Icons.account_balance_wallet_outlined, Icons.account_balance_wallet, l10n.warehouseNavAccounts),
          icon(Icons.badge_outlined, Icons.badge, l10n.warehouseNavReps),
          icon(Icons.person_outline, Icons.person, l10n.warehouseNavAccount),
        ],
      ),
    );
  }
}
