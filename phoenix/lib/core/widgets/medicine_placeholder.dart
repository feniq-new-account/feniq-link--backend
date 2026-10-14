import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../constants/app_colors.dart';
import '../utils/medicine_shape.dart';

/// What stands in for a medicine's picture when it has none (or it failed to
/// load): a drawing of what it is - a blister strip for tablets, a syringe for
/// injections, a bottle for syrups, a tube for creams ... chosen from its
/// [dosageForm] (see [medicineShapeFor]), and one common drawing (a capsule and
/// a tablet) when the form is unknown. It says "a medicine" at a glance, where
/// a company's initial read as a mistake.
///
/// Fills the space it is given; give [size] where the parent does not bound it
/// (a thumbnail in a row).
class MedicinePlaceholder extends StatelessWidget {
  const MedicinePlaceholder({super.key, this.dosageForm, this.size});

  final String? dosageForm;
  final double? size;

  @override
  Widget build(BuildContext context) {
    final painter = _MedicinePainter(
      shape: medicineShapeFor(dosageForm),
      primary: AppColors.primaryOf(context),
      line: AppColors.textSecondaryOf(context).withValues(alpha: 0.7),
    );
    return Container(
      width: size,
      height: size,
      color: AppColors.surfaceOf(context),
      alignment: Alignment.center,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final side = constraints.biggest.shortestSide;
          final drawn = (side.isFinite ? side : 56.0) * 0.64;
          return CustomPaint(size: Size.square(drawn), painter: painter);
        },
      ),
    );
  }
}

// Paints one drawing inside a square of side `size.shortestSide`, in units of
// that side around the centre. White bodies with a thin outline and the brand
// orange for the active part, so every drawing reads on both the light and the
// dark card.
class _MedicinePainter extends CustomPainter {
  const _MedicinePainter({required this.shape, required this.primary, required this.line});

  final MedicineShape shape;
  final Color primary;
  final Color line;

