import 'package:flutter/widgets.dart';

/// How much smaller than its nominal size every piece of text in the app is
/// drawn. The cards carry a lot of information (name, company, strength,
/// form, ingredient, dates, price), and one notch smaller reads tidier without
/// becoming hard to read. Applied once, at the root, so every screen - and
/// every hard-coded font size - shrinks by the same ratio.
const double kAppTextScale = 0.93;

/// Puts [kAppTextScale] on top of the phone's own text-size setting, which is
/// kept: a pharmacist who enlarged text in Android settings still gets larger
/// text, just in the same proportion as everyone else.
class AppTextScale extends StatelessWidget {
  const AppTextScale({super.key, required this.child, this.factor = kAppTextScale});

  final Widget child;
  final double factor;

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    return MediaQuery(
      data: media.copyWith(textScaler: _ScaledTextScaler(media.textScaler, factor)),
      child: child,
    );
  }
}

class _ScaledTextScaler extends TextScaler {
  const _ScaledTextScaler(this.base, this.factor);

  final TextScaler base;
  final double factor;

  @override
  double scale(double fontSize) => base.scale(fontSize) * factor;

  @override
  // ignore: deprecated_member_use
  double get textScaleFactor => base.textScaleFactor * factor;

  @override
  bool operator ==(Object other) =>
      other is _ScaledTextScaler && other.base == base && other.factor == factor;

  @override
  int get hashCode => Object.hash(base, factor);
}
