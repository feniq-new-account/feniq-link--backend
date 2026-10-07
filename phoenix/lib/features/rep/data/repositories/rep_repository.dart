import 'package:feniq/features/rep/data/models/rep_models.dart';

abstract class RepRepository {
  Future<RepMe> getMe();

  Future<List<RepPharmacy>> getPharmacies({String? search});

  Future<RepPharmacyDetail> getPharmacy(String pharmacyId);

  Future<RepVisitsPage> getVisits({String? after});

  /// Logs a visit from a scanned QR [code] (the full `FENIQ-VISIT:` text) and
  /// where the phone was. [isMocked] is the OS's own flag for a spoofed
  /// location; the server decides what the scan proves.
  Future<RecordedVisit> recordVisit({
    required String code,
    required double latitude,
    required double longitude,
    required double accuracy,
    required bool isMocked,
  });

  /// The signed-in pharmacy's visit QR.
  Future<VisitCode> getVisitCode();
}
