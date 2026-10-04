// A build with no server at all, for trying the app by hand:
//   flutter build web --dart-define=DEMO_MODE=true
//   flutter build apk --dart-define=DEMO_MODE=true
// Every request is answered inside the app by DemoBackendInterceptor
// (demo_backend.dart); Firebase is skipped; a strip on every screen says the
// data is not real. Off in every normal build.
//
// The APK is built by .github/workflows/android-apk-demo.yml. The web build
// needs `dependency_overrides: {firebase_core_web: 3.10.0}` in a local
// pubspec_overrides.yaml (3.11 does not compile for web on Flutter 3.35), and
// `--no-web-resources-cdn` so it runs where only its own files load.
const bool kDemoMode = bool.fromEnvironment('DEMO_MODE');
