# Money-Flow V2

> Business-policy notice (2026-11-04): this document describes the existing
> financial engine, including legacy delivery-based commission and four-way
> rep splits. Its name predates the new commercial collection policy.
> [Notion decisions](https://app.notion.com/p/40e6c91cc9c481e4bc0ef8e47a7426e9)
> supersede those commercial rules for the future version; see
> [collection policy status](../../docs/COLLECTION_COMMISSION_V2.md).
> The new calculator is preview-only. Do not claim the live ledger/settlement
> engine implements it or rewrite historical entries to make it appear so.

How money works in Feniq: what is stored, what is derived, and which rules
are load-bearing. Read this before changing anything that touches a balance.

The short version: **an immutable ledger is the source of truth, every monetary
event freezes its own exchange rate, and nothing is ever edited or deleted.**

---

## 1. The model

```
PRODUCT (price in USD)
   │  order time: × the rate captured NOW, frozen onto the order
   ▼
ORDER  ──── pending → confirmed → preparing → out_for_delivery ────┐
   │                                                              │
   │  no money moves at any of these                              │ delivered
   │                                                              ▼
   │                                              ONE `charge` LedgerEntry
   │                                              (inside the same transaction)
   ▼
LedgerAccount (one per pharmacy ↔ warehouse)
   ▲          ▲              ▲
   │          │              │
 payment   return_credit  manual_credit / manual_debit
   │          │              │
   └──────────┴──────────────┘
              │
      balanceCache.syp  =  Σ signed amountSyp   (a CACHE, never the truth)
              │
      ┌───────┴────────┐
      ▼                ▼
  STATEMENT        INVOICE          (both generated, never stored)
```

### Collections

| Collection | Role |
|---|---|
| `ledgeraccounts` | One per `(pharmacyId, warehouseId)`. Holds `seqCounter` and `balanceCache`. |
| `ledgerentries` | **The source of truth.** Immutable, append-only, signed. |
| `financialauditlogs` | Append-only narrative: who did what, when, before/after, why. |
| `exchangeratehistories` | Append-only trail of every rate the singleton has held. |
| `orders` / `orderitems` | Frozen price snapshot + frozen `fx`. |
| `payments` | Append-only. `status` is the only mutable field, `posted → reversed`, once. |
| `returns` | Carries the frozen credit valuation once approved. |
| `commissioncollections` | Warehouse-to-platform commission payments. **Not** a ledger. |

`pharmacybalances` was V1's balance. It is **deleted** — if you see it
referenced anywhere, that is a bug.

---

## 2. The rules that must not be broken

1. **A LedgerEntry is never updated and never deleted.** A mistake is undone by
   posting a `*_reversal` that references it and copies its amounts *and its
   rate* — so reverse-then-re-record is exactly FX-neutral.
2. **Every monetary event freezes its own exchange rate.** `Order.fx`,
   `Payment.fx`, `LedgerEntry.fx`. A rate change prices new events only; it can
   never reach back and restate an old one.
3. **SYP is the settlement currency.** `amountSyp` is a whole-lira integer, and
   the balance is an exact integer sum. `amountUsd` is a frozen 2dp *reporting
   projection* — never `balanceSyp / currentRate`.
4. **The balance is `Σ signed amountSyp`.** Positive = the pharmacy owes.
   `balanceCache` is defined as "whatever a full replay produces" and is
   verified nightly.
5. **Delivery is the only order event that moves money**, and it posts exactly
   one charge, guarded by a unique index on `(source.orderId, kind:'charge')`.
6. **Every financial write runs in one transaction.** Notifications, realtime
   emits and FCM are post-commit and best-effort — financial success means the
   transaction committed, nothing else.
7. **Manual adjustments, every reversal, and return rejections require a
   reason**, enforced in `ledger.postEntry`'s `REASON_REQUIRED_KINDS`.
8. **The frontend never computes an authoritative figure.** It renders server
   values.

---

## 3. Pricing

Computed once in `order.service.js`, shared with the pending-edit path via
`rollUpOrderMoney` so the two cannot drift.

```js
unitPrice     = round(product.price_USD × fx.rate)
discountPrice = stackedDiscountSyp(unitPrice, offer%, manufacturer%)   // per-stage rounding
subtotal      = Σ discountPrice × qty

// The advertisement package price is the base the platform discount comes off,
// NOT the catalog sum. Units beyond the advertised quantity are simply part of
// that base at their normal price.
advertisementDiscount = max(0, advertisedSubtotal − round(package.totalPriceUsd × fx.rate))
discountBase          = subtotal − advertisementDiscount
platformDiscount      = round(discountBase × warehouse.discountRate / 100)
preCode               = discountBase − platformDiscount
codeDiscount          = discount code, last of all (§9); 0 without one
finalPrice            = preCode − codeDiscount                 // what the pharmacy owes
compensation          = codeDiscount if an ADMIN code, else 0  // platform owes warehouse
commission            = round((finalPrice + compensation)
                              × (warehouse.commissionRate + feniqRateFor(order.repCommission.rate)) / 100)
```

> **Feniq's profit policy (owner's decision, October 2026).** The warehouse
> `discountRate` and `commissionRate` default to **0** (the old 4% / 1% were
> placeholders; warehouses still on exactly 4 / 1 are zeroed once at boot -
> `platformRatesPolicy.service.js`). Before any commission, two more discounts
> come off, both paid by the warehouse: its own **loyalty** tier for the order's
> size (`utils/loyalty.js`, tiers frozen on the order) and the pharmacy's
> **credit** at this warehouse (`pharmacyCredit.service.js`, taken automatically).
> Every commission is then taken on what is left. Feniq's only cut is a quarter
> of the **rep's commission** `r` (set per rep, 0-10%), which is split in four
> quarters (`utils/repCommission.js`): Feniq `r/4` (added to `commission`), the
> pharmacy `r/4` (credited when the order is delivered, off its next order),
> the rep `r/4`, and the warehouse `r/4` - kept, or given to the rep
> (`rep.warehouseShareToRep`, the warehouse's choice per rep). The split is
> frozen on the order (`order.repCommission`), re-derived from the frozen rate on
> an edit, and counted on **delivered** orders only, less approved returns in the
> same proportion as the clawback in §4 (`repCommissionTotals.service.js`).
> The 4% / 1% example below just pins the arithmetic with arbitrary rates.

**The warehouse's effective cut off its own advertised price is therefore
predictable:**

```
discountRate + commissionRate × (1 − discountRate)   =  4% + 1%×0.96  =  4.96%
```

Worked example — catalog $67, package $40, rate 10,000, 4% + 1%:

| | SYP | USD |
|---|---:|---:|
| catalog subtotal (context only) | 670,000 | 67.00 |
| advertisement discount | −270,000 | |
| **discount base = the package price** | **400,000** | **40.00** |
| platform discount (4% of the base) | −16,000 | |
| **pharmacy pays** | **384,000** | **38.40** |
| commission (1% of what is paid) | −3,840 | |
| **warehouse nets** | **380,160** | **38.02** |
| effective cut off the $40 ad | | **4.96%** |

Pinned end-to-end in `test/advertisement.pricing.test.js`.

---

## 4. Returns

Approving a return **credits the pharmacy's account**. There is no replacement
order — that mechanism is gone.

```js
returnedGross  = Σ (orderItem.discountPrice × returnedQty)
reductionShare = round((platformDiscount + advertisementDiscount + codeDiscount)
                       × returnedGross / subtotal)
credit         = returnedGross − reductionShare

// when every unit is returned, pinned so the order's credits total EXACTLY
// its finalPrice - the remainder is absorbed rather than left as phantom debt
credit         = isFinalReturn ? (finalPrice − priorCredits) : credit
creditUsd      = credit / order.fx.rate          // the ORDER's rate, never today's
```

Offer and manufacturer discounts need no special handling — they are already
inside `discountPrice`. Commission is **not** deducted: the pharmacy is
credited what it was charged, and the warehouse's clawback happens separately
in the settlement report.

The whole working is frozen onto `Return.creditValuation` and copied into the
entry's `metadata`, so a statement or a dispute never recomputes it.

---

## 5. Idempotency & concurrency

| Operation | Mechanism |
|---|---|
| Create order | client `idempotencyKey`, unique per `(pharmacyId, key)` |
| Record / reverse payment | client `idempotencyKey`, globally unique |
| Manual adjustment | client `idempotencyKey` |
| Deliver order | CAS on `status` + unique `(orderId, kind:'charge')` |
| Approve / reject return | CAS on `Return.status` + unique `(returnId, kind:'return_credit')` |
| Reverse anything | unique partial index on `reversalOf` |

A replay returns **200 + `Idempotent-Replay: true`**, never a second resource.
A genuine conflict returns **409**.

Every entry `$inc`s its account's cache, so concurrent writes on the *same*
account genuinely conflict at the storage layer. MongoDB labels those
`TransientTransactionError` and `withTransaction` retries them — that is the
intended mechanism. The budget is 8 attempts (`utils/transaction.js`).

---

## 6. Operating it

```bash
npm run dev-replset        # single-node replica set on :27018 (transactions)
npm run check-replica-set  # is the configured MongoDB transaction-capable?
npm run reset-dev-db -- --yes --keep-rate   # clean start, rebuild indexes
npm test
```

Transactions require a **replica set** — a standalone `mongod` cannot run them
and every financial write will fail with `REPLICA_SET_REQUIRED`. See
`LOCAL_SETUP.md`.

`ensureFinancialIndexes()` runs at boot: the unique financial indexes are
load-bearing guarantees, and a transaction racing their lazy background build
sees spurious write conflicts.

**The nightly verifier** (`ledgerVerifier.service.js`) replays every account and
compares it to its cache. A mismatch is always a bug — it is logged loudly and
auto-repaired. `POST /admin/ledger/accounts/:id/rebuild-balance` is the manual
counterpart.

---

## 7. API surface

| Method | Route | Actor |
|---|---|---|
| `POST` | `/warehouse/payments` | warehouse |
| `POST` | `/warehouse/payments/:id/reverse` | warehouse — reason required |
| `GET` | `/warehouse/balances` | warehouse — ledger-backed account list |
| `GET` | `/warehouse/balances/:pharmacyId` | warehouse — statement + payments |
| `GET` | `/warehouse/settlement?from=&to=` | warehouse — commission owed, net |
| `GET` | `/warehouse/returns/:id/credit-preview` | warehouse — read-only |
| `POST` | `/warehouse/returns/:id/approve` | warehouse — posts the credit |
| `GET` | `/warehouse/orders/:id/invoice` | warehouse — includes commission/net |
| `GET` | `/pharmacy/debts` | pharmacy — debt / credit / net + accounts |
| `GET` | `/pharmacy/debts/:warehouseId` | pharmacy — statement |
| `GET` | `/orders/:id/invoice` | pharmacy — no commission on this copy |
| `GET` | `/orders/savings-summary` | pharmacy — 5-component breakdown (incl. discount codes) |
| `POST` | `/discount-codes/preview` | pharmacy — what a code takes off this cart (read-only) |
| `POST` | `/admin/ledger/adjustments` | **admin only** — reason required |
| `POST` | `/admin/ledger/adjustments/:entryId/reverse` | admin — reason required |
| `POST` | `/admin/ledger/accounts/:accountId/rebuild-balance` | admin |
| `GET` | `/admin/exchange-rate/history` | admin |
| `GET` | `/admin/commission/overview?from=&to=` | **admin only** — every warehouse, most-owing first |
| `GET` | `/admin/commission/warehouses/:id?from=&to=` | admin — breakdown + collection history |
| `POST` | `/admin/commission/collections` | admin — records that a warehouse paid, or (`direction: 'to_warehouse'`) a payout to it |
| `POST` | `/admin/commission/collections/:id/reverse` | admin — reason required |

Removed in V2: `PATCH /warehouse/payments/:id`, `DELETE /warehouse/payments/:id`.

---

## 8. Commission: owed vs. collected

Two different relationships, kept apart on purpose:

```
pharmacy  ──owes──▶  warehouse      LedgerAccount + LedgerEntry (the ledger)
warehouse ──owes──▶  platform       settlement report + CommissionCollection
```

**Owed is derived, collected is stored.** `settlement.service.js` recomputes
what a warehouse owes from the frozen fields on its delivered orders every
time it is asked, so the figure can never go stale or disagree with the
orders behind it. A collection is the only piece of commission state that is
written down, because *"someone handed over money"* is a fact no computation
can derive.

```
commissionOwedSyp    = settlement.totals.netCommissionSyp     (after return clawback)
compensationOwedSyp  = settlement.totals.netCompensationSyp   (admin discount codes, §9)
alreadyCollectedSyp  = Σ recorded collections (from_warehouse) whose period OVERLAPS the range
paidOutSyp           = Σ recorded payouts (to_warehouse) whose period OVERLAPS the range
outstandingSyp       = commissionOwedSyp − compensationOwedSyp − alreadyCollectedSyp + paidOutSyp
```

**Report ranges are business days.** Every report that takes `from`/`to`
(settlement, commission overview and detail, account statements, a
collection's period) reads a bare date as that whole day in **Asia/Damascus**
(`utils/businessTime.js`): `to=2026-09-25` runs to 23:59:59.999 local, so a
range ending today counts what was delivered today, and "this month" starts at
local midnight on the 1st. A full timestamp is taken as the instant it names.

`outstandingSyp` is **not clamped**: a negative means the platform owes the
warehouse - its discount-code compensation exceeds its commission, it has
over-paid, or it paid for a wider window than the one being viewed. Hiding
that would make a debt look like a settled account.

A `CommissionCollection` deliberately **posts no LedgerEntry**. A
LedgerAccount is the pharmacy↔warehouse receivable; putting commission into
it would corrupt the one number the ledger exists to keep honest. It also
carries no transaction, CAS or idempotency key — unlike the pharmacy paths,
this is an admin typing one bookkeeping row, where a duplicate is visible in
the history and reversible. It *is* audited (`commission.collected` /
`commission.collection_reversed`), and reversal requires a reason, like every
other correction here.

Admin-only end to end — a warehouse sees `/warehouse/settlement`, its own
position and nothing else. Pinned in `test/commission.collection.test.js`.

---

## 9. Discount codes

A pharmacy types a code at checkout (`discountCode.service.js`). Codes are
generated by the system, and either a **warehouse's** (works only on its own
orders, needs admin approval, paid by the warehouse) or an **admin's** (works
on every warehouse, live at once, **paid by the platform**).

