import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

/// One invoice line, already in the figures the screen shows (SYP, locked in
/// at order time). Nothing here is recomputed except quantity x unit price
/// where the screen does the same.
@immutable
class InvoicePdfLine {
  const InvoicePdfLine({
    required this.name,
    required this.quantity,
    required this.unitPriceSyp,
    required this.lineTotalSyp,
    this.freeQuantity = 0,
    this.manufacturer,
  });

  final String name;
  final String? manufacturer;
  final int quantity;
  final int freeQuantity;
  final num unitPriceSyp;
  final num lineTotalSyp;
}

/// A totals row (subtotal, each discount, the total). Discounts are passed
/// as negative amounts, exactly as the invoice card lists them.
@immutable
class InvoicePdfTotal {
  const InvoicePdfTotal(this.label, this.amountSyp, {this.emphasized = false});

  final String label;
  final num amountSyp;
  final bool emphasized;
}

/// Everything printed on the PDF, with every label already translated so the
/// builder stays free of BuildContext and is testable on its own.
@immutable
class InvoicePdfData {
  const InvoicePdfData({
    required this.title,
    required this.orderNumber,
    required this.rtl,
    required this.currencySuffix,
    required this.lines,
    required this.totals,
    required this.headers,
    this.date,
    this.fromLabel,
    this.toLabel,
    this.footer,
  });

  final String title;
  final int orderNumber;
  final DateTime? date;

  /// e.g. "Warehouse: Al Amal" / "Pharmacy: Al Nour".
  final String? fromLabel;
  final String? toLabel;
  final bool rtl;
  final String currencySuffix;
  final List<InvoicePdfLine> lines;
  final List<InvoicePdfTotal> totals;

  /// Column headers: item, quantity, unit price, line total.
  final InvoicePdfHeaders headers;
  final String? footer;

  /// The file name the save/share sheet suggests.
  String get fileName => 'feniq-invoice-$orderNumber.pdf';
}

@immutable
class InvoicePdfHeaders {
  const InvoicePdfHeaders({
    required this.item,
    required this.quantity,
    required this.unitPrice,
    required this.lineTotal,
    required this.free,
  });

  final String item;
  final String quantity;
  final String unitPrice;
  final String lineTotal;

  /// Prefix for the bonus units, e.g. "+2 free".
  final String free;
}

final NumberFormat _grouped = NumberFormat('#,##0', 'en');

/// Whole-lira amount with separators and a plain minus - no Unicode bidi
/// isolates (the app's on-screen formatter uses them, but PDF fonts draw
/// them as boxes).
@visibleForTesting
String pdfMoney(num amount, String suffix) {
  final digits = _grouped.format(amount.abs().round());
  return '${amount < 0 ? '-' : ''}$digits $suffix';
}

/// yyyy/MM/dd HH:mm in local time with Latin digits. Built by hand: intl's
/// DateFormat needs locale data the PDF builder should not depend on.
@visibleForTesting
String pdfDate(DateTime date) {
  final d = date.toLocal();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${d.year}/${two(d.month)}/${two(d.day)} ${two(d.hour)}:${two(d.minute)}';
}

/// Fonts for the PDF. Arabic comes from Noto Sans Arabic, which carries the
/// presentation-form glyphs the pdf package shapes Arabic with (the app's UI
/// fonts do not, and print Arabic as boxes). It has no Latin, so IBM Plex Sans
/// Arabic - already bundled - is the fallback for English names and digits.
class InvoicePdfFonts {
  InvoicePdfFonts(this.regular, this.bold, this.fallback);

  final pw.Font regular;
  final pw.Font bold;
  final List<pw.Font> fallback;

  static InvoicePdfFonts? _cached;

  static Future<InvoicePdfFonts> load() async {
    if (_cached != null) return _cached!;
    Future<pw.Font> font(String path) async => pw.Font.ttf(await rootBundle.load(path));
    return _cached = InvoicePdfFonts(
      await font('assets/fonts/pdf/NotoSansArabic-Regular.ttf'),
      await font('assets/fonts/pdf/NotoSansArabic-Bold.ttf'),
      [await font('assets/fonts/IBMPlexSansArabic-400.ttf'), await font('assets/fonts/IBMPlexSansArabic-700.ttf')],
    );
  }
}

final RegExp _arabic = RegExp(r'[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]');

final RegExp _latinLetter = RegExp('[A-Za-z]');

