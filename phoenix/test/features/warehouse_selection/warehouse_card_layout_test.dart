import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:feniq/core/widgets/sliver_row_grid.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/theme/dark_theme.dart';
import 'package:feniq/core/theme/light_theme.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/features/warehouse_selection/data/models/warehouse_model.dart';
import 'package:feniq/features/warehouse_selection/presentation/widgets/warehouse_card.dart';
import 'package:feniq/generated/app_localizations.dart';

// The square tile prioritizes a large warehouse logo and full names.
void main() {
  setUpAll(() async {
    await (FontLoader('MaterialIcons')..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
    for (final family in ['Readex', 'Plex']) {
      final loader = FontLoader(family);
      final prefix = family == 'Readex' ? 'ReadexPro' : 'IBMPlexSansArabic';
      for (final weight in [400, 500, 600, 700]) {
        loader.addFont(rootBundle.load('assets/fonts/$prefix-$weight.ttf'));
      }
      await loader.load();
    }
  });
  const tileSize = Size(171, 171);

  WarehouseModel warehouse({String? name, String? logo}) => WarehouseModel(
    id: 'w1',
    nameAr: name ?? 'مستودع اللاذقية',
    nameEn: name ?? 'Latakia Warehouse',
    city: 'Latakia',
    phone: '0940000001',
    logo: logo,
  );

  Future<void> pumpCard(
    WidgetTester tester, {
    required ThemeData theme,
    required Locale locale,
    WarehouseModel? model,
    double textScale = 1.0,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: theme,
        locale: locale,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: Center(
            child: MediaQuery(
              data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
              // As SliverRowGrid lays a card out: the tile's width, at least
              // its height, and as tall as the content needs.
              child: SizedBox(
                width: tileSize.width,
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: tileSize.height),
                  child: IntrinsicHeight(
                    child: WarehouseCard(warehouse: model ?? warehouse(), onSelect: () {}),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('fits its grid tile in light mode', (tester) async {
    await pumpCard(tester, theme: LightTheme.data, locale: const Locale('en'));

    expect(find.text('Latakia Warehouse'), findsOneWidget);
    expect(find.text('Latakia'), findsOneWidget);
    expect(find.byType(OutlinedButton), findsNothing);
    expect(WarehouseCard.logoHeight, greaterThan(40));
    expect(tester.takeException(), isNull);
  });

  testWidgets('fits its grid tile in dark mode', (tester) async {
    // The card draws every colour through AppColors.*Of(context), so dark mode
    // is a matter of the theme resolving - but the layout has to hold up in it
    // just the same.
    await pumpCard(tester, theme: DarkTheme.data, locale: const Locale('en'));

    expect(find.text('Latakia Warehouse'), findsOneWidget);
    expect(find.byType(CustomCard), findsOneWidget);
    // The label was once drawn in navyOf, which in night mode is the card's
    // own fill colour - present in the tree, invisible on screen.
    expect(find.byType(OutlinedButton), findsNothing);
  });

  testWidgets('fits its grid tile in Arabic, right to left', (tester) async {
    await pumpCard(tester, theme: LightTheme.data, locale: const Locale('ar'));

    expect(find.text('مستودع اللاذقية'), findsOneWidget);
    expect(Directionality.of(tester.element(find.byType(WarehouseCard))), TextDirection.rtl);
  });

  testWidgets('survives a name far longer than the tile', (tester) async {
    await pumpCard(
      tester,
      theme: LightTheme.data,
      locale: const Locale('en'),
      model: warehouse(name: 'A Very Long Warehouse Name That Will Not Fit On Two Lines Either'),
    );

    expect(find.byType(WarehouseCard), findsOneWidget);
    // The whole name, never cut off with "...".
    final name = tester.widget<Text>(find.text('A Very Long Warehouse Name That Will Not Fit On Two Lines Either'));
    expect(name.maxLines, isNull);
    expect(name.overflow, isNot(TextOverflow.ellipsis));
    // The city pill must survive the name, not be pushed out by it.
    expect(find.text('Latakia'), findsOneWidget);
    expect(find.byType(OutlinedButton), findsNothing);
  });

  testWidgets('survives a larger accessibility text scale', (tester) async {
    await pumpCard(tester, theme: LightTheme.data, locale: const Locale('en'), textScale: 1.3);

    expect(find.byType(WarehouseCard), findsOneWidget);
    expect(find.byType(OutlinedButton), findsNothing);
  });

  testWidgets('survives a long name at a larger text scale together', (tester) async {
    // The worst case the tile height is sized for: a name wrapping to two
    // lines, with every line taller.
    await pumpCard(
      tester,
      theme: LightTheme.data,
      locale: const Locale('ar'),
      model: warehouse(name: 'مستودع النور الطبي الكبير للتوزيع والتجارة'),
      textScale: 1.3,
    );

    expect(find.text('Latakia'), findsOneWidget);
    expect(find.byType(OutlinedButton), findsNothing);
  });

  testWidgets('a warehouse with no logo still draws its placeholder', (tester) async {
    await pumpCard(tester, theme: LightTheme.data, locale: const Locale('en'));

    // No network image is attempted for a null logo - the card falls back to
    // the shipping glyph, which is what a not-yet-branded warehouse shows.
    expect(find.byIcon(Icons.local_shipping_outlined), findsOneWidget);
  });
  for (final width in [320.0, 360.0, 390.0, 768.0, 1024.0]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('real Arabic grid at width $width and text $scale', (tester) async {
        tester.view.physicalSize = Size(width, 1200);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        await tester.pumpWidget(
          MaterialApp(
            locale: const Locale('ar'),
            theme: LightTheme.data,
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: MediaQuery(
              data: MediaQueryData(size: Size(width, 1200), textScaler: TextScaler.linear(scale)),
              child: Scaffold(
                body: RepaintBoundary(
                  key: const ValueKey('capture'),
                  child: CustomScrollView(
                    slivers: [
                      SliverPadding(
                        padding: const EdgeInsets.all(20),
                        sliver: SliverRowGrid(
                          maxCrossAxisExtent: scale > 1.3 && width < 600 ? width : 210,
                          cellAspectRatio: scale > 1.3 ? null : 1,
                          crossAxisSpacing: 12,
                          mainAxisSpacing: 12,
                          itemCount: 4,
                          itemBuilder: (context, index) => WarehouseCard(
                            warehouse: warehouse(name: index == 3 ? 'مستودع النور الطبي للتوزيع' : 'النجاح'),
                            onSelect: () {},
                                                      ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        final first = tester.getSize(find.byType(WarehouseCard).first);
        if (scale == 1 && width >= 360) expect(first.height, closeTo(first.width, 1));
        expect(find.byType(OutlinedButton), findsNothing);
        final captureDir = Platform.environment['FENIQ_CAPTURE_DIR'];
        if (captureDir != null) {
          final boundary = tester.renderObject<RenderRepaintBoundary>(find.byKey(const ValueKey('capture')));
          await tester.runAsync(() async {
            final picture = await boundary.toImage(pixelRatio: 1);
            final bytes = await picture.toByteData(format: ui.ImageByteFormat.png);
            await Directory(captureDir).create(recursive: true);
            await File('$captureDir/warehouses-$width-$scale.png').writeAsBytes(bytes!.buffer.asUint8List());
            picture.dispose();
          });
        }
      });
    }
  }
}
