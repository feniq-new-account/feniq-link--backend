import 'package:feniq/features/launch/launch_status_banner.dart';

Future<AppLaunchStatus> openLaunchForTest() async =>
    const AppLaunchStatus(orderingEnabled: true, message: 'Sales test fixture');
