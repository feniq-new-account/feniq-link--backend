import 'package:feniq/core/models/paginated_result.dart';
import 'package:feniq/features/offers/data/models/offer_model.dart';

abstract class OffersRepository {
  /// Every product offer a pharmacy may currently see, across every
  /// warehouse. The server applies the approved + date-window filter (and
  /// hides an offer whose product or warehouse has gone away), so nothing
  /// here needs to re-check status or expiry.
  ///
  /// Cursor-paginated: [cursor] is the previous page's nextCursor (null for
  /// the first page), [limit] the page size (the server's default when null).
  Future<PaginatedResult<OfferModel>> getActiveOffers({String? cursor, int? limit});
}
