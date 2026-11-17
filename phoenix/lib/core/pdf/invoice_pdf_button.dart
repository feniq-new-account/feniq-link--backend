import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:printing/printing.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/pdf/invoice_pdf.dart';

/// How the finished PDF leaves the app. Both paths go through Android's own
/// pickers - the share sheet (WhatsApp, Drive, "Files"...) or the print
/// dialog's "Save as PDF" - so the app never needs a storage permission, let
/// alone "All files access".
abstract class InvoicePdfExporter {
  Future<void> share(Uint8List bytes, String fileName);
  Future<void> print(Uint8List bytes, String fileName);
}

class PrintingInvoicePdfExporter implements InvoicePdfExporter {
  const PrintingInvoicePdfExporter();

  @override
  Future<void> share(Uint8List bytes, String fileName) => Printing.sharePdf(bytes: bytes, filename: fileName);

  @override
  Future<void> print(Uint8List bytes, String fileName) =>
      Printing.layoutPdf(onLayout: (_) async => bytes, name: fileName);
}

/// App-bar button: "Save invoice as PDF". Opens a two-option sheet and builds
/// the PDF only when one is picked.
class InvoicePdfButton extends StatefulWidget {
  const InvoicePdfButton({
    super.key,
    required this.data,
    this.exporter = const PrintingInvoicePdfExporter(),
    this.builder = _defaultBuilder,
  });

  /// Read at tap time, so it always reflects the order as it is now.
  final InvoicePdfData Function() data;
  final InvoicePdfExporter exporter;
  final Future<Uint8List> Function(InvoicePdfData data) builder;

  static Future<Uint8List> _defaultBuilder(InvoicePdfData data) async =>
      buildInvoicePdf(data, await InvoicePdfFonts.load());

  @override
  State<InvoicePdfButton> createState() => _InvoicePdfButtonState();
}

enum _PdfAction { share, print }

class _InvoicePdfButtonState extends State<InvoicePdfButton> {
  bool _busy = false;

  Future<void> _open() async {
    final l10n = context.l10n;
    final action = await showModalBottomSheet<_PdfAction>(
      context: context,
      showDragHandle: true,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.ios_share),
              title: Text(l10n.invoicePdfShare),
              subtitle: Text(l10n.invoicePdfShareHint),
              onTap: () => Navigator.pop(sheet, _PdfAction.share),
            ),
            ListTile(
              leading: const Icon(Icons.print_outlined),
              title: Text(l10n.invoicePdfPrint),
              onTap: () => Navigator.pop(sheet, _PdfAction.print),
            ),
          ],
        ),
      ),
    );
    if (action == null || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = true);
    try {
      final data = widget.data();
      final bytes = await widget.builder(data);
      if (action == _PdfAction.share) {
        await widget.exporter.share(bytes, data.fileName);
      } else {
        await widget.exporter.print(bytes, data.fileName);
      }
    } catch (_) {
      messenger.showSnackBar(SnackBar(content: Text(l10n.invoicePdfFailed)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return IconButton(
      key: const ValueKey('invoice-pdf-button'),
      tooltip: context.l10n.invoicePdfAction,
      onPressed: _busy ? null : _open,
      icon: _busy
          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
          : const Icon(Icons.picture_as_pdf_outlined),
    );
  }
}
