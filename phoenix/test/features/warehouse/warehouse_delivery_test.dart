import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/theme/light_theme.dart';
import 'package:feniq/core/theme/dark_theme.dart';
import 'package:feniq/core/widgets/delivery_estimate_card.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_management_repository.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_delivery_view.dart';
import 'package:feniq/generated/app_localizations.dart';

class Repo extends Mock implements WarehouseManagementRepository {}

const estimate = {
  'zoneName': 'الريف الشمالي — منطقة توزيع مستودع النجاح',
  'fromBusiness': '2026-10-31 02:00',
  'toBusiness': '2026-11-01 02:00',
  'state': 'late',
  'revision': 0,
};
Map<String, dynamic> settings() => {
  'entitled': true,
  'settings': {
    'enabled': true,
    'revision': 2,
    'zones': [
      {
        '_id': 'zone1',
        'name': 'الريف الشمالي — المنطقة 2',
        'active': true,
        'preparationHours': 2,
        'slots': [
          {
            'weekday': 6,
            'departureTime': '10:00',
            'arrivalHours': 4,
            'cutoffHours': 12,
          },
        ],
        'exceptions': [],
      },
    ],
  },
};
void main() {
  setUpAll(() async {
    await (FontLoader(
      'MaterialIcons',
    )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
    for (final family in ['Readex', 'Plex']) {
      final loader = FontLoader(family);
      for (final weight in [400, 500, 600, 700]) {
        loader.addFont(
          rootBundle.load(
            'assets/fonts/${family == 'Readex' ? 'ReadexPro' : 'IBMPlexSansArabic'}-$weight.ttf',
          ),
        );
      }
      await loader.load();
    }
  });
  Future<void> mount(
    WidgetTester tester,
    Repo repo,
    Widget child,
    Size size,
    double scale,
    bool dark,
  ) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      RepositoryProvider<WarehouseManagementRepository>.value(
        value: repo,
        child: MaterialApp(
          locale: const Locale('ar'),
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          theme: LightTheme.data,
          darkTheme: DarkTheme.data,
          themeMode: dark ? ThemeMode.dark : ThemeMode.light,
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: TextScaler.linear(scale)),
            child: child!,
          ),
          home: RepaintBoundary(key: const Key('capture'), child: child),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
  }

  for (final size in [
    const Size(320, 640),
    const Size(390, 844),
    const Size(568, 320),
    const Size(768, 1024),
    const Size(1024, 768),
  ]) {
    for (final scale in [1.0, 2.0]) {
      for (final dark in [false, true]) {
        for (final page in ['settings', 'arrival']) {
          testWidgets('$page ${size.width}x${size.height} text=$scale dark=$dark', (
            tester,
          ) async {
            final repo = Repo();
            when(
              () => repo.getDeliverySettings(),
            ).thenAnswer((_) async => settings());
            await mount(
              tester,
              repo,
              page == 'settings'
                  ? const WarehouseDeliveryView()
                  : const Scaffold(
                      body: SingleChildScrollView(
                        child: Padding(
                          padding: EdgeInsets.all(16),
                          child: DeliveryEstimateCard(
                            estimate: estimate,
                            status: 'pending',
                          ),
                        ),
                      ),
                    ),
              size,
              scale,
              dark,
            );
            expect(tester.takeException(), isNull);
            if (page == 'settings') {
              // The below-fold time fields must stay usable at 2x text and landscape.
              await tester.scrollUntilVisible(
                find.text('حفظ الجدول'),
                250,
                scrollable: find.byType(Scrollable).first,
              );
              await tester.pump();
              expect(tester.takeException(), isNull);
            }
            final folder = Platform.environment['FENIQ_CAPTURE_DIR'];
            if (folder != null) {
              await tester.runAsync(() async {
                final boundary = tester.renderObject<RenderRepaintBoundary>(
                  find.byKey(const Key('capture')),
                );
                final picture = await boundary.toImage();
                final bytes = await picture.toByteData(
                  format: ui.ImageByteFormat.png,
                );
                await File(
                  '$folder/$page-${size.width}-${size.height}-$scale-$dark.png',
                ).writeAsBytes(bytes!.buffer.asUint8List());
                picture.dispose();
              });
            }
            await tester.pumpWidget(const SizedBox());
          });
        }
      }
    }
  }
  testWidgets('failed assignment restores the stored region selection', (
    tester,
  ) async {
    final repo = Repo();
    when(() => repo.getDeliverySettings()).thenAnswer((_) async => settings());
    when(() => repo.searchDeliveryPharmacies('AA')).thenAnswer(
      (_) async => [
        {
          'id': 'ph1',
          'nameAr': 'صيدلية A',
          'city': 'Latakia',
          'address': 'Street',
          'assignment': {'zoneId': null, 'revision': 0},
        },
      ],
    );
    when(
      () => repo.assignDeliveryPharmacy('ph1', 'zone1', 0),
    ).thenThrow(Exception('network'));
    await mount(
      tester,
      repo,
      const WarehouseDeliveryView(),
      const Size(390, 844),
      1,
      false,
    );
    final search = find.byKey(const Key('delivery-pharmacy-search'));
    await tester.scrollUntilVisible(
      search,
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.enterText(search, 'AA');
    await tester.tap(find.text('بحث'));
    await tester.pump();
    final dropdown = find.byType(DropdownButtonFormField<String>);
    await tester.scrollUntilVisible(
      dropdown,
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pump();
    await tester.tap(dropdown);
    await tester.pumpAndSettle();
    await tester.tap(find.text('الريف الشمالي — المنطقة 2').last);
    await tester.pumpAndSettle();
    verify(() => repo.assignDeliveryPharmacy('ph1', 'zone1', 0)).called(1);
    expect(find.text('بلا منطقة — الموعد غير محدد'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
