import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/features/catalog/presentation/widgets/catalog_search_bar.dart';

void main() {
  testWidgets('catalog search has search keyboard action and accessible clear target',
      (tester) async {
    final controller = TextEditingController();
    addTearDown(controller.dispose);
    final changed = <String>[];
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        appBar: AppBar(
          title: const Text('Medicine catalog'),
          bottom: CatalogSearchBar(
            controller: controller,
            hintText: 'Search medicines',
            onChanged: changed.add,
          ),
        ),
      ),
    ));
    final field = find.byType(TextField);
    expect(tester.widget<TextField>(field).textInputAction, TextInputAction.search);
    expect(find.text('Search medicines'), findsOneWidget);
    await tester.enterText(field, 'paracetamol');
    await tester.pump();
    expect(changed.last, 'paracetamol');
    final closeButton = find.widgetWithIcon(IconButton, Icons.close);
    expect(closeButton, findsOneWidget);
    expect(tester.getSize(closeButton).width, greaterThanOrEqualTo(44));
    expect(tester.getSize(closeButton).height, greaterThanOrEqualTo(44));
    await tester.tap(closeButton);
    await tester.pump();
    expect(controller.text, isEmpty);
    expect(changed.last, '');
    expect(find.byIcon(Icons.close), findsNothing);
  });
}