**Where it comes off.** Last, after every other discount — offer and
manufacturer (inside the line prices), package, platform:

```js
codeDiscount = percentage ? min(preCode, round(preCode × value / 100))
                          : min(preCode, value)          // fixed SYP, never below 0
finalPrice   = preCode − codeDiscount
```

The order freezes the code's terms and amounts on `Order.discountCode`
(`discountSyp`, `discountUsd` through the order's own rate, `fundedBy`,
`platformCompensationSyp`). A warehouse edit of a pending order re-applies the
**frozen** terms to the new total, never the live code.

**Who pays.** The pharmacy is always charged `finalPrice` — the ledger `charge`
is the discounted total either way.

- Warehouse code: the warehouse bears the discount. It earns `finalPrice` and
  pays commission on that.
- Admin code: the platform owes the warehouse the whole discount
  (`compensation`). The warehouse earns `finalPrice + compensation` — exactly
  what it would have earned with no code — and pays exactly the same
  commission.

**Where the compensation is recorded.** Not in the ledger (§8: the ledger is
pharmacy↔warehouse only). It follows the commission model — *owed is derived,
cash is stored*:

```
settlement row     compensation = order.discountCode.platformCompensationSyp
                   net          = sales − credits + compensation − compensationClawback − netCommission
commission overview  outstanding = commission − compensation − collected + paidOut
payout             CommissionCollection { direction: 'to_warehouse' }   (audited, reversible)
```

