import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/features/cart/data/models/order_model.dart';
import 'package:feniq/features/exchange_rate/data/models/exchange_rate_model.dart';
import 'package:feniq/features/exchange_rate/data/repositories/exchange_rate_repository.dart';
import 'package:feniq/features/exchange_rate/presentation/managers/exchange_rate_cubit.dart';
import 'package:feniq/features/order_tracking/presentation/widgets/order_invoice_section.dart';
import 'package:feniq/generated/app_localizations.dart';

class _MockExchangeRateRepository extends Mock implements ExchangeRateRepository {}

Map<String, dynamic> _orderJson({Map<String, dynamic>? discountCode}) => {
  'id': 'o1',
  'orderNumber': 7,
  'status': 'delivered',
  'totalPrice': 100000,
  'discountAmount': 4000,
  'commissionAmount': 960,
  'advertisementDiscountAmount': 0,
  'discountCode': discountCode,
  'finalPrice': 86400,
};

// The order details carry the discount code the order used, as its own line
// on the invoice, right before the total.
void main() {
  test('an order parses its discount code; an order without one has none', () {
    final order = OrderModel.fromJson(_orderJson(discountCode: {
      'code': 'ABCD2345',
      'type': 'percentage',
      'value': 10,
      'discountSyp': 9600,
      'discountUsd': 0.96,
      'released': false,
    }));
    expect(order.discountCode?.code, 'ABCD2345');
    expect(order.discountCode?.discountSyp, 9600);
    expect(OrderModel.fromJson(_orderJson()).discountCode, isNull);
  });

  testWidgets('the invoice shows the code line between the discounts and the total', (tester) async {
    final rateRepo = _MockExchangeRateRepository();
    when(() => rateRepo.getExchangeRate()).thenAnswer((_) async => const ExchangeRateModel(usdToSyp: 10000));
    final rateCubit = ExchangeRateCubit(exchangeRateRepository: rateRepo);
    addTearDown(rateCubit.close);

    final order = OrderModel.fromJson(_orderJson(discountCode: {
      'code': 'ABCD2345',
      'type': 'percentage',
      'value': 10,
      'discountSyp': 9600,
    }));

    await tester.pumpWidget(
      BlocProvider<ExchangeRateCubit>.value(
        value: rateCubit,
        child: MaterialApp(
          locale: const Locale('ar'),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(
            body: OrderInvoiceSection(
              items: order.items,
              totalPrice: order.totalPrice,
              discountAmount: order.discountAmount,
              advertisementDiscountAmount: order.advertisementDiscountAmount,
              discountCode: order.discountCode,
              finalPrice: order.finalPrice,
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('كود الخصم (ABCD2345)'), findsOneWidget);
    expect(find.textContaining('9,600'), findsOneWidget);
    expect(find.textContaining('86,400'), findsOneWidget);
  });
}
