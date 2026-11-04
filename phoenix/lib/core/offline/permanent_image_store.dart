import 'dart:async';
import 'package:file/file.dart' as fs;
import 'package:file/local.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:path_provider/path_provider.dart';
import 'package:feniq/core/utils/cloudinary_image.dart';

/// Image files AND their index live in application support, outside Android's
/// clear-cache directory. Public catalog thumbnails can be shared by accounts.
class PermanentImageStore {
  PermanentImageStore._();
  static final instance = PermanentImageStore._();
  late final manager = CacheManager(
    Config(
      'feniq-permanent-images-v1',
      stalePeriod: const Duration(days: 3650),
      maxNrOfCacheObjects: 100000,
      fileSystem: _SupportImageFiles(),
      repo: _SupportImageIndex(),
    ),
  );
  final Map<String, ({String url, bool framed})> _pending = {};
  bool _running = false;

  static String key(String url, {bool framed = false}) => '${framed ? 'medicine' : 'image'}:$url';

  /// Sequential, small thumbnails: never delays saving another catalog's data.
  void prefetch(Iterable<String> urls, {bool framed = false}) {
    for (final raw in urls) {
      final url = raw.trim();
      if (url.isEmpty || Uri.tryParse(url)?.scheme != 'https') continue;
      _pending[key(url, framed: framed)] = (url: url, framed: framed);
    }
    if (!_running) unawaited(_drain());
  }

  Future<void> _drain() async {
    _running = true;
    while (_pending.isNotEmpty) {
      final entry = _pending.entries.first;
      _pending.remove(entry.key);
      try {
        if (await manager.getFileFromCache(entry.key) != null) continue;
        final url = cloudinaryOptimizedUrl(entry.value.url, width: 384, height: 384, framed: entry.value.framed);
        await manager
            .getSingleFile(url, key: entry.key, headers: const {'Accept': 'image/webp,image/*;q=0.8'})
            .timeout(const Duration(seconds: 20));
      } catch (_) {
        // Data remains usable offline; a missing photo uses its placeholder
        // and is retried on the next sync or when the card is opened online.
      }
    }
    _running = false;
  }
}

Future<fs.Directory> _imageDirectory() async {
  final support = await getApplicationSupportDirectory();
  final dir = const LocalFileSystem().directory('${support.path}/catalog_images');
  await dir.create(recursive: true);
  return dir;
}

class _SupportImageFiles implements FileSystem {
  @override
  Future<fs.File> createFile(String name) async => (await _imageDirectory()).childFile(name);
}

class _SupportImageIndex extends JsonCacheInfoRepository {
  @override
  Future<bool> open() async {
    path ??= '${(await _imageDirectory()).path}/image_index.json';
    return super.open();
  }
}
