import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:feniq/core/pdf/invoice_pdf.dart';
import 'package:feniq/core/pdf/invoice_pdf_button.dart';
import 'package:feniq/core/pdf/invoice_pdf_mappers.dart';
import 'package:feniq/features/cart/data/models/order_model.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_order_models.dart';
import 'package:feniq/generated/app_localizations.dart';
import 'package:feniq/generated/app_localizations_ar.dart';

OrderModel _pharmacyOrder() => OrderModel.fromJson({
      'id': 'o1', 'orderNumber': 1042, 'status': 'delivered',
      'totalPrice': 30000, 'discountAmount': 1500, 'commissionAmount': 900,
      'loyaltyDiscountAmount': 500, 'creditUsedSyp': 0, 'finalPrice': 28000,
      'warehouseNameAr': 'مستودع الأمل', 'warehouseNameEn': 'Al Amal',
      'createdAt': '2026-11-17T10:30:00.000Z',
      'items': [
        {'id': 'i1', 'productId': 'p1', 'productNameAr': 'بنادول', 'productNameEn': 'Panadol',
          'manufacturerAr': 'جي إس كي', 'quantity': 2, 'unitPrice': 10000, 'discountPrice': 9000,
          'lineTotal': 18000, 'freeQuantity': 1},
        {'id': 'i2', 'productId': 'p2', 'productNameAr': 'سيتامول', 'quantity': 3,
          'unitPrice': 4000, 'discountPrice': 4000, 'lineTotal': 12000},
      ],
    });

WarehouseOrderDetail _warehouseOrder() => WarehouseOrderDetail.fromJson({
      'order': {
        'id': 'o1', 'orderNumber': 1042, 'status': 'confirmed',
        'pharmacy': {'id': 'ph', 'nameAr': 'صيدلية النور', 'nameEn': 'Al Nour'},
        'totalPrice': 30000, 'discountAmount': 1500, 'commissionAmount': 900,
        'finalPrice': 28000, 'loyaltyDiscountAmount': 500, 'warehouseNetSyp': 27100,
        'repCommission': {'rate': 0.02, 'repAmount': 300, 'feniqAmount': 600},
        'items': [
          {'id': 'i1', 'productNameAr': 'بنادول', 'productNameEn': 'Panadol', 'quantity': 2,
            'unitPrice': 10000, 'discountPrice': 9000, 'freeQuantity': 1},
        ],
      },
    });

