import 'package:feniq/features/auth/data/models/pharmacy_model.dart';
import 'package:feniq/features/auth/data/models/user_model.dart';

// Drives routing decisions (splash -> registration / approval-pending / home).
//
// `offline` is distinct from `unauthenticated`: a stored token is still
// present and untouched, but the server could not be reached to validate it
// on startup. The user is never logged out for this - the splash screen
// carries on into the app exactly as it does for `active`, and the screens
// that actually need the network surface their own retry. See
// AuthCubit.checkSession and SplashView._routeFor.
//
// `passwordChangeRequired` is an approved account signed in with a temporary
// password an admin set: the only screen it may reach is ChangePasswordView
// (AppRouter's redirect enforces that), and a successful change makes it
// `active`.
enum SessionStatus {
  unknown,
  unauthenticated,
  offline,
  pendingApproval,
  blocked,
  passwordChangeRequired,
  active,
}

class AuthState {
  const AuthState({
    this.sessionStatus = SessionStatus.unknown,
    this.isSubmitting = false,
    this.errorMessage,
    this.errorCode,
    this.otpSent = false,
    this.user,
    this.pharmacy,
    this.tokenRole,
    this.tokenSubject,
  });

  final SessionStatus sessionStatus;
  final bool isSubmitting;
  final String? errorMessage;
  // Machine-readable error id (a FailureCode for transport errors) so the
  // view can localize it via translateErrorCode. Null for the auth
  // endpoints that only send an English message.
  final String? errorCode;
  final bool otpSent;
  final UserModel? user;
  final PharmacyModel? pharmacy;

  // The role read from the stored access token - the only thing known about
  // the account while the server cannot be reached to say (`offline`). Never
  // trusted for anything the server enforces; it only picks which home screen
  // an offline start opens.
  final String? tokenRole;
  // Unverified token subject used ONLY for local encrypted-cache partitioning
  // during a cold offline start; never an authorization identity.
  final String? tokenSubject;
  String? get localAccountId => user?.id ?? tokenSubject;

  String? get role => user?.role ?? tokenRole;
  bool get isRep => role == 'rep';
  bool get isDriver => role == 'driver';
  // A warehouse account: its own orders screens (features/warehouse).
  bool get isWarehouse => role == 'warehouse';
  // An admin account signed in to the app: its home is a short landing that
  // opens the web panel, where all of the admin's work is.
  bool get isPanelUser => role == 'admin';

  AuthState copyWith({
    SessionStatus? sessionStatus,
    bool? isSubmitting,
    String? errorMessage,
    String? errorCode,
    bool clearError = false,
    bool? otpSent,
    UserModel? user,
    PharmacyModel? pharmacy,
    String? tokenRole,
    String? tokenSubject,
  }) {
    return AuthState(
      sessionStatus: sessionStatus ?? this.sessionStatus,
      isSubmitting: isSubmitting ?? this.isSubmitting,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      errorCode: clearError ? null : (errorCode ?? this.errorCode),
      otpSent: otpSent ?? this.otpSent,
      user: user ?? this.user,
      pharmacy: pharmacy ?? this.pharmacy,
      tokenRole: tokenRole ?? this.tokenRole,
      tokenSubject: tokenSubject ?? this.tokenSubject,
    );
  }
}
