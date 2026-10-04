import 'package:feniq/features/medicine_directory/data/medicine_directory.dart';

/// What a [MedicineDirectoryRepository.sync] ended up doing.
enum DirectorySyncOutcome {
  /// There was no copy on the phone: the whole list was downloaded.
  downloaded,

  /// A copy was there: only what changed since was fetched and folded in.
  updated,

  /// The copy on the phone is recent enough; nothing was asked of the server.
  upToDate,
}

/// The medicine list the phone keeps for browsing and searching with no
/// connection. The first download is the whole list (about 13,000 medicines);
/// every later one is only what changed.
abstract class MedicineDirectoryRepository {
  /// The copy already in memory, if any.
  MedicineDirectory? get current;

  /// The copy in memory, else the one saved on the phone; null if there is
  /// none. Never throws.
  Future<MedicineDirectory?> load();

  /// Brings the saved copy up to date. A copy younger than [freshness] is left
  /// alone unless [force]. [onProgress] hears how many medicines have arrived
  /// and how many there are in all (during the first full download).
  ///
  /// Throws a `Failure` when the server cannot be reached or refuses; the copy
  /// that was there is kept.
  Future<DirectorySyncOutcome> sync({bool force = false, void Function(int loaded, int total)? onProgress});
}