/// The direction one piece of text is laid out in, whatever the page's:
/// no Arabic letter (an English name, a date, a number) is left-to-right,
/// Arabic without Latin letters is right-to-left, and a mixed string follows
/// the page. Otherwise the page's direction reverses the other script
/// ("Panadol" -> "lodanaP" on an Arabic page, and the mirror on an English one).
@visibleForTesting
pw.TextDirection pdfDirectionFor(String text, pw.TextDirection page) {
  if (!_arabic.hasMatch(text)) return pw.TextDirection.ltr;
  if (!_latinLetter.hasMatch(text)) return pw.TextDirection.rtl;
  return page;
}

// A run of Latin text (an English name, a code), with a bracket hugging it.
final RegExp _latinRun = RegExp(r"\(?[A-Za-z](?:[A-Za-z0-9 .,_\-/%+&']*[A-Za-z0-9.%])?\)?");

/// Splits [text] into pieces that each lay out in one direction: Latin runs
/// (left-to-right) and everything else. The pdf package draws Latin through
/// the fallback font and reverses it inside a right-to-left line, so a mixed
/// label ("كود الخصم (EID25)") is built from separate pieces instead.
@visibleForTesting
List<String> pdfRuns(String text) {
  final runs = <String>[];
  var at = 0;
  for (final match in _latinRun.allMatches(text)) {
    if (match.start > at) runs.add(text.substring(at, match.start));
    runs.add(match.group(0)!);
    at = match.end;
  }
  if (at < text.length) runs.add(text.substring(at));
  return runs;
}

