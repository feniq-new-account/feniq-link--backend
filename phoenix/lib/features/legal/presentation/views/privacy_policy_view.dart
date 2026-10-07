import 'package:flutter/material.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/features/legal/presentation/widgets/privacy_policy_body.dart';
import 'package:feniq/core/widgets/full_text.dart';

// The in-app privacy policy screen. Reachable from Profile and from the
// registration screen, and - like every route in AppRouter - without being
// signed in. The wording lives in PrivacyPolicyContent (feature data), not
// here; this file is only the screen chrome.
class PrivacyPolicyView extends StatelessWidget {
  const PrivacyPolicyView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.navyOf(context),
        foregroundColor: Colors.white,
        title: FullText(
          context.l10n.privacyPolicy, minScale: 0.65),
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 720),
            child: const PrivacyPolicyBody(),
          ),
        ),
      ),
    );
  }
}
