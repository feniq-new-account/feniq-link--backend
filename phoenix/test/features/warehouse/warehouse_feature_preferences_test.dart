import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_feature_preferences_repository.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_feature_preferences_view.dart';
import 'package:feniq/generated/app_localizations.dart';

class PreferencesRepository implements WarehouseFeaturePreferencesRepository {
  Map<String, dynamic>? saved;
  bool stale = false;
  @override
  Future<Map<String, dynamic>> getFeaturePreferences() async => {
    'revision': 2,
    'configuration': {
      'features': {'ownerInsights': false},
    },
    'selfConfigurable': ['ownerInsights'],
    'features': {'ownerInsights': false},
  };
  @override
  Future<Map<String, dynamic>> saveFeaturePreferences({
    required int revision,
    required String reason,
    required Map<String, bool> features,
  }) async {
    saved = {'revision': revision, 'reason': reason, 'features': features};
    if (stale) {
      throw ServerFailure('Settings changed', code: 'FEATURE_CONTROL_CHANGED');
    }
    return {
      'revision': 3,
      'features': {'ownerInsights': false},
    };
  }
}

void main() {
  Future<void> open(
    WidgetTester tester,
    PreferencesRepository repo, {
    bool canConfigure = true,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('en'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: WarehouseFeaturePreferencesView(
          repository: repo,
          canConfigure: canConfigure,
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets(
    'preference save sends revision/reason and never claims access from a preference alone',
    (tester) async {
      final repo = PreferencesRepository();
      await open(tester, repo);
      await tester.tap(find.byType(SwitchListTile));
      await tester.enterText(find.byType(TextField), 'Enable my preference');
      await tester.pump(); await tester.ensureVisible(find.text('Save preferences')); await tester.tap(find.text('Save preferences'));
      await tester.pumpAndSettle();
      expect(repo.saved, {
        'revision': 2,
        'reason': 'Enable my preference',
        'features': {'ownerInsights': true},
      });
      expect(find.text('Currently unavailable'), findsOneWidget);
      expect(
        find.byKey(const ValueKey('feature-preferences-saved')),
        findsOneWidget,
      );
    },
  );
  testWidgets(
    'stale save keeps the reason and shows a reload error without a false success',
    (tester) async {
      final repo = PreferencesRepository()..stale = true;
      await open(tester, repo);
      await tester.enterText(find.byType(TextField), 'Keep my draft');
      await tester.pump(); await tester.ensureVisible(find.text('Save preferences')); await tester.tap(find.text('Save preferences'));
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('feature-preferences-saved')),
        findsNothing,
      );
      expect(
        find.text('Feature settings changed. Reload before saving.'),
        findsOneWidget,
      );
      expect(find.text('Keep my draft'), findsOneWidget);
    },
  );
  testWidgets(
    'non-owner can read but has no editable controls or save action',
    (tester) async {
      final repo = PreferencesRepository();
      await open(tester, repo, canConfigure: false);
      expect(
        tester.widget<SwitchListTile>(find.byType(SwitchListTile)).onChanged,
        isNull,
      );
      expect(find.byType(TextField), findsNothing);
      expect(find.text('Save preferences'), findsNothing);
    },
  );
}
