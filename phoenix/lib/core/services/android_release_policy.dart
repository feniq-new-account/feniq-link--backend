enum ReleaseUpdateStatus { none, optional, mandatory }

class AndroidRolePolicy {
  const AndroidRolePolicy({
    required this.minimumBuild,
    required this.recommendedBuild,
    this.mandatoryAfter,
  });
  final int minimumBuild;
  final int recommendedBuild;
  final DateTime? mandatoryAfter;
}

class AndroidReleasePolicy {
  const AndroidReleasePolicy({
    required this.latestBuild,
    required this.versionName,
    required this.apkUrl,
    required this.sha256,
    required this.size,
    required this.roles,
  });
  static const roleNames = ['pharmacy', 'rep', 'warehouse'];
  final int latestBuild;
  final String versionName;
  final String apkUrl;
  final String sha256;
  final int size;
  final Map<String, AndroidRolePolicy> roles;

  factory AndroidReleasePolicy.fromJson(Map<String, dynamic> json) {
    final build = json['latestBuild'];
    final size = json['size'];
    final sha = json['sha256'];
    final uri = Uri.tryParse(json['apkUrl'] as String? ?? '');
    if (build is! int ||
        build < 1 ||
        build > 2100000000 ||
        size is! int ||
        size < 500000 ||
        size > 200 * 1024 * 1024 ||
        sha is! String ||
        !RegExp(r'^[a-fA-F0-9]{64}$').hasMatch(sha) ||
        uri == null ||
        uri.scheme != 'https' ||
        !uri.hasAuthority ||
        uri.userInfo.isNotEmpty ||
        json['applicationId'] != 'com.feniq.link') {
      throw const FormatException('Invalid signed Android release metadata');
    }
    final rawRoles = json['roles'];
    if (rawRoles is! Map) throw const FormatException('Missing update roles');
    final policies = <String, AndroidRolePolicy>{};
    for (final name in roleNames) {
      final role = rawRoles[name];
      if (role is! Map) throw const FormatException('Missing update role');
      final minimum = role['minimumBuild'];
      final recommended = role['recommendedBuild'];
      final rawDate = role['mandatoryAfter'];
      final deadline = rawDate is String ? DateTime.tryParse(rawDate) : null;
      if (minimum is! int ||
          recommended is! int ||
          minimum < 1 ||
          recommended < minimum ||
          recommended > build ||
          (rawDate != null && deadline == null)) {
        throw const FormatException('Invalid role update policy');
      }
      policies[name] = AndroidRolePolicy(
        minimumBuild: minimum,
        recommendedBuild: recommended,
        mandatoryAfter: deadline,
      );
    }
    return AndroidReleasePolicy(
      latestBuild: build,
      versionName: json['versionName'] as String? ?? '',
      apkUrl: uri.toString(),
      sha256: sha.toLowerCase(),
      size: size,
      roles: policies,
    );
  }

  ReleaseUpdateStatus statusFor(
    String? role,
    int installedBuild,
    DateTime now,
  ) {
    if (installedBuild < 1) return ReleaseUpdateStatus.none;
    if (!roles.containsKey(role)) {
      // Do not lock a rep out of sign-in because the pharmacy role alone
      // requires a newer build. The actual role is checked after sign-in.
      final statuses = roleNames
          .map((name) => statusFor(name, installedBuild, now))
          .toList();
      if (statuses.every((status) => status == ReleaseUpdateStatus.mandatory)) {
        return ReleaseUpdateStatus.mandatory;
      }
      return statuses.any((status) => status != ReleaseUpdateStatus.none)
          ? ReleaseUpdateStatus.optional
          : ReleaseUpdateStatus.none;
    }
    final policy = roles[role]!;
    final due =
        policy.mandatoryAfter == null || !now.isBefore(policy.mandatoryAfter!);
    if (due && installedBuild < policy.minimumBuild) {
      return ReleaseUpdateStatus.mandatory;
    }
    if (installedBuild < policy.recommendedBuild) {
      return ReleaseUpdateStatus.optional;
    }
    return ReleaseUpdateStatus.none;
  }
}
