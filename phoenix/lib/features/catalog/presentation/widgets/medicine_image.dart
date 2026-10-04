import 'package:flutter/material.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/widgets/app_network_image.dart';
import 'package:feniq/features/catalog/presentation/widgets/manufacturer_avatar.dart';

/// A medicine's picture - or, when it has none, its company's coloured initial
/// (the same avatar the company list uses), so a catalog that is only partly
/// photographed still looks finished. Used by the catalog cards and the
/// medicine directory.
class MedicineImage extends StatelessWidget {
  const MedicineImage({super.key, required this.url, required this.manufacturer, this.aspectRatio, this.size});

  final String? url;
  // Whose medicine it is: stands in for the picture when there is none.
  final String manufacturer;
  final double? aspectRatio;
  final double? size;

  @override
  Widget build(BuildContext context) {
    // `product.image` is the effective image the server resolves (the
    // warehouse's override, else the catalog's central one - catalog overhaul
    // Phase 9), always on Cloudinary or the server's own disk; AppNetworkImage
    // right-sizes and caches it. A medicine with no picture shows its company's
    // coloured initial (the same one the company list uses) rather than a blank
    // box, so a catalog that is only partly photographed still looks finished.
    final image = AppNetworkImage(
      url: url,
      fit: BoxFit.cover,
      width: size,
      height: size,
      fallback: CompanyTile(name: manufacturer, size: size),
    );

    if (size != null) {
      return SizedBox(width: size, height: size, child: image);
    }
    return AspectRatio(aspectRatio: aspectRatio!, child: image);
  }
}

class CompanyTile extends StatelessWidget {
  const CompanyTile({super.key, required this.name, this.size});

  final String name;
  final double? size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      color: AppColors.surfaceOf(context),
      alignment: Alignment.center,
      child: name.trim().isEmpty
          ? Icon(Icons.medication_outlined, color: AppColors.textSecondaryOf(context))
          : ManufacturerAvatar(name: name),
    );
  }
}
