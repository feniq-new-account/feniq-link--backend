/// What a pharmacy's visit QR carries: `FENIQ-VISIT:<code>`
/// (backend/src/services/pharmacyVisitCode.service.js). The prefix lets the
/// scanner tell a Feniq sticker from any other QR code it is pointed at.
const String visitCodePrefix = 'FENIQ-VISIT:';

bool looksLikeVisitCode(String? raw) {
  if (raw == null) return false;
  final text = raw.trim().toUpperCase();
  return text.startsWith(visitCodePrefix) && text.length > visitCodePrefix.length;
}
