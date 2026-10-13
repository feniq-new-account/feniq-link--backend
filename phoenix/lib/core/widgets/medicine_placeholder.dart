import 'package:flutter/material.dart';

import '../constants/app_colors.dart';

/// What stands in for a medicine's picture when it has none (or it failed to
/// load): a capsule and a tablet on the card's surface, in the brand orange.
/// It says "a medicine" at a glance, where a company's initial read as a
/// mistake. Fills the space it is given; give [size] where the parent does not
/// bound it (a thumbnail in a row).
class MedicinePlaceholder extends StatelessWidget {
  const MedicinePlaceholder({super.key, this.size});

  final double? size;

  @override
  Widget build(BuildContext context) {
    final painter = _PillsPainter(
      primary: AppColors.primaryOf(context),
      light: AppColors.surfaceElevatedOf(context),
      outline: AppColors.borderOf(context),
    );
    return Container(
      width: size,
      height: size,
      color: AppColors.surfaceOf(context),
      alignment: Alignment.center,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final side = constraints.biggest.shortestSide;
          final drawn = (side.isFinite ? side : 56.0) * 0.62;
          return CustomPaint(size: Size.square(drawn), painter: painter);
        },
      ),
    );
  }
}

// A capsule lying diagonally (orange half, light half) with a round scored
// tablet beside it, all inside a unit square of side `size.shortestSide`.
class _PillsPainter extends CustomPainter {
  const _PillsPainter({required this.primary, required this.light, required this.outline});

  final Color primary;
  final Color light;
  final Color outline;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.shortestSide;
    final stroke = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = (s * 0.025).clamp(1.0, 3.0)
      ..color = outline;
    final fillPrimary = Paint()..color = primary;
    final fillLight = Paint()..color = light;

    canvas.save();
    canvas.translate(s / 2, s / 2);

    // The capsule: half-length 0.40, half-thickness 0.17, tilted to the upper right.
    canvas.save();
    canvas.translate(-0.06 * s, -0.06 * s);
    canvas.rotate(-0.785398);
    final length = 0.40 * s;
    final thickness = 0.17 * s;
    final body = RRect.fromRectAndRadius(
      Rect.fromLTRB(-length, -thickness, length, thickness),
      Radius.circular(thickness),
    );
    canvas.save();
    canvas.clipRect(Rect.fromLTRB(-length, -thickness, 0, thickness));
    canvas.drawRRect(body, fillPrimary);
    canvas.restore();
    canvas.save();
    canvas.clipRect(Rect.fromLTRB(0, -thickness, length, thickness));
    canvas.drawRRect(body, fillLight);
    canvas.restore();
    canvas.drawRRect(body, stroke);
    canvas.drawLine(Offset(0, -thickness), Offset(0, thickness), stroke);
    // A soft highlight along the orange half.
    canvas.drawLine(
      Offset(-length + thickness * 0.8, -thickness * 0.5),
      Offset(-thickness * 0.4, -thickness * 0.5),
      Paint()
        ..color = Colors.white.withValues(alpha: 0.45)
        ..strokeWidth = thickness * 0.22
        ..strokeCap = StrokeCap.round,
    );
    canvas.restore();

    // The tablet, with its score line.
    final tablet = Offset(0.26 * s, 0.27 * s);
    final radius = 0.13 * s;
    canvas.drawCircle(tablet, radius, fillLight);
    canvas.drawCircle(tablet, radius, stroke);
    canvas.drawLine(tablet.translate(-radius * 0.55, 0), tablet.translate(radius * 0.55, 0), stroke);

    canvas.restore();
  }

  @override
  bool shouldRepaint(_PillsPainter old) =>
      old.primary != primary || old.light != light || old.outline != outline;
}