void main() {
  final l10n = AppLocalizationsAr();

  test('money in the PDF has separators and a plain minus, no bidi marks', () {
    expect(pdfMoney(1500000, 'ل.س'), '1,500,000 ل.س');
    expect(pdfMoney(-1500, 'SYP'), '-1,500 SYP');
    expect(pdfMoney(-1500, 'SYP').runes.any((r) => r >= 0x2066 && r <= 0x2069), isFalse);
  });

  test('English runs inside Arabic labels are split out so they keep their own direction', () {
    expect(pdfRuns('كود الخصم (EID25)'), ['كود الخصم ', '(EID25)']);
    expect(pdfRuns('المستودع: Al Amal Pharma'), ['المستودع: ', 'Al Amal Pharma']);
    expect(pdfRuns('سيتامول'), ['سيتامول']);
    expect(pdfRuns('Panadol Extra 500mg'), ['Panadol Extra 500mg']);
  });

  test('each piece is laid out in its own script direction', () {
    expect(pdfDirectionFor('Panadol', pw.TextDirection.rtl), pw.TextDirection.ltr);
    expect(pdfDirectionFor('2026/11/17 10:30', pw.TextDirection.rtl), pw.TextDirection.ltr);
    expect(pdfDirectionFor('سيتامول', pw.TextDirection.ltr), pw.TextDirection.rtl);
    expect(pdfDirectionFor('كود (EID25)', pw.TextDirection.rtl), pw.TextDirection.rtl);
  });

  test('the PDF date is zero-padded with Latin digits', () {
    expect(pdfDate(DateTime(2026, 1, 5, 7, 3)), '2026/01/05 07:03');
  });

  test("the pharmacy's PDF lists the same rows as its invoice card", () {
    final data = pharmacyInvoicePdf(l10n, _pharmacyOrder(), arabic: true);
    expect(data.fileName, 'feniq-invoice-1042.pdf');
    expect(data.fromLabel, 'المستودع: مستودع الأمل');
    expect(data.rtl, isTrue);
    // Unit price is what the pharmacy pays per unit, so quantity x unit = line.
    for (final line in data.lines) {
      expect(line.unitPriceSyp * line.quantity, line.lineTotalSyp);
    }
    expect(data.lines.first.name, 'Panadol');
    expect(data.lines.first.freeQuantity, 1);
    expect(data.totals.map((t) => t.amountSyp).toList(), [30000, -1500, -500, 28000]);
    expect(data.totals.last.emphasized, isTrue);
    // Subtotal minus every discount row lands exactly on the total.
    final sum = data.totals.take(data.totals.length - 1).fold<num>(0, (a, t) => a + t.amountSyp);
    expect(sum, data.totals.last.amountSyp);
  });

  test("the warehouse's PDF prints what the pharmacy pays, never the rep or Feniq shares", () {
    final data = warehouseInvoicePdf(l10n, _warehouseOrder(), arabic: true);
    expect(data.toLabel, 'الصيدلية: صيدلية النور');
    expect(data.lines.single.lineTotalSyp, 18000);
    final labels = data.totals.map((t) => t.label).toList();
    expect(labels, isNot(contains(l10n.warehouseFeniqShare)));
    expect(labels, isNot(contains(l10n.warehouseRepShare)));
    expect(labels, isNot(contains(l10n.warehouseYouKeep)));
    expect(data.totals.map((t) => t.amountSyp).toList(), [30000, -1500, -500, 28000]);
  });

  testWidgets('a real Arabic PDF is built from the bundled font', (tester) async {
    final bytes = await tester.runAsync(() async {
      final fonts = await InvoicePdfFonts.load();
      return buildInvoicePdf(pharmacyInvoicePdf(l10n, _pharmacyOrder(), arabic: true), fonts);
    });
    expect(bytes, isNotNull);
    expect(ascii.decode(bytes!.sublist(0, 5)), '%PDF-');
    expect(bytes.length, greaterThan(2000));
  });

  testWidgets('the button builds the PDF and hands it to the share sheet, no file permission involved',
      (tester) async {
    final exporter = _FakeExporter();
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('ar'),
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(
        appBar: AppBar(actions: [
          InvoicePdfButton(
            data: () => pharmacyInvoicePdf(l10n, _pharmacyOrder(), arabic: true),
            exporter: exporter,
            builder: (_) async => Uint8List.fromList([1, 2, 3]),
          ),
        ]),
      ),
    ));
    await tester.tap(find.byKey(const ValueKey('invoice-pdf-button')));
    await tester.pumpAndSettle();
    expect(find.text('مشاركة أو حفظ بالملفات'), findsOneWidget);
    expect(find.text('طباعة أو «حفظ كـ PDF»'), findsOneWidget);

    await tester.tap(find.text('مشاركة أو حفظ بالملفات'));
    await tester.pumpAndSettle();
    expect(exporter.shared, ['feniq-invoice-1042.pdf']);
    expect(exporter.printed, isEmpty);

    await tester.tap(find.byKey(const ValueKey('invoice-pdf-button')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('طباعة أو «حفظ كـ PDF»'));
    await tester.pumpAndSettle();
    expect(exporter.printed, ['feniq-invoice-1042.pdf']);
  });
}

class _FakeExporter implements InvoicePdfExporter {
  final shared = <String>[];
  final printed = <String>[];

  @override
  Future<void> share(Uint8List bytes, String fileName) async => shared.add(fileName);

  @override
  Future<void> print(Uint8List bytes, String fileName) async => printed.add(fileName);
}