  static const Color _white = Color(0xFFFFFFFF);
  static const Color _shade = Color(0xFFDCE3EE);

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.shortestSide;
    final pen = _Pen(canvas, s, primary, line);
    canvas.save();
    canvas.translate(size.width / 2, size.height / 2);
    switch (shape) {
      case MedicineShape.generic:
        _generic(pen);
      case MedicineShape.tablets:
        _tablets(pen);
      case MedicineShape.capsules:
        _capsules(pen);
      case MedicineShape.injection:
        _injection(pen);
      case MedicineShape.syrup:
        _syrup(pen);
      case MedicineShape.drops:
        _drops(pen);
      case MedicineShape.tube:
        _tube(pen);
      case MedicineShape.suppository:
        _suppository(pen);
      case MedicineShape.sachet:
        _sachet(pen);
      case MedicineShape.inhaler:
        _inhaler(pen);
    }
    canvas.restore();
  }

  // The common drawing: a capsule lying diagonally and a scored tablet beside it.
  void _generic(_Pen p) {
    p.save();
    p.move(-0.06, -0.06);
    p.rotate(-math.pi / 4);
    p.capsule(0, 0, 0.40, 0.17, left: primary, right: _white);
    p.restore();
    p.disc(0.26, 0.27, 0.13, _white);
    p.line(0.26 - 0.07, 0.27, 0.26 + 0.07, 0.27);
  }

  // A blister strip: two rows of three tablets, one already taken.
  void _tablets(_Pen p) {
    p.save();
    p.rotate(-0.32);
    p.box(-0.42, -0.27, 0.42, 0.27, 0.07, _white);
    for (var row = 0; row < 2; row++) {
      for (var col = 0; col < 3; col++) {
        final x = -0.26 + col * 0.26;
        final y = -0.125 + row * 0.25;
        final taken = row == 1 && col == 2;
        p.disc(x, y, 0.085, taken ? _shade : primary);
        if (!taken) p.shine(x, y, 0.085);
      }
    }
    p.restore();
  }

  // Two capsules, side by side.
  void _capsules(_Pen p) {
    p.save();
    p.move(-0.07, -0.10);
    p.rotate(-0.75);
    p.capsule(0, 0, 0.32, 0.13, left: primary, right: _white);
    p.restore();
    p.save();
    p.move(0.14, 0.19);
    p.rotate(-0.75);
    p.capsule(0, 0, 0.25, 0.10, left: _white, right: primary);
    p.restore();
  }

  // A syringe pointing to the lower left: needle, barrel with its liquid and
  // graduations, flange, plunger.
  void _injection(_Pen p) {
    p.save();
    p.rotate(-0.72);
    p.line(-0.43, 0, -0.25, 0, width: 1.6); // needle
    p.box(-0.25, -0.045, -0.18, 0.045, 0.015, _shade); // hub
    p.box(-0.18, -0.095, 0.22, 0.095, 0.03, _white); // barrel
    p.box(-0.17, -0.07, 0.04, 0.07, 0.02, primary, outline: false); // liquid
    for (var i = 0; i < 4; i++) {
      p.line(0.06 + i * 0.045, -0.095, 0.06 + i * 0.045, -0.055);
    }
    p.box(0.22, -0.14, 0.255, 0.14, 0.015, _white); // flange
    p.box(0.255, -0.02, 0.37, 0.02, 0.0, _shade); // plunger rod
    p.box(0.37, -0.105, 0.405, 0.105, 0.015, _white); // thumb rest
    p.restore();
  }

  // A syrup bottle with its cap and a labelled cross.
  void _syrup(_Pen p) {
    p.box(-0.20, -0.14, 0.20, 0.36, 0.07, _white); // body
    p.box(-0.09, -0.23, 0.09, -0.12, 0.02, _white); // neck
    p.box(-0.12, -0.34, 0.12, -0.22, 0.03, primary); // cap
    p.box(-0.20, 0.02, 0.20, 0.26, 0.0, primary, outline: false); // label
    p.cross(0, 0.14, 0.07);
    p.line(-0.20, 0.02, 0.20, 0.02);
    p.line(-0.20, 0.26, 0.20, 0.26);
  }

  // A dropper bottle: rubber bulb, collar, bottle, and a falling drop.
  void _drops(_Pen p) {
    p.box(-0.17, 0.02, 0.17, 0.36, 0.07, _white); // body
    p.box(-0.07, -0.08, 0.07, 0.03, 0.02, _white); // neck
    p.box(-0.11, -0.17, 0.11, -0.07, 0.025, primary); // collar
    p.box(-0.075, -0.40, 0.075, -0.16, 0.07, primary, outline: true); // bulb
    p.box(-0.17, 0.16, 0.17, 0.30, 0.0, _shade, outline: false); // label
    p.drop(0.30, -0.02, 0.08, primary);
  }

  // A cream tube lying diagonally: cap, body widening to the crimped end.
  void _tube(_Pen p) {
    p.save();
    p.rotate(-0.62);
    p.box(-0.43, -0.075, -0.30, 0.075, 0.025, primary); // cap
    p.box(-0.30, -0.055, -0.24, 0.055, 0.0, _shade); // shoulder
    p.polygon([const Offset(-0.24, -0.07), const Offset(0.30, -0.17), const Offset(0.30, 0.17), const Offset(-0.24, 0.07)], _white);
    p.polygon([const Offset(-0.02, -0.115), const Offset(0.12, -0.14), const Offset(0.12, 0.14), const Offset(-0.02, 0.115)], primary, outline: false);
    p.box(0.30, -0.17, 0.385, 0.17, 0.0, _shade); // crimp
    for (var i = 0; i < 3; i++) {
      p.line(0.322 + i * 0.026, -0.17, 0.322 + i * 0.026, 0.17);
    }
    p.restore();
  }

  // Two torpedo-shaped suppositories.
  void _suppository(_Pen p) {
    final cream = Color.alphaBlend(primary.withValues(alpha: 0.28), _white);
    p.save();
    p.move(-0.04, -0.12);
    p.rotate(-0.62);
    p.torpedo(0.36, 0.14, cream);
    p.restore();
    p.save();
    p.move(0.12, 0.17);
    p.rotate(-0.62);
    p.torpedo(0.26, 0.10, cream);
    p.restore();
  }

  // A foil sachet with crimped ends and a cross.
  void _sachet(_Pen p) {
    p.save();
    p.rotate(-0.17);
    p.box(-0.25, -0.33, 0.25, 0.33, 0.015, _white);
    for (final top in [true, false]) {
      final y0 = top ? -0.33 : 0.33;
      final dir = top ? 1.0 : -1.0;
      p.polygon([
        Offset(-0.25, y0),
        Offset(0.25, y0),
        Offset(0.25, y0 + dir * 0.065),
        for (var i = 9; i >= 0; i--) Offset(-0.25 + i * 0.0556, y0 + dir * (i.isEven ? 0.065 : 0.085)),
      ], _shade);
    }
    p.disc(0, 0, 0.135, primary);
    p.cross(0, 0, 0.065, color: _white);
    p.restore();
  }

  // An inhaler: an L-shaped orange housing, the canister in its top, a cap on
  // the mouthpiece, and a puff of spray.
  void _inhaler(_Pen p) {
    p.save();
    p.move(-0.07, 0.02);
    p.polygon(const [
      Offset(-0.17, -0.14),
      Offset(0.17, -0.14),
      Offset(0.17, 0.12),
      Offset(0.36, 0.12),
      Offset(0.36, 0.32),
      Offset(-0.17, 0.32),
    ], primary);
    p.box(-0.11, -0.40, 0.11, -0.09, 0.035, _white); // canister
    p.line(-0.11, -0.28, 0.11, -0.28);
    p.cross(0, 0.06, 0.05);
    p.box(0.30, 0.10, 0.40, 0.34, 0.03, _white); // mouthpiece cap
    for (var i = 0; i < 3; i++) {
      p.disc(0.50, 0.16 + i * 0.07, 0.016 + i * 0.004, _white);
    }
    p.restore();
  }

  @override
  bool shouldRepaint(_MedicinePainter old) =>
      old.shape != shape || old.primary != primary || old.line != line;
}

