import 'package:dio/dio.dart';
import 'package:feniq/core/network/api_client.dart';
import 'package:feniq/features/rep/data/services/location_provider.dart';

class DriverTripStop {
  DriverTripStop({
    required this.id,
    required this.pharmacyName,
    required this.address,
    required this.status,
    this.note = '',
  });

  final String id;
  final String pharmacyName;
  final String address;
  final String status;
  final String note;

  factory DriverTripStop.fromJson(Map<String, dynamic> json) => DriverTripStop(
    id: json['_id'] as String,
    pharmacyName: json['pharmacyName'] as String? ?? '',
    address: json['address'] as String? ?? '',
    status: json['status'] as String? ?? 'pending',
    note: json['note'] as String? ?? '',
  );
}

class DriverTrip {
  DriverTrip({
    required this.id,
    required this.region,
    required this.serviceDate,
    required this.status,
    required this.revision,
    required this.stops,
  });

  final String id;
  final String region;
  final DateTime serviceDate;
  final String status;
  final int revision;
  final List<DriverTripStop> stops;

  factory DriverTrip.fromJson(Map<String, dynamic> json) => DriverTrip(
    id: json['_id'] as String,
    region: json['region'] as String? ?? '',
    serviceDate: DateTime.parse(json['serviceDate'] as String),
    status: json['status'] as String? ?? 'planned',
    revision: (json['revision'] as num).toInt(),
    stops: (json['stops'] as List<dynamic>? ?? [])
      .map((stop) => DriverTripStop.fromJson(Map<String, dynamic>.from(stop as Map)))
      .toList(growable: false),
  );
}

abstract class DriverTripRepository {
  Future<List<DriverTrip>> listTrips();
  Future<DriverTrip> start(String tripId, int revision);
  Future<DriverTrip> updateStop(String tripId, String stopId, int revision,
      {required String status, String note = '', String? requestId});
  Future<DriverTrip> complete(String tripId, int revision);
  Future<void> sendLocation(String tripId, DeviceLocation position);
}

class DriverTripRepositoryImpl implements DriverTripRepository {
  DriverTripRepositoryImpl({required ApiClient apiClient}) : _dio = apiClient.dio;
  final Dio _dio;
  static const _root = '/driver/distribution/trips';

  @override
  Future<void> sendLocation(String tripId, DeviceLocation position) async {
    if (position.isMocked) throw StateError('Mock GPS is not accepted.');
    await _dio.put<void>('$_root/$tripId/location', data: {
      'latitude': position.latitude,
      'longitude': position.longitude,
      'accuracyMeters': position.accuracy,
      'measuredAt': (position.capturedAt ?? DateTime.now()).toUtc().toIso8601String(),
    });
  }

  @override
  Future<List<DriverTrip>> listTrips() async {
    final result = await _dio.get<Map<String, dynamic>>(_root);
    return (result.data!['trips'] as List<dynamic>? ?? [])
      .map((trip) => DriverTrip.fromJson(Map<String, dynamic>.from(trip as Map)))
      .toList(growable: false);
  }

  Future<DriverTrip> _post(String route, int revision) async {
    final response = await _dio.post<Map<String, dynamic>>(route,
      data: {'revision': revision});
    return DriverTrip.fromJson(
      Map<String, dynamic>.from(response.data!['trip'] as Map));
  }

  @override
  Future<DriverTrip> start(String tripId, int revision) =>
      _post('$_root/$tripId/start', revision);

  @override
  Future<DriverTrip> complete(String tripId, int revision) =>
      _post('$_root/$tripId/complete', revision);

  @override
  Future<DriverTrip> updateStop(String tripId, String stopId, int revision,
      {required String status, String note = '', String? requestId}) async {
    final response = await _dio.patch<Map<String, dynamic>>(
      '$_root/$tripId/stops/$stopId',
      data: {'revision': revision, 'status': status, 'note': note,
        if (requestId != null) 'requestId': requestId});
    return DriverTrip.fromJson(
      Map<String, dynamic>.from(response.data!['trip'] as Map));
  }
}
