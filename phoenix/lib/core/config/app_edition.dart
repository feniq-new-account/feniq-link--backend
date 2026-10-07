/// Which of the two Android apps this build is.
///
/// One codebase ships as two apps that sit side by side on a phone: the
/// pharmacy app ("Feniq") and the field reps' app ("Feniq Rep"). The rep build
/// is made with `--dart-define=APP_EDITION=rep` (and `FENIQ_APP=rep` for Gradle
/// - see android/app/build.gradle.kts), and differs in three ways only: its own
/// application id, name and icon; a sign-in that takes rep accounts alone; and
/// no way into pharmacy registration. A plain `flutter run` is the pharmacy app.
class AppEdition {
  AppEdition._();

  static const String _edition = String.fromEnvironment('APP_EDITION', defaultValue: 'pharmacy');

  /// True in the rep app. Settable so tests can exercise either edition; a
  /// test that flips it puts it back in tearDown.
  static bool isRepApp = _edition == 'rep';
}