// A small drawing kit over a canvas: coordinates are fractions of the square's
// side, so the drawings do not care what size they are painted at.
class _Pen {
  _Pen(this.canvas, this.s, this.primary, this.lineColor);

  final Canvas canvas;
  final double s;
  final Color primary;
  final Color lineColor;

  double get _stroke => (s * 0.022).clamp(1.0, 3.0);

  Paint _fill(Color color) => Paint()..color = color;
  Paint _outline([double width = 1]) => Paint()
    ..style = PaintingStyle.stroke
    ..strokeWidth = _stroke * width
    ..strokeCap = StrokeCap.round
    ..strokeJoin = StrokeJoin.round
    ..color = lineColor;

  void save() => canvas.save();
  void restore() => canvas.restore();
  void move(double x, double y) => canvas.translate(x * s, y * s);
  void rotate(double radians) => canvas.rotate(radians);

  void box(double l, double t, double r, double b, double radius, Color color, {bool outline = true}) {
    final rrect = RRect.fromLTRBR(l * s, t * s, r * s, b * s, Radius.circular(radius * s));
    canvas.drawRRect(rrect, _fill(color));
    if (outline) canvas.drawRRect(rrect, _outline());
  }

  void disc(double x, double y, double r, Color color) {
    canvas.drawCircle(Offset(x * s, y * s), r * s, _fill(color));
    canvas.drawCircle(Offset(x * s, y * s), r * s, _outline());
  }

  void shine(double x, double y, double r) {
    canvas.drawArc(
      Rect.fromCircle(center: Offset(x * s, y * s), radius: r * s * 0.62),
      math.pi * 1.05,
      math.pi * 0.45,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeWidth = _stroke * 1.2
        ..color = const Color(0xFFFFFFFF).withValues(alpha: 0.6),
    );
  }

  void line(double x1, double y1, double x2, double y2, {double width = 1}) =>
      canvas.drawLine(Offset(x1 * s, y1 * s), Offset(x2 * s, y2 * s), _outline(width));

