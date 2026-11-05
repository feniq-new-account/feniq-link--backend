import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';
import 'package:feniq/core/network/api_client.dart';

class PharmacyLicenseStatus {
  const PharmacyLicenseStatus({
    required this.status,
    required this.revision,
    required this.hasDocument,
    this.dueAt,
    this.submittedAt,
    this.reviewNote = '',
  });

  final String status;
  final int revision;
  final bool hasDocument;
  final DateTime? dueAt;
  final DateTime? submittedAt;
  final String reviewNote;

  factory PharmacyLicenseStatus.fromJson(Map<String, dynamic> json) {
    DateTime? parsed(Object? value) =>
        value is String ? DateTime.tryParse(value) : null;
    return PharmacyLicenseStatus(
      status: json['status'] as String? ?? 'not_submitted',
      revision: (json['revision'] as num?)?.toInt() ?? 0,
      hasDocument: json['hasDocument'] == true,
      dueAt: parsed(json['dueAt']),
      submittedAt: parsed(json['submittedAt']),
      reviewNote: json['reviewNote'] as String? ?? '',
    );
  }
}

abstract class PharmacyLicenseRepository {
  Future<PharmacyLicenseStatus> fetchStatus();
  Future<PharmacyLicenseStatus> submitPhoto(XFile image);
}

class PharmacyLicenseRepositoryImpl implements PharmacyLicenseRepository {
  PharmacyLicenseRepositoryImpl({required ApiClient apiClient})
      : _dio = apiClient.dio;
  final Dio _dio;

  static const maxBytes = 2 * 1024 * 1024;

  @override
  Future<PharmacyLicenseStatus> fetchStatus() async {
    final response = await _dio.get<Map<String, dynamic>>('/pharmacy/license');
    return PharmacyLicenseStatus.fromJson(
        Map<String, dynamic>.from(response.data!['license'] as Map));
  }

  @override
  Future<PharmacyLicenseStatus> submitPhoto(XFile image) async {
    final bytes = await image.readAsBytes();
    if (bytes.length > maxBytes || bytes.length < 8) {
      throw const FormatException('LICENCE_FILE_TOO_LARGE_OR_EMPTY');
    }

    // Determine MIME from actual bytes rather than user-controlled filename.
    final isJpeg = bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff;
    final isPng = bytes.length >= 8 &&
        bytes[0] == 137 && bytes[1] == 80 && bytes[2] == 78 &&
        bytes[3] == 71 && bytes[4] == 13 && bytes[5] == 10 &&
        bytes[6] == 26 && bytes[7] == 10;
    if (!isJpeg && !isPng) {
      throw const FormatException('LICENCE_FILE_TYPE_UNSUPPORTED');
    }
    final mime = isJpeg ? 'image/jpeg' : 'image/png';
    final extension = isJpeg ? 'jpg' : 'png';
    final form = FormData.fromMap({
      'document': MultipartFile.fromBytes(
        bytes,
        filename: 'pharmacy-licence.$extension',
        contentType: DioMediaType.parse(mime),
      ),
    });
    final response = await _dio.post<Map<String, dynamic>>(
      '/pharmacy/license', data: form,
    );
    return PharmacyLicenseStatus.fromJson(
        Map<String, dynamic>.from(response.data!['license'] as Map));
  }
}
