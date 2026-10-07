import 'dart:convert';

/// The `role` claim of an access token, or null when the token is not a JWT
/// or carries none. Reads the payload only - it does not (cannot) verify the
/// signature, so it is good for choosing a home screen while offline and for
/// nothing the server has to enforce.
String? roleFromJwt(String? token) {
  if (token == null) return null;
  final parts = token.split('.');
  if (parts.length != 3) return null;
  try {
    final payload = utf8.decode(base64Url.decode(base64Url.normalize(parts[1])));
    final decoded = jsonDecode(payload);
    if (decoded is! Map<String, dynamic>) return null;
    final role = decoded['role'];
    return role is String && role.isNotEmpty ? role : null;
  } catch (_) {
    return null;
  }
}
