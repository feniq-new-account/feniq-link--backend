import 'package:flutter/material.dart';
import 'package:feniq/core/constants/app_radius.dart';
import 'package:feniq/core/widgets/app_network_image.dart';

// A manufacturer's logo, or - when the admin has not set one - the first
// letter of its name in a coloured circle. The colour is derived from the
// manufacturer's id (its name when there is no id), so a company keeps the
// same colour on every screen and every device, and neighbouring cards differ.
class ManufacturerAvatar extends StatelessWidget {
  const ManufacturerAvatar({super.key, required this.name, this.id, this.logoUrl});

  final String name;
  final String? id;
  final String? logoUrl;

  // Mid-tone colours that read with white text in both light and dark mode
  // (never the navy card colour - see the dark-mode note on AppColors).
  static const List<Color> _palette = [
    Color(0xFF2E7D6B),
    Color(0xFF3B6FB6),
    Color(0xFFB5543A),
    Color(0xFF7A4FA3),
    Color(0xFFC08A1E),
    Color(0xFF3A8F3E),
    Color(0xFFB83B6B),
    Color(0xFF4A7C8C),
  ];

  // A stable string hash (Dart's String.hashCode is not guaranteed stable
  // across runs/platforms): 32-bit FNV-1a, which mixes the low bits well - a
  // plain `hash * 31 + c` sends ids that differ by one step per character to
  // the same slot of an 8-colour palette.
  static Color colorFor(String seed) {
    var hash = 0x811c9dc5;
    for (final unit in seed.codeUnits) {
      hash ^= unit;
      hash = (hash * 0x01000193) & 0xffffffff;
    }
    return _palette[hash % _palette.length];
  }

  static String initialOf(String name) {
    final trimmed = name.trim();
    if (trimmed.isEmpty) return '?';
    return String.fromCharCode(trimmed.runes.first).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final letter = LayoutBuilder(
      builder: (context, constraints) {
        final side = constraints.biggest.shortestSide;
        final diameter = side.isFinite ? side * 0.78 : 56.0;
        return Center(
          child: Container(
            width: diameter,
            height: diameter,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: colorFor(id ?? name), shape: BoxShape.circle),
            child: Text(
              initialOf(name),
              style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: diameter * 0.42, height: 1),
            ),
          ),
        );
      },
    );

    final url = logoUrl;
    if (url == null || url.isEmpty) return letter;
    return AppNetworkImage(url: url, fit: BoxFit.contain, borderRadius: AppRadius.medium, fallback: letter);
  }
}
