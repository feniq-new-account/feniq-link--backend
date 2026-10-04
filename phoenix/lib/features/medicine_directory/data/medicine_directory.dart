import 'package:feniq/core/offline/medicine_keys.dart';

/// One medicine of the central catalog as the phone keeps it: the row the
/// server sent, plus two folded strings the searches compare against.
///
/// The row stays a plain map because that is exactly what is saved to disk and
/// merged on the next update; the getters read from it.
class DirectoryItem {
  DirectoryItem(this.row);

  final Map<String, dynamic> row;

  String get id => row['id'] as String? ?? '';
  String get nameAr => row['nameAr'] as String? ?? '';
  String? get nameEn => _text('nameEn');
  String get manufacturerAr => row['manufacturerAr'] as String? ?? '';
  String? get manufacturerEn => _text('manufacturerEn');
  String? get activeIngredient => _text('activeIngredient');
  String? get strength => _text('strength');
  String? get dosageForm => _text('dosageForm');
  String? get imageUrl => _text('imageUrl');

  /// Folded name, English name, company and English company, joined by spaces.
  String get searchKey => row[_searchKeyField] as String? ?? '';

  /// Folded active ingredient.
  String get ingredientKey => row[_ingredientKeyField] as String? ?? '';

  late final String? strengthKey = strengthKeyOf(strength);
  late final String? formKey = formKeyOf(dosageForm);

  String? _text(String field) {
    final value = row[field];
    return value is String && value.trim().isNotEmpty ? value : null;
  }

  /// Whether the line under the name has anything to say.
  bool get hasDetails => activeIngredient != null || strength != null || dosageForm != null;

  /// "PARACETAMOL · 500 MG/TAB. · أقراص", whatever of it is known.
  String get detailsLine => [activeIngredient, strength, dosageForm].whereType<String>().join(' · ');
}

const String _searchKeyField = 'k';
const String _ingredientKeyField = 'g';

/// The server's row with the two search strings added.
Map<String, dynamic> indexDirectoryRow(Map<String, dynamic> row) {
  String field(String name) => normalizeText(row[name] as String?);
  return {
    ...row,
    _searchKeyField: [
      field('nameAr'),
      field('nameEn'),
      field('manufacturerAr'),
      field('manufacturerEn'),
    ].where((part) => part.isNotEmpty).join(' '),
    _ingredientKeyField: field('activeIngredient'),
  };
}

/// Folds [incoming] into [existing] by id - a withdrawn item (`isActive` false)
/// is dropped, anything else replaces its older row - and returns the result
/// sorted by name with the search strings in place.
///
/// A top-level function over plain data so it can run on another isolate
/// (`compute`): indexing 13,000 names is work the screen must not wait for.
List<Map<String, dynamic>> mergeDirectoryRows(
  (List<Map<String, dynamic>> existing, List<Map<String, dynamic>> incoming) job,
) {
  final byId = <String, Map<String, dynamic>>{};
  for (final row in job.$1) {
    final id = row['id'];
    if (id is String) byId[id] = row;
  }
  for (final row in job.$2) {
    final id = row['id'];
    if (id is! String) continue;
    if (row['isActive'] == false) {
      byId.remove(id);
    } else {
      byId[id] = indexDirectoryRow(row);
    }
  }
  return byId.values.toList()
    ..sort((a, b) => ((a[_searchKeyField] as String?) ?? '').compareTo((b[_searchKeyField] as String?) ?? ''));
}

/// The whole medicine list as the phone last downloaded it: browsed and
/// searched on the phone, with or without a connection.
class MedicineDirectory {
  MedicineDirectory({required this.rows, required this.savedAt, this.serverTime})
    : items = [for (final row in rows) DirectoryItem(row)];

  /// The rows exactly as saved (sorted by name).
  final List<Map<String, dynamic>> rows;

  /// The same, wrapped for the screens.
  final List<DirectoryItem> items;

  /// When this copy was taken, by the phone's clock.
  final DateTime savedAt;

  /// The server's clock when it handed the first page over - the next update
  /// asks for what changed since then.
  final String? serverTime;

  int get length => items.length;

  /// The most alternatives one medicine lists.
  static const int alternativesLimit = 50;

  /// Rebuilds a copy from what [OfflineStore] saved; null for anything that is
  /// not one.
  static MedicineDirectory? fromEntry(DateTime savedAt, Object? data) {
    if (data is! Map) return null;
    final rows = data['items'];
    if (rows is! List) return null;
    return MedicineDirectory(
      rows: rows.whereType<Map<String, dynamic>>().toList(),
      savedAt: savedAt,
      serverTime: data['serverTime'] as String?,
    );
  }

  Map<String, Object?> toJson() => {'serverTime': serverTime, 'items': rows};

  /// Every medicine that matches [query]; all of them for an empty one.
  ///
  /// Each word has to be found in the name, the English name, the company or
  /// (from three letters on, so "ab" does not turn up half the list) the active
  /// ingredient - in any order, folded like the server folds: a different hamza
  /// or ta marbuta finds the same medicine.
  List<DirectoryItem> search(String query) {
    final words = normalizeText(query).split(' ').where((word) => word.isNotEmpty).toList();
    if (words.isEmpty) return items;
    return [
      for (final item in items)
        if (_matchesAll(item, words)) item,
    ];
  }

  static bool _matchesAll(DirectoryItem item, List<String> words) {
    final key = item.searchKey;
    final ingredient = item.ingredientKey;
    for (final word in words) {
      if (key.contains(word)) continue;
      if (word.length >= 3 && ingredient.contains(word)) continue;
      return false;
    }
    return true;
  }

  /// The other medicines with the same active ingredient, strength and kind of
  /// form - the substitutes a pharmacist can offer. Empty when [item] does not
  /// say all three.
  List<DirectoryItem> alternativesOf(DirectoryItem item) {
    final ingredient = item.ingredientKey;
    final strength = item.strengthKey;
    final form = item.formKey;
    if (ingredient.isEmpty || strength == null || form == null) return const [];
    final result = <DirectoryItem>[];
    for (final other in items) {
      if (other.id == item.id) continue;
      if (other.ingredientKey == ingredient && other.strengthKey == strength && other.formKey == form) {
        result.add(other);
        if (result.length >= alternativesLimit) break;
      }
    }
    return result;
  }
}