It accrues at **delivery**, like the charge and the commission.

**Cancellation and returns.**

| Event | Pharmacy | Compensation | Code use |
|---|---|---|---|
| Cancel (before delivery) | nothing was charged | never accrued | handed back |
| Partial return | credited its **net** share (the code is a third order-level reduction in `computeCredit`) | clawed back pro rata, frozen as `compensationClawbackSyp` on the credit | **kept** |
| Full return | credited `finalPrice` | clawed back entirely | handed back |

Commission clawback follows the share of the warehouse's revenue a return
undoes: `commission × (credit + compensationClawback) / (finalPrice + compensation)`
— identical to §8's rule when there is no admin code, and still right on an
order a fixed code brought to 0.

**Usage limits** (total, per pharmacy) are claimed with conditional `$inc`s in
the order's own transaction, so concurrent orders can never exceed them; a
hand-back is guarded by a compare-and-swap on `Order.discountCode.releasedAt`.

Pinned in `test/discountCode.order.test.js` and `test/discountCode.money.test.js`.

---

## 10. What V1 got wrong

Kept as a record of *why* the model looks like this — each of these is now
pinned by a test.

| Defect | Fix |
|---|---|
| Balance re-divided all history by **today's** rate, so a settled account drifted into a phantom credit whenever the lira moved | Per-event frozen FX (§2.2) |
| Payments freely editable and hard-deletable, no trail | Append-only + reversal + audit log |
| Returns moved no money — a pharmacy that handed goods back kept the full bill | `return_credit` (§4) |
| No transactions anywhere; balance recompute had a lost-update race | One transaction per money path |
| Duplicate order / payment / return-approval possible | Idempotency keys + CAS |
| Platform discount computed on the catalog sum, so a $40 package netted the warehouse $36.65 (8.4%) | Discount on the package price (§3) |
| Commission charged on pre-discount revenue, and read by nothing | On `finalPrice`, surfaced in Settlement, and collectable (§8) |
| "Money Saved" omitted package + platform savings and drifted with the rate | 4 components, frozen SYP |
| Pharmacy debt total silently dropped credit balances | debt / credit / net, server-computed |
| Invoice printed the undiscounted unit price beside a discounted line total | Discounted unit price is the headline |
| Return window: 24h in code, "48 hours" in every UI string | Aligned to 24h everywhere |