  void polygon(List<Offset> points, Color color, {bool outline = true}) {
    final path = Path()..addPolygon([for (final p in points) p * s], true);
    canvas.drawPath(path, _fill(color));
    if (outline) canvas.drawPath(path, _outline());
  }

  void cross(double x, double y, double arm, {Color? color}) {
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeWidth = arm * s * 0.62
      ..color = color ?? const Color(0xFFFFFFFF);
    canvas.drawLine(Offset((x - arm) * s, y * s), Offset((x + arm) * s, y * s), paint);
    canvas.drawLine(Offset(x * s, (y - arm) * s), Offset(x * s, (y + arm) * s), paint);
  }

  // A capsule lying along x, centred on (x, y): `left` and `right` are the two
  // halves' colours.
  void capsule(double x, double y, double halfLength, double halfThickness, {required Color left, required Color right}) {
    final body = RRect.fromLTRBR(
      (x - halfLength) * s,
      (y - halfThickness) * s,
      (x + halfLength) * s,
      (y + halfThickness) * s,
      Radius.circular(halfThickness * s),
    );
    canvas.save();
    canvas.clipRect(Rect.fromLTRB((x - halfLength) * s, (y - halfThickness) * s, x * s, (y + halfThickness) * s));
    canvas.drawRRect(body, _fill(left));
    canvas.restore();
    canvas.save();
    canvas.clipRect(Rect.fromLTRB(x * s, (y - halfThickness) * s, (x + halfLength) * s, (y + halfThickness) * s));
    canvas.drawRRect(body, _fill(right));
    canvas.restore();
    canvas.drawRRect(body, _outline());
    canvas.drawLine(Offset(x * s, (y - halfThickness) * s), Offset(x * s, (y + halfThickness) * s), _outline());
    canvas.drawLine(
      Offset((x - halfLength + halfThickness * 0.9) * s, (y - halfThickness * 0.45) * s),
      Offset((x - halfThickness * 0.5) * s, (y - halfThickness * 0.45) * s),
      Paint()
        ..strokeCap = StrokeCap.round
        ..strokeWidth = halfThickness * s * 0.2
        ..color = const Color(0xFFFFFFFF).withValues(alpha: 0.5),
    );
  }

  // A bullet: rounded at the left, pointed at the right.
  void torpedo(double halfLength, double halfThickness, Color color) {
    final l = -halfLength * s;
    final r = halfLength * s;
    final h = halfThickness * s;
    final bodyEnd = (halfLength * 0.25) * s;
    final path = Path()
      ..moveTo(l + h, -h)
      ..lineTo(bodyEnd, -h)
      ..cubicTo(bodyEnd + (r - bodyEnd) * 0.55, -h, r, -h * 0.35, r, 0)
      ..cubicTo(r, h * 0.35, bodyEnd + (r - bodyEnd) * 0.55, h, bodyEnd, h)
      ..lineTo(l + h, h)
      ..arcToPoint(Offset(l + h, -h), radius: Radius.circular(h))
      ..close();
    canvas.drawPath(path, _fill(color));
    canvas.drawPath(path, _outline());
    canvas.drawLine(
      Offset(l + h * 1.1, -h * 0.45),
      Offset(bodyEnd * 0.6, -h * 0.45),
      Paint()
        ..strokeCap = StrokeCap.round
        ..strokeWidth = h * 0.22
        ..color = const Color(0xFFFFFFFF).withValues(alpha: 0.6),
    );
  }

  void drop(double x, double y, double r, Color color) {
    final cx = x * s;
    final cy = y * s;
    final rr = r * s;
    final path = Path()
      ..moveTo(cx, cy - rr * 1.7)
      ..cubicTo(cx + rr * 0.2, cy - rr * 1.1, cx + rr, cy - rr * 0.4, cx + rr, cy + rr * 0.3)
      ..arcToPoint(Offset(cx - rr, cy + rr * 0.3), radius: Radius.circular(rr), clockwise: true)
      ..cubicTo(cx - rr, cy - rr * 0.4, cx - rr * 0.2, cy - rr * 1.1, cx, cy - rr * 1.7)
      ..close();
    canvas.drawPath(path, _fill(color));
    canvas.drawPath(path, _outline());
  }
}
