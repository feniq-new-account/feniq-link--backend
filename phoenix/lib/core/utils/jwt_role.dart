import 'dart:convert';

/// The `role` claim of an access token, or null when the token is not a JWT
/// or carries none. Reads the payload only - it does not (cannot) verify the
/// signature, so it is good for choosing a home screen while offline and for
/// nothing the server has to enforce.
Map<String, dynamic>? _claimsFromJwt(String? token) {
  if (token == null) return null;
  final parts = token.split('.');
  if (parts.length != 3) return null;
  try {
    final payload = utf8.decode(base64Url.decode(base64Url.normalize(parts[1])));
    final decoded = jsonDecode(payload);
    return decoded is Map<String, dynamic> ? decoded : null;
  } catch (_) {
    return null;
  }
}

/// Only a local cache namespace during an offline start. This JWT payload is
/// unverified on the device and NEVER grants server permissions.
String? subjectFromJwt(String? token) {
  final subject = _claimsFromJwt(token)?['sub'];
  return subject is String && RegExp(r'^[a-fA-F0-9]{24}$').hasMatch(subject)
      ? subject : null;
}

String? roleFromJwt(String? token) {
  final role = _claimsFromJwt(token)?['role'];
  return role is String && role.isNotEmpty ? role : null;
}