## 11. Monthly loyalty and source-aware pharmacy credit (launch extension)

A warehouse selects either `per_order` or `monthly`; they never stack as two
loyalty discounts. Per-order terms remain frozen on each order. Monthly orders
freeze their offered tier terms too, but earn only on their **delivered final
net invoice value**, after other discounts and already-used credit. Pending and
cancelled orders earn nothing. The business month is `Asia/Damascus`.

`MonthlyLoyaltyPeriod` freezes its non-empty tiers with the **first committed
delivery** in that pharmacy/warehouse/month. `prepareDelivery` only reserves an
empty period key outside the transaction; a failed charge or audit must not
freeze the month. All eligibility, tier freezing, entitlement, wallet movement,
order markers, ledger charge and audit then commit together. Further deliveries
add only the difference between the new entitlement and the entitlement already
granted. Existing non-empty period terms remain frozen even after full returns.

`PharmacyCredit.balanceSyp` is commission credit. `loyaltyBalanceSyp` is a separate
signed loyalty wallet. Spendable credit is `balanceSyp + max(loyaltyBalanceSyp,0)`.
An order's `used`/`released` CreditEntries freeze the commission/loyalty source
split; cancellation and pending edits restore those sources. Legacy entries
without a split are commission credit. These wallets are not cash receivables.

