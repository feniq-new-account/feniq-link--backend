import java.util.Properties

// ============================================================================
// معرّف التطبيق (applicationId) — المكان الوحيد الذي يُغيَّر فيه.
//
// هو "هوية" التطبيق عند أندرويد وGoogle Play: تطبيقان بنفس المعرّف ونفس مفتاح
// التوقيع = تحديث فوق بعض. غيّره هنا فقط، وقبل أول نشر فعلي: بعد أن يثبّت
// الصيادلة التطبيق، تغيير المعرّف يعني تطبيقاً جديداً لا يحدّث القديم.
// عند تغييره: تطبيق Android في Firebase يجب أن يكون بنفس المعرّف (انظر
// phoenix/android/README.md).
// ============================================================================
val feniqApplicationId = "com.feniq.link"

// The same code is also built as a second, separate app for the field reps
// ("Feniq Rep"): its own application id, name and icon, so it installs beside
// the pharmacy app on one phone and the two can never be mistaken for each
// other. It is chosen by the environment (FENIQ_APP=rep, which
// .github/workflows/android-rep-apk.yml sets), together with
// `--dart-define=APP_EDITION=rep` for the Dart side. Without it, this is the
// pharmacy app, byte for byte as before.
val isRepApp = System.getenv("FENIQ_APP") == "rep"
val appApplicationId = if (isRepApp) "$feniqApplicationId.rep" else feniqApplicationId

// The release signing key lives outside git. It is read from, in order:
//   1. android/key.properties (storeFile, storePassword, keyAlias, keyPassword)
//      - what CI writes from the repository secrets, and what a local build
//      uses;
//   2. the environment: ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD,
//      ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD.
// Without either, release builds fall back to the debug key - usable for a
// quick test on one phone, but such an APK can never be updated in place by
// one signed with the real key. CI never publishes a debug-signed APK
// (.github/workflows/android-apk.yml). See phoenix/android/README.md.
val keystoreProperties = Properties().apply {
    val file = rootProject.file("key.properties")
    if (file.exists()) {
        file.inputStream().use { load(it) }
    } else {
        System.getenv("ANDROID_KEYSTORE_PATH")?.takeIf { it.isNotBlank() }?.let { path ->
            setProperty("storeFile", path)
            setProperty("storePassword", System.getenv("ANDROID_KEYSTORE_PASSWORD") ?: "")
            setProperty("keyAlias", System.getenv("ANDROID_KEY_ALIAS") ?: "")
            setProperty("keyPassword", System.getenv("ANDROID_KEY_PASSWORD") ?: "")
        }
    }
}

plugins {
    id("com.android.application")
    // START: FlutterFire Configuration
    // Resolved but not applied here: it is applied at the bottom of this file,
    // and only when google-services.json belongs to this applicationId.
    id("com.google.gms.google-services") apply false
    // END: FlutterFire Configuration
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    // The Kotlin package of MainActivity - an internal code name, not the
    // app's identity. It does not need to change with feniqApplicationId.
    namespace = "com.feniq.link"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = "29.0.13599879"

    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_11.toString()
    }

    defaultConfig {
        applicationId = appApplicationId
        manifestPlaceholders["appLabel"] = if (isRepApp) "Feniq Rep" else "Feniq"
        manifestPlaceholders["appIcon"] = if (isRepApp) "@mipmap/ic_launcher_rep" else "@mipmap/ic_launcher"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (keystoreProperties.containsKey("storeFile")) {
            create("release") {
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}

flutter {
    source = "../.."
}

// Firebase (push notifications, remote config). The google-services plugin
// fails the whole build when google-services.json has no client for this
// applicationId - which is exactly the state between changing the id and
// downloading the matching file from the new Firebase project. So it is
// applied only when the file matches; otherwise the app builds and runs
// without push notifications (main.dart tolerates a missing Firebase config)
// and the build log says why.
val googleServicesFile = file("google-services.json")
val googleServicesMatches = googleServicesFile.exists() &&
    Regex("\"package_name\"\\s*:\\s*\"${Regex.escape(appApplicationId)}\"")
        .containsMatchIn(googleServicesFile.readText())
if (googleServicesMatches) {
    apply(plugin = "com.google.gms.google-services")
} else {
    logger.warn(
        "WARNING: android/app/google-services.json is missing or not for " +
            "'$appApplicationId' - building WITHOUT Firebase (no push notifications). " +
            "See phoenix/android/README.md."
    )
}
