import 'package:feniq/core/models/paginated_result.dart';
import 'package:feniq/features/advertisements/data/models/advertisement_cart_preparation.dart';
import 'package:feniq/features/advertisements/data/models/advertisement_model.dart';

abstract class AdvertisementsRepository {
  /// Every advertisement package a pharmacy may currently see. The server
  /// applies the approved + date-window filter, so nothing here needs to
  /// re-check status or expiry. Cursor-paginated, like getActiveOffers.
  Future<PaginatedResult<AdvertisementModel>> getActiveAdvertisements({String? cursor, int? limit});

  /// Builds the cart payload for a tapped package. Creates no order.
  Future<AdvertisementCartPreparation> prepareAdvertisementCart(String advertisementId);
}
