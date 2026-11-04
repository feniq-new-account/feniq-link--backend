import 'dart:io';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/core/offline/permanent_image_store.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('catalog image files survive clearing the temporary cache directory', () async {
    final root = await Directory.systemTemp.createTemp('feniq_permanent_images');
    final support = Directory('${root.path}/support')..createSync();
    final temporary = Directory('${root.path}/cache')..createSync();
    const channel = MethodChannel('plugins.flutter.io/path_provider');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, (call) async {
      if (call.method == 'getApplicationSupportDirectory') return support.path;
      if (call.method == 'getTemporaryDirectory') return temporary.path;
      return null;
    });
    final manager = PermanentImageStore.instance.manager;
    try {
      final file = await manager.config.fileSystem.createFile('offline-medicine.webp');
      await file.writeAsBytes([1, 2, 3]);
      await temporary.delete(recursive: true);
      expect(file.path, startsWith(support.path));
      expect(await file.readAsBytes(), [1, 2, 3]);
      await manager.config.repo.open();
      expect((manager.config.repo as dynamic).path, startsWith(support.path));
    } finally {
      await manager.dispose();
      await root.delete(recursive: true);
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, null);
    }
  });
}
