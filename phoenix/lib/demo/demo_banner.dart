import 'package:flutter/material.dart';
import 'package:feniq/core/theme/app_text_theme.dart';

/// A strip above every screen of the demo build, so nobody mistakes its
/// pretend warehouses and orders for real ones. Same layout trick as
/// OfflineBannerFrame: the screen below keeps one fixed place in the tree.
class DemoBannerFrame extends StatelessWidget {
  const DemoBannerFrame({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top;
    return Column(
      children: [
        Material(
          color: const Color(0xFFB3261E),
          child: Padding(
            padding: EdgeInsets.fromLTRB(12, top + 3, 12, 3),
            child: const SizedBox(
              width: double.infinity,
              child: Text(
                'نسخة تجريبية — البيانات وهمية ولا يُرسل أي طلب حقيقي',
                textAlign: TextAlign.center,
                textDirection: TextDirection.rtl,
                style: TextStyle(
                  fontFamily: AppTextTheme.fontFamily,
                  color: Colors.white,
                  fontSize: 11.5,
                  fontWeight: FontWeight.w600,
                  height: 1.3,
                ),
              ),
            ),
          ),
        ),
        Expanded(
          child: MediaQuery.removePadding(context: context, removeTop: true, child: child),
        ),
      ],
    );
  }
}
