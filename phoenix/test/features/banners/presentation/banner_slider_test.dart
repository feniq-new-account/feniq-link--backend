import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/core/widgets/app_network_image.dart';
import 'package:feniq/features/banners/data/models/banner_model.dart';
import 'package:feniq/features/banners/data/repositories/banners_repository.dart';
import 'package:feniq/features/banners/presentation/managers/banners_cubit.dart';
import 'package:feniq/features/banners/presentation/widgets/banner_slider.dart';

class _OneBanner implements BannersRepository {
  @override
  Future<List<BannerModel>> getActiveBanners() async =>
      const [BannerModel(id: 'b1', imageUrl: 'https://example.com/ad.png')];
}

void main() {
  testWidgets('an image ad is shown whole, over a blurred fill of itself', (tester) async {
    final cubit = BannersCubit(bannersRepository: _OneBanner());
    await cubit.load();

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: BlocProvider.value(value: cubit, child: const BannerSlider()),
        ),
      ),
    );

    final images = tester.widgetList<AppNetworkImage>(find.byType(AppNetworkImage)).toList();
    expect(images.map((i) => i.fit), containsAll([BoxFit.contain, BoxFit.cover]));
    // The covered copy is the blurred background - never the one on top.
    final blurred = find.descendant(
      of: find.byType(ImageFiltered),
      matching: find.byType(AppNetworkImage),
    );
    expect(tester.widget<AppNetworkImage>(blurred).fit, BoxFit.cover);

    await cubit.close();
  });
}
