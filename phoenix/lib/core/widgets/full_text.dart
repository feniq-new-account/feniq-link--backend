import 'package:flutter/material.dart';

/// The smallest nominal size any text is drawn at, before the app-wide
/// text scale (kAppTextScale): 12 x 0.93 lands just above the 11 pt minimum that the
/// platform guidelines set for legible text on a phone.
const double kMinReadableFontSize = 12;

/// Text that is always shown in full - never cut off with "...".
///
/// For the spots that should stay on one line (an app bar title, a button
/// label, a badge): drawn at its own size when it fits; otherwise shrunk, down
/// to [minScale] of that size, until it does; and if it is still too long at
/// that size, it wraps onto more lines rather than losing any of it. In a
/// health app a cut name or date can be misread, so nothing is ever hidden.
class FullText extends StatelessWidget {
  const FullText(
    this.data, {
    super.key,
    this.style,
    this.textAlign,
    this.minScale = 0.78,
    this.textDirection,
  });

  final String data;
  final TextStyle? style;
  final TextAlign? textAlign;
  final double minScale;
  final TextDirection? textDirection;

  @override
  Widget build(BuildContext context) {
    final base = DefaultTextStyle.of(context).style.merge(style);
    final scaler = MediaQuery.textScalerOf(context);
    final direction = textDirection ?? Directionality.of(context);
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        var scale = 1.0;
        if (width.isFinite && width > 0) {
          bool fits(double s) {
            final painter = TextPainter(
              text: TextSpan(text: data, style: base.copyWith(fontSize: (base.fontSize ?? 14) * s)),
              textDirection: direction,
              textScaler: scaler,
              maxLines: 1,
            )..layout(maxWidth: width);
            final overflow = painter.didExceedMaxLines;
            painter.dispose();
            return !overflow;
          }

          if (!fits(1)) {
            // Never shrink below [kMinReadableFontSize]: past that it wraps
            // instead, so a long title stays readable on a small phone.
            final nominal = base.fontSize ?? 14;
            final floor = (kMinReadableFontSize / nominal).clamp(0.0, 1.0);
            final lowest = minScale < floor ? floor : minScale;
            scale = lowest;
            for (var s = 0.96; s > lowest; s -= 0.04) {
              if (fits(s)) {
                scale = s;
                break;
              }
            }
          }
        }
        // A fresh DefaultTextStyle, not a merge: an app bar (and some
        // other widgets) hand down "one line, cut with ..." - this text
        // drops that, so it wraps rather than losing anything.
        return DefaultTextStyle(
          style: base.copyWith(fontSize: (base.fontSize ?? 14) * scale),
          textAlign: textAlign,
          softWrap: true,
          overflow: TextOverflow.visible,
          maxLines: null,
          child: Text(data, textDirection: textDirection),
        );
      },
    );
  }
}

/// A short label (a badge, a button, a tab) that must stay on one line and
/// always show in full: when it does not fit it is drawn smaller, never cut
/// off. Unlike [FullText] it never wraps, and it works inside layouts that
/// measure their children's natural size (IntrinsicHeight).
class FitLabel extends StatelessWidget {
  const FitLabel(this.data, {super.key, this.style, this.textAlign});

  final String data;
  final TextStyle? style;
  final TextAlign? textAlign;

  @override
  Widget build(BuildContext context) {
    return FittedBox(
      fit: BoxFit.scaleDown,
      child: Text(
        data,
        style: style,
        textAlign: textAlign,
        maxLines: 1,
        softWrap: false,
        overflow: TextOverflow.visible,
      ),
    );
  }
}
