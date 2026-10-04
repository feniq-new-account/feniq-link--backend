import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

/// One saved JSON document and when it was saved.
class SavedEntry {
  const SavedEntry({required this.savedAt, required this.data});

  final DateTime savedAt;
  final Object? data;
}

/// Saves server responses as JSON files in the app's private folder, so the
/// catalog can be shown again without a connection.
///
/// Every method is best effort and never throws: a disk that is full or a file
/// that is damaged just means there is no saved copy, which is exactly the
/// situation the app was in before this existed.
class OfflineStore {
  OfflineStore({Future<Directory> Function()? directoryProvider})
    : _directoryProvider = directoryProvider ?? _defaultDirectory;

  final Future<Directory> Function() _directoryProvider;

  static Future<Directory> _defaultDirectory() async {
    final base = await getApplicationSupportDirectory();
    return Directory('${base.path}${Platform.pathSeparator}offline');
  }

  static String _safe(String name) => name.replaceAll(RegExp(r'[^A-Za-z0-9_\-]'), '_');

  Future<File> _file(String name) async {
    final dir = await _directoryProvider();
    if (!await dir.exists()) await dir.create(recursive: true);
    return File('${dir.path}${Platform.pathSeparator}${_safe(name)}.json');
  }

  Future<SavedEntry?> read(String name) async {
    try {
      final file = await _file(name);
      if (!await file.exists()) return null;
      final text = await file.readAsString();
      // A whole warehouse catalog is megabytes: decode it off the UI thread.
      final decoded = text.length > 100000 ? await compute(_decodeJson, text) : jsonDecode(text);
      if (decoded is! Map) return null;
      final savedAt = DateTime.tryParse(decoded['savedAt'] as String? ?? '');
      if (savedAt == null) return null;
      return SavedEntry(savedAt: savedAt, data: decoded['data']);
    } catch (_) {
      return null;
    }
  }

  /// [offThread]: encode on another isolate - for the megabytes of a whole
  /// catalog, so the screen does not stutter while it is being saved.
  Future<void> write(String name, Object? data, {DateTime? savedAt, bool offThread = false}) async {
    try {
      final file = await _file(name);
      final stamp = (savedAt ?? DateTime.now()).toIso8601String();
      final text = offThread ? await compute(_encodeEntry, (stamp, data)) : _encodeEntry((stamp, data));
      // Written under another name and renamed, so a reader (or a crash in the
      // middle of the write) never meets half a file.
      final temporary = File('${file.path}.tmp');
      await temporary.writeAsString(text, flush: true);
      await temporary.rename(file.path);
    } catch (_) {
      // No saved copy this time; nothing else depends on it.
    }
  }

  /// Forgets everything - the next person to sign in on this phone must not
  /// find the previous pharmacy's copy.
  Future<void> clear() async {
    try {
      final dir = await _directoryProvider();
      if (await dir.exists()) await dir.delete(recursive: true);
    } catch (_) {
      // Nothing to do about a folder that cannot be removed.
    }
  }
}

Object? _decodeJson(String text) => jsonDecode(text);

String _encodeEntry((String, Object?) entry) => jsonEncode({'savedAt': entry.$1, 'data': entry.$2});
