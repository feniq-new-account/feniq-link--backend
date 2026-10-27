import 'package:dio/dio.dart';
import 'package:feniq/core/constants/storage_keys.dart';
import 'package:feniq/core/network/endpoints.dart';
import 'package:feniq/core/services/auth_event_bus.dart';
import 'package:feniq/core/services/secure_storage_service.dart';

class AuthInterceptor extends Interceptor {
  AuthInterceptor({
    required SecureStorageService secureStorage,
    required Dio retryClient,
    required Dio refreshClient,
  }) : _secureStorage = secureStorage,
       _retryClient = retryClient,
       _refreshClient = refreshClient;

  final SecureStorageService _secureStorage;

  /// Replays the original request once a refresh has succeeded. This is the
  /// same Dio the interceptor is attached to, so the replay picks the new
  /// token up through [onRequest] like any other call.
  final Dio _retryClient;

  /// Calls POST /auth/refresh. Deliberately a *separate* Dio with no
  /// interceptors: routing the refresh through the main client would re-enter
  /// this interceptor, and a 401 from the refresh itself would recurse.
  final Dio _refreshClient;

  /// Marks a request that has already been replayed once. Without it, a token
  /// that is somehow rejected even when freshly minted would retry forever.
  static const String _retriedFlag = 'feniq.authRetried';

  /// The single in-flight refresh. A screen can easily fire six requests at
  /// once, and on expiry all six come back 401 together; without this they
  /// would race to refresh, and since the backend rotates refresh tokens
  /// (audit F-03) five of the six would spend an already-consumed token and
  /// log the user out. They all await this one future instead.
  Future<bool>? _inFlightRefresh;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await _secureStorage.read(StorageKeys.authToken);
    if (token != null && token.isNotEmpty) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  // A 401 on an authenticated endpoint means the stored access token is no
  // longer valid. Since F-03 that is the *expected* state once a day rather
  // than a session-ending event, so the first move is to spend the refresh
  // token and replay the request - the user should never see it happen.
  //
  // Only when there is no refresh token, or the refresh is itself rejected
  // (revoked, expired, account blocked), does this fall back to the old
  // behaviour: signal once, app-wide, so AuthCubit runs the single logout
  // flow instead of every Cubit having to notice on its own.
  //
  // The error still flows on to the caller in that case (`handler.next(err)`),
  // so the screen that fired the request keeps showing its usual "session
  // expired" message during the brief moment before navigation.
  //
  // The unauthenticated entry points (login / register / OTP / refresh) are
  // skipped: a 401 there is "wrong phone or password", not an expired session,
  // and must not trigger a logout/redirect.
  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final options = err.requestOptions;

    if (err.response?.statusCode != 401 ||
        _isUnauthenticatedEndpoint(options.path)) {
      handler.next(err);
      return;
    }

    // Already replayed once with a token that was fresh at the time. Another
    // 401 means the session is genuinely gone, not merely expired.
    if (options.extra[_retriedFlag] == true) {
      AuthEventBus.instance.emitUnauthorized();
      handler.next(err);
      return;
    }

    final bool refreshed;
    try {
      refreshed = await _refreshSession();
    } on DioException catch (refreshError) {
      // A timeout or server outage says nothing about whether the session is
      // valid. Propagate that temporary failure instead of the original 401,
      // which AuthCubit correctly treats as a reason to clear the account.
      handler.next(refreshError);
      return;
    } catch (error) {
      handler.next(DioException(requestOptions: options, error: error));
      return;
    }
    if (!refreshed) {
      AuthEventBus.instance.emitUnauthorized();
      handler.next(err);
      return;
    }

    try {
      options.extra[_retriedFlag] = true;
      handler.resolve(await _retryClient.fetch(options));
    } on DioException catch (retryError) {
      handler.next(retryError);
    }
  }

  /// Coalesces concurrent callers onto one refresh. Returns whether the stored
  /// access token is now usable.
  Future<bool> _refreshSession() {
    final existing = _inFlightRefresh;
    if (existing != null) return existing;

    final attempt = _performRefresh().whenComplete(() {
      _inFlightRefresh = null;
    });
    _inFlightRefresh = attempt;
    return attempt;
  }

  Future<bool> _performRefresh() async {
    try {
      final refreshToken = await _secureStorage.read(StorageKeys.refreshToken);
      if (refreshToken == null || refreshToken.isEmpty) return false;

      final response = await _refreshClient.post(
        Endpoints.refresh,
        data: {'refreshToken': refreshToken},
      );

      final data = response.data;
      if (data is! Map) {
        throw DioException(requestOptions: response.requestOptions, response: response,
          error: 'Invalid refresh response');
      }

      final newToken = data['token'];
      if (newToken is! String || newToken.isEmpty) {
        throw DioException(requestOptions: response.requestOptions, response: response,
          error: 'Invalid refresh response');
      }

      await _secureStorage.write(StorageKeys.authToken, newToken);

      // The backend rotates on every refresh, so the new one must land before
      // the next expiry - if this write is skipped the session dies in 24h
      // holding a token that has already been spent.
      final newRefreshToken = data['refreshToken'];
      if (newRefreshToken is String && newRefreshToken.isNotEmpty) {
        await _secureStorage.write(
          StorageKeys.refreshToken,
          newRefreshToken,
        );
      }
      return true;
    } on DioException catch (error) {
      final status = error.response?.statusCode;
      if (status == 401 || status == 403) return false;
      rethrow;
    }
  }

  static bool _isUnauthenticatedEndpoint(String path) {
    return path.contains('/auth/login') ||
        path.contains('/auth/register') ||
        path.contains('/auth/otp') ||
        path.contains('/auth/refresh');
  }
}
