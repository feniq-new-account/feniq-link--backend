import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:feniq/features/pharmacy_license/data/pharmacy_license_repository.dart';

/// Pharmacy-owned licence review. No public file links or cached documents.
class PharmacyLicenseView extends StatefulWidget {
  const PharmacyLicenseView({super.key, required this.repository, this.imagePicker});

  final PharmacyLicenseRepository repository;
  final ImagePicker? imagePicker;

  @override
  State<PharmacyLicenseView> createState() => _PharmacyLicenseViewState();
}

class _PharmacyLicenseViewState extends State<PharmacyLicenseView> {
  PharmacyLicenseStatus? _status;
  bool _loading = true;
  bool _sending = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  bool get _arabic => Localizations.localeOf(context).languageCode == 'ar';
  String _tr(String ar, String en) => _arabic ? ar : en;

  Future<void> _refresh() async {
    if (!_loading && mounted) setState(() => _loading = true);
    try {
      final status = await widget.repository.fetchStatus();
      if (!mounted) return;
      setState(() {
        _status = status;
        _error = null;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = _tr('تعذر تحميل حالة الترخيص. حاول مجدداً.',
            'Unable to load licence status. Please retry.');
      });
    }
  }

  Future<void> _send(ImageSource source) async {
    if (_sending || _status?.status == 'approved') return;
    final image = await (widget.imagePicker ?? ImagePicker()).pickImage(
      source: source,
      maxWidth: 1600,
      maxHeight: 1600,
      imageQuality: 78,
    );
    if (image == null || !mounted) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final status = await widget.repository.submitPhoto(image);
      if (!mounted) return;
      setState(() => _status = status);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(_tr('تم استلام الوثيقة للمراجعة.',
            'Document submitted for review.')),
      ));
    } on FormatException {
      if (!mounted) return;
      setState(() {
        _error = _tr(
          'الصورة يجب أن تكون JPG أو PNG وحجمها أقل من 2 ميغابايت.',
          'Upload a JPG or PNG image smaller than 2MB.',
        );
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = _tr('فشل رفع الوثيقة. تحقق من الإنترنت وحاول مجدداً.',
            'Upload failed. Check your connection and retry.');
      });
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  String _statusLabel(String status) => switch (status) {
    'pending' => _tr('قيد مراجعة الإدارة', 'Awaiting admin review'),
    'approved' => _tr('تم قبول الرخصة', 'Licence approved'),
    'rejected' => _tr('تحتاج إعادة رفع', 'Resubmission required'),
    _ => _tr('لم تُرسل الرخصة بعد', 'No licence submitted'),
  };

  String _date(DateTime date) {
    final local = date.toLocal();
    String two(int n) => n.toString().padLeft(2, '0');
    return local.year.toString() + '-' + two(local.month) + '-' + two(local.day);
  }

  @override
  Widget build(BuildContext context) {
    final status = _status;
    final canUpload = !_loading && !_sending && status != null &&
        status.status != 'approved';

    return Scaffold(
      appBar: AppBar(title: Text(_tr('توثيق الصيدلية', 'Pharmacy verification'))),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              const Icon(Icons.verified_user_outlined, size: 64),
              const SizedBox(height: 16),
              Text(_tr('وثيقة ترخيص الصيدلية', 'Pharmacy licence document'),
                style: Theme.of(context).textTheme.titleLarge,
                textAlign: TextAlign.center),
              const SizedBox(height: 12),
              Text(_tr(
                'ارفع صورة واضحة عن رخصة الصيدلية. الملف خاص ولا يظهر للصيدليات أو المستودعات الأخرى.',
                'Upload a clear photo of your pharmacy licence. Only authorized administrators can review it.'),
                textAlign: TextAlign.center),
              const SizedBox(height: 24),
              if (_loading) const Center(child: CircularProgressIndicator()),
              if (status != null && !_loading)
                Card(child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(_statusLabel(status.status),
                          style: Theme.of(context).textTheme.titleMedium),
                      if (status.submittedAt != null) ...[
                        const SizedBox(height: 8),
                        Text(_tr('آخر إرسال: ', 'Submitted: ') + _date(status.submittedAt!)),
                      ],
                      if (status.dueAt != null) ...[
                        const SizedBox(height: 8),
                        Text(_tr('نهاية مهلة التوثيق: ', 'Verification deadline: ') + _date(status.dueAt!)),
                      ],
                      if (status.reviewNote.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Text(_tr('ملاحظة الإدارة: ', 'Review note: ') + status.reviewNote),
                      ],
                    ],
                  ),
                )),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                TextButton.icon(
                  onPressed: _refresh,
                  icon: const Icon(Icons.refresh),
                  label: Text(_tr('إعادة المحاولة', 'Retry')),
                ),
              ],
              const SizedBox(height: 24),
              if (status?.status == 'not_submitted' || status?.status == 'rejected') ...[
                FilledButton.icon(
                  onPressed: canUpload ? () => _send(ImageSource.gallery) : null,
                  icon: const Icon(Icons.photo_library_outlined),
                  label: Text(_tr('اختيار صورة الرخصة', 'Choose licence photo')),
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: canUpload ? () => _send(ImageSource.camera) : null,
                  icon: const Icon(Icons.camera_alt_outlined),
                  label: Text(_tr('تصوير الرخصة', 'Take a licence photo')),
                ),
              ],
              if (_sending) const Padding(
                padding: EdgeInsets.all(16),
                child: Center(child: CircularProgressIndicator()),
              ),
              const SizedBox(height: 16),
              Text(_tr('الصيغ المدعومة: JPG وPNG، بحد أقصى 2 ميغابايت.',
                'Accepted: JPG/PNG images up to 2MB.'),
                style: Theme.of(context).textTheme.bodySmall,
                textAlign: TextAlign.center),
            ],
          ),
        ),
      ),
    );
  }
}
