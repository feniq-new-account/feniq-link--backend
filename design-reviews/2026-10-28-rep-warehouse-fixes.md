# Rep and warehouse mobile fixes — 2026-10-28

## Correctness

- Period changes discard figures belonging to the previous period. Same-period refreshes retain cached figures with a visible failure, retry, and last successful update time.
- Leaving a visit during GPS lookup safely ignores the late callback. Back waits during submission; a completed visit returns its result so the previous screen refreshes. All scan callbacks handle a disposed cubit.
- Fresh visit loads invalidate pending pagination for both the rep and warehouse manager. Merging deduplicates IDs, preserves the new cursor, and exposes failed pages with retry controls.
- Verified visits serialize through the active assignment inside a MongoDB transaction. Concurrent scans return the same receipt, and the warehouse receives one creation event after commit.

## Layout and readability

- Adaptive statistics, wrapping order headers, contact actions, quantities and totals replace fixed rows that overflowed.
- Phone navigation grows with its labels; wide layouts use a scrollable RTL navigation rail. Detail content has a readable maximum width on tablets.
- Numeric inputs accept Arabic and Persian keyboard digits, while displaying western digits. Phones use LTR; negative amounts and Arabic dates use directional isolation. Arabic order titles use an unambiguous “رقم” label.
- Filters retain Android's 48dp touch targets. Orange text uses the existing readable contrast token. Selected chips have a visible checkmark, and card shadows are lighter.
- Add-rep passwords support show/hide. Payment and scan panels scroll in short landscape viewports and with enlarged text. Refresh errors stay visible beside cached data.

## Verification

Permanent regression tests cover GPS disposal, late submission receipts, stale pagination in both roles, failed month switches, numeric keyboard normalization, and negative amounts.

The responsive suite renders real Arabic screens using the bundled fonts, including all tabs, detail pages, loading/empty/error states, forms, dialogs and cached-error states. It checks small phones, landscape, split-screen, tablets, large text (up to 3×), dark mode, keyboard space, content reached by scrolling, Android tap targets, labels and the visual position of the minus sign. Set `FENIQ_CAPTURE_DIR` to save screenshots and the JSON evidence outside the repository.

The backend integration test sends four concurrent HTTP scans against a temporary MongoDB replica set and asserts exactly one stored verified visit with matching receipt IDs.

These tests do not substitute for a physical camera/GPS/keyboard check on the Oukitel C62.