/// Builds the invoice as PDF bytes (A4, one or more pages).
Future<Uint8List> buildInvoicePdf(InvoicePdfData data, InvoicePdfFonts fonts) async {
  final direction = data.rtl ? pw.TextDirection.rtl : pw.TextDirection.ltr;
  final theme = pw.ThemeData.withFont(base: fonts.regular, bold: fonts.bold, fontFallback: fonts.fallback);
  final doc = pw.Document(title: '${data.title} #${data.orderNumber}', creator: 'Feniq');
  final grey = PdfColor.fromHex('#6B7280');
  final navy = PdfColor.fromHex('#0F2A44');
  final dateText = data.date == null ? null : pdfDate(data.date!);

  // Text that keeps an English-only string left-to-right, still aligned to the
  // page's reading side unless told otherwise.
  pw.Widget t(String text, {pw.TextStyle? style, pw.TextAlign? align}) {
    final runs = pdfRuns(text);
    if (runs.length <= 1 || !_arabic.hasMatch(text)) {
      return pw.Text(
        text,
        style: style,
        textDirection: pdfDirectionFor(text, direction),
        textAlign: align ?? (data.rtl ? pw.TextAlign.right : pw.TextAlign.left),
      );
    }
    // Mixed: one piece per direction, placed in reading order by the page's
    // direction (Wrap follows it), so each piece keeps its own direction.
    return pw.Wrap(
      children: [
        for (final run in runs)
          pw.Text(run, style: style, textDirection: pdfDirectionFor(run, direction)),
      ],
    );
  }

  // An amount, laid out like the app's own screen: "-1,500" with its minus
  // in front, and the currency suffix on the far side. An English page does
  // it as one left-to-right text. An Arabic page cannot: a right-to-left
  // line prints "1,500-", and a left-to-right one leaves the Arabic suffix
  // unreordered. So the figure (left-to-right) and the suffix (right-to-left)
  // are two pieces, and the page's direction places them (figure first, on
  // the reading side) - verified by rendering the PDF to an image.
  pw.Widget money(num amount, pw.TextStyle style) {
    if (!data.rtl) {
      return pw.Text(pdfMoney(amount, data.currencySuffix), style: style, textDirection: pw.TextDirection.ltr);
    }
    return pw.Wrap(
      spacing: 3,
      children: [
        pw.Text(pdfMoney(amount, '').trim(), style: style, textDirection: pw.TextDirection.ltr),
        pw.Text(data.currencySuffix, style: style, textDirection: pw.TextDirection.rtl),
      ],
    );
  }

  pw.Widget moneyCell(num amount) => pw.Padding(
        padding: const pw.EdgeInsets.symmetric(vertical: 4, horizontal: 4),
        child: money(amount, const pw.TextStyle(fontSize: 10)),
      );

  pw.Widget cell(String text, {bool bold = false, pw.TextAlign? align}) => pw.Padding(
        padding: const pw.EdgeInsets.symmetric(vertical: 4, horizontal: 4),
        child: t(text,
            align: align,
            style: pw.TextStyle(fontSize: 10, fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal)),
      );

  doc.addPage(
    pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(32),
      textDirection: direction,
      theme: theme,
      header: (context) => pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
            children: [
              pw.Text('${data.title} #${data.orderNumber}',
                  style: pw.TextStyle(fontSize: 18, fontWeight: pw.FontWeight.bold, color: navy)),
              t('Feniq', style: pw.TextStyle(fontSize: 14, fontWeight: pw.FontWeight.bold, color: navy)),
            ],
          ),
          if (dateText != null) t(dateText, style: pw.TextStyle(fontSize: 10, color: grey)),
          if (data.fromLabel != null) t(data.fromLabel!, style: const pw.TextStyle(fontSize: 11)),
          if (data.toLabel != null) t(data.toLabel!, style: const pw.TextStyle(fontSize: 11)),
          pw.SizedBox(height: 12),
        ],
      ),
      footer: (context) => pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          t(data.footer ?? '', style: pw.TextStyle(fontSize: 8, color: grey)),
          pw.Text('${context.pageNumber}/${context.pagesCount}', style: pw.TextStyle(fontSize: 8, color: grey)),
        ],
      ),
      build: (context) => [
        pw.Table(
          border: pw.TableBorder(horizontalInside: pw.BorderSide(color: PdfColor.fromHex('#E5E7EB'), width: 0.5)),
          columnWidths: const {
            0: pw.FlexColumnWidth(5),
            1: pw.FlexColumnWidth(1.4),
            2: pw.FlexColumnWidth(2.2),
            3: pw.FlexColumnWidth(2.4),
          },
          children: [
            pw.TableRow(
              decoration: pw.BoxDecoration(color: PdfColor.fromHex('#F3F4F6')),
              children: [
                cell(data.headers.item, bold: true),
                cell(data.headers.quantity, bold: true, align: pw.TextAlign.center),
                cell(data.headers.unitPrice, bold: true),
                cell(data.headers.lineTotal, bold: true),
              ],
            ),
            for (final line in data.lines)
              pw.TableRow(children: [
                pw.Padding(
                  padding: const pw.EdgeInsets.symmetric(vertical: 4, horizontal: 4),
                  child: pw.Column(
                    crossAxisAlignment: pw.CrossAxisAlignment.start,
                    children: [
                      t(line.name, style: const pw.TextStyle(fontSize: 10)),
                      if (line.manufacturer != null && line.manufacturer!.isNotEmpty)
                        t(line.manufacturer!, style: pw.TextStyle(fontSize: 8, color: grey)),
                    ],
                  ),
                ),
                pw.Padding(
                  padding: const pw.EdgeInsets.symmetric(vertical: 4, horizontal: 4),
                  child: pw.Column(
                    children: [
                      pw.Text('${line.quantity}', style: const pw.TextStyle(fontSize: 10)),
                      // Bonus units on their own line: a number inside a
                      // mixed Arabic/Latin bracket does not survive bidi.
                      if (line.freeQuantity > 0)
                        pw.Text('${data.headers.free}: ${line.freeQuantity}',
                            style: pw.TextStyle(fontSize: 8, color: grey)),
                    ],
                  ),
                ),
                moneyCell(line.unitPriceSyp),
                moneyCell(line.lineTotalSyp),
              ]),
          ],
        ),
        pw.SizedBox(height: 12),
        for (final total in data.totals)
          pw.Container(
            padding: const pw.EdgeInsets.symmetric(vertical: 2),
            decoration: total.emphasized
                ? pw.BoxDecoration(border: pw.Border(top: pw.BorderSide(color: navy, width: 1)))
                : null,
            child: pw.Row(
              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
              children: [
                t(total.label,
                    style: pw.TextStyle(
                        fontSize: total.emphasized ? 13 : 11,
                        fontWeight: total.emphasized ? pw.FontWeight.bold : pw.FontWeight.normal)),
                money(
                    total.amountSyp,
                    pw.TextStyle(
                        fontSize: total.emphasized ? 13 : 11,
                        fontWeight: total.emphasized ? pw.FontWeight.bold : pw.FontWeight.normal)),
              ],
            ),
          ),
      ],
    ),
  );
  return doc.save();
}
