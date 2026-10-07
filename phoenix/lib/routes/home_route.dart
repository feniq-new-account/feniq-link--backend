import 'package:feniq/features/auth/presentation/managers/auth_state.dart';
import 'package:feniq/routes/route_names.dart';

/// Where a signed-in account lands: the rep screens for a rep, the panel
/// landing for a warehouse or admin, the warehouse list for a pharmacy. Every screen that sends someone "into the app" after
/// the auth steps (splash, sign-in, forced password change, approval) asks
/// here rather than hard-coding the pharmacy home.
///
/// Offline, `state.user` is not known yet - [AuthState.role] then falls back
/// to the role in the stored token, so a rep opening the app without a
/// connection still reaches their own screens.
String homeRouteNameFor(AuthState state) {
  if (state.isRep) return RouteNames.repHome;
  if (state.isPanelUser) return RouteNames.panelHome;
  return RouteNames.warehouseSelection;
}