An approved return reduces the original invoice month's eligible value by its
frozen net return credit, capped at the original remaining eligibility. It
recomputes that month's entitlement and posts only the loyalty difference in
the same return transaction. If a spent reward must be reversed, a negative
loyalty wallet offsets future loyalty rewards. It never consumes commission
credit and never creates a cash debt or a new ledger charge. Return valuation
and commission settlement still use the original order's frozen FX and terms.

Disabling loyalty or expiring the subscription stops new earning promises.
Previously snapshotted order promises and earned spendable credit remain valid.
Target bonuses are deferred and do not change the existing four-way commission.

## 12. Monitoring reports are views of the same posted ledger

Sales, returns and collections net each entry family with its reversals. Net
sales are sales minus returns, not profit. New reports expose a snapshot time
and separate creation-date order counts from effective-date posted money. No
cost data is available to invent a warehouse profit figure.

Receivable aging is an explicitly labelled **FIFO monitoring estimate**, because
payments are account-level rather than allocated to invoices. Returns reduce
their source invoice first; reversing a payment restores the original unpaid
invoice age. Only a `charge` provides a documented invoice age. Remaining opening
balances, migration adjustments and manual debit corrections without an original
invoice date are reported as `unknownAgeSyp`, not guessed into overdue bands.
Dated bands plus that unknown amount equal total debt; held account credit is
separate. This view never edits entries, allocation history or account balances.
