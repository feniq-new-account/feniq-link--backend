import 'package:flutter/foundation.dart';

enum CatalogDownloadPhase { downloading, saved, failed }

class CatalogDownloadEntry {
  const CatalogDownloadEntry(this.phase, {this.savedAt, this.productCount = 0});
  final CatalogDownloadPhase phase;
  final DateTime? savedAt;
  final int productCount;
}

/// Readiness reflects durable complete files, not a page in memory.
class CatalogDownloadStatus {
  CatalogDownloadStatus._();
  static final instance = CatalogDownloadStatus._();
  final entries = ValueNotifier<Map<String, CatalogDownloadEntry>>(const {});
  void set(String id, CatalogDownloadEntry entry) => entries.value = {...entries.value, id: entry};
  void clear() => entries.value = const {};
}
