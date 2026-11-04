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
  Future<void> _operations = Future<void>.value();
  int _generation = 0;

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
    final generation = _generation;
    await _operations;
    if (generation != _generation) return null;
    try {
      final file = await _file(name);
      if (!await file.exists()) return null;
      final text = await file.readAsString();
      // A whole warehouse catalog is megabytes: decode it off the UI thread.
      final decoded = text.length > 100000 ? await compute(_decodeJson, text) : jsonDecode(text);
      if (decoded is! Map) return null;
      final savedAt = DateTime.tryParse(decoded['savedAt'] as String? ?? '');
      if (savedAt == null) return null;
      if (generation != _generation) return null;
      return SavedEntry(savedAt: savedAt, data: decoded['data']);
    } catch (_) {
      return null;
    }
  }

  Future<void> write(String name, Object? data, {DateTime? savedAt}) async {
    await writeConfirmed(name, data, savedAt: savedAt);
  }

  /// True only after an atomic durable write. A failed save must never be
  /// advertised as an offline-ready catalog. Writes and sign-out deletion are
  /// serialized so an older write cannot resurrect another account's files.
  Future<bool> writeConfirmed(String name, Object? data, {DateTime? savedAt}) {
    final generation = _generation;
    final result = _operations.then((_) async {
      if (generation != _generation) return false;
      try {
        final file = await _file(name);
        final text = jsonEncode({'savedAt': (savedAt ?? DateTime.now()).toIso8601String(), 'data': data});
        final temporary = File('${file.path}.tmp');
        await temporary.writeAsString(text, flush: true);
        if (generation != _generation) {
          await temporary.delete();
          return false;
        }
        await temporary.rename(file.path);
        return true;
      } catch (_) {
        return false;
      }
    });
    _operations = result.then((_) {});
    return result;
  }

  /// Forgets everything - the next person to sign in on this phone must not
  /// find the previous pharmacy's copy.
  Future<void> clear() {
    _generation++;
    final result = _operations.then((_) async {
      try {
        final dir = await _directoryProvider();
        if (await dir.exists()) await dir.delete(recursive: true);
      } catch (_) {
        // A failed deletion must not crash sign-out.
      }
    });
    _operations = result;
    return result;
  }
}

Object? _decodeJson(String text) => jsonDecode(text);
