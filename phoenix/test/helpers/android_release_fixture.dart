import 'package:feniq/core/services/android_release_policy.dart';

Map<String, dynamic> releasePayload(
  DateTime now, {
  bool allMandatory = false,
}) => {
  'serverTime': now.toUtc().toIso8601String(),
  'release': {
    'latestBuild': 1050,
    'versionName': '1.0.1',
    'applicationId': 'com.feniq.link',
    'apkUrl': 'https://feniq-site.onrender.com/feniq.apk',
    'sha256': 'a' * 64,
    'size': 80000000,
    'roles': {
      for (final role in AndroidReleasePolicy.roleNames)
        role: {
          'minimumBuild': role == 'rep' || allMandatory ? 1050 : 1,
          'recommendedBuild': role == 'pharmacy' && !allMandatory ? 1049 : 1050,
          'mandatoryAfter': '2026-10-30T10:00:00Z',
        },
    },
  },
};
