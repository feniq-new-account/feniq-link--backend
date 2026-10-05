import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/core/widgets/app_refresh_indicator.dart';

Future<int> _pull(WidgetTester tester, {required Widget Function(Future<void> Function()) build, required double distance}) async {
  var refreshes = 0;
  await tester.pumpWidget(build(() async => refreshes++));
  await tester.fling(find.text('row 0'), Offset(0, distance), 1000);
  await tester.pumpAndSettle();
  return refreshes;
}

Widget _list(Widget Function(Widget list) wrap) {
  return MaterialApp(
    home: Scaffold(
      body: wrap(
        ListView.builder(
          physics: const AlwaysScrollableScrollPhysics(),
          itemCount: 30,
          itemBuilder: (_, i) => SizedBox(height: 50, child: Text('row $i')),
        ),
      ),
    ),
  );
}

void main() {
  testWidgets('a pull the stock indicator accepts is not enough here', (tester) async {
    const distance = 260.0;

    final stock = await _pull(
      tester,
      distance: distance,
      build: (onRefresh) => _list((list) => RefreshIndicator(onRefresh: onRefresh, child: list)),
    );
    expect(stock, 1, reason: 'sanity: the stock indicator refreshes on this pull');

    final app = await _pull(
      tester,
      distance: distance,
      build: (onRefresh) => _list((list) => AppRefreshIndicator(onRefresh: onRefresh, child: list)),
    );
    expect(app, 0);
  });

  testWidgets('a long, deliberate pull still refreshes', (tester) async {
    final refreshes = await _pull(
      tester,
      distance: 560,
      build: (onRefresh) => _list((list) => AppRefreshIndicator(onRefresh: onRefresh, child: list)),
    );
    expect(refreshes, 1);
  });
}
