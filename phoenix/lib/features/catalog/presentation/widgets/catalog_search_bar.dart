import 'package:flutter/material.dart';
import 'package:feniq/core/constants/app_radius.dart';
import 'package:feniq/core/constants/app_sizes.dart';

// The translucent search field that sits under the navy AppBar title - used
// as the AppBar's `bottom` by CatalogView (search within one manufacturer) and
// ManufacturersView (search the whole warehouse). A clear button appears once
// something is typed; clearing goes through [onChanged] with '' like any edit.
class CatalogSearchBar extends StatelessWidget implements PreferredSizeWidget {
  const CatalogSearchBar({super.key, required this.controller, required this.hintText, required this.onChanged});

  final TextEditingController controller;
  final String hintText;
  final ValueChanged<String> onChanged;

  @override
  Size get preferredSize => const Size.fromHeight(64);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(AppSizes.spacingMedium, 0, AppSizes.spacingMedium, AppSizes.spacingMedium),
      child: Container(
        height: 48,
        padding: const EdgeInsets.symmetric(horizontal: AppSizes.spacingMedium),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.16),
          borderRadius: AppRadius.medium,
          border: Border.all(color: Colors.white.withValues(alpha: 0.22)),
        ),
        child: Row(
          children: [
            const Icon(Icons.search, color: Colors.white70, size: 20),
            const SizedBox(width: AppSizes.spacingSmall),
            Expanded(
              child: TextField(
                controller: controller,
                style: const TextStyle(color: Colors.white, fontSize: 14),
                cursorColor: Colors.white,
                textInputAction: TextInputAction.search,
                onSubmitted: (_) => FocusManager.instance.primaryFocus?.unfocus(),
                onChanged: onChanged,
                decoration: InputDecoration(
                  filled: false,
                  isDense: true,
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  errorBorder: InputBorder.none,
                  hintText: hintText,
                  hintStyle: const TextStyle(color: Colors.white70, fontSize: 14),
                ),
              ),
            ),
            ValueListenableBuilder<TextEditingValue>(
              valueListenable: controller,
              builder: (context, value, _) {
                if (value.text.isEmpty) return const SizedBox.shrink();
                return IconButton(
                  constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
                  padding: EdgeInsets.zero,
                  icon: const Icon(Icons.close, color: Colors.white, size: 20),
                  tooltip: MaterialLocalizations.of(context).deleteButtonTooltip,
                  onPressed: () {
                    controller.clear();
                    onChanged('');
                  },
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
