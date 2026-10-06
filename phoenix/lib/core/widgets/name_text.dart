import 'package:flutter/material.dart';
import 'package:feniq/core/utils/display_name.dart';

/// A medicine or company name. An English name is laid out left-to-right
/// (its full stop stays at the end: "PANADOL 500 TAB.", never ".PANADOL 500
/// TAB") while still lining up with the screen's start edge, so on an Arabic
/// screen it sits on the right like everything else. Never cut off: it wraps.
class NameText extends StatelessWidget {
  const NameText(this.name, {super.key, this.style});

  final String name;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    if (!isLatinName(name)) return Text(name, style: style);
    final rtl = Directionality.of(context) == TextDirection.rtl;
    return Text(
      name,
      style: style,
      textDirection: TextDirection.ltr,
      textAlign: rtl ? TextAlign.right : TextAlign.left,
    );
  }
}
