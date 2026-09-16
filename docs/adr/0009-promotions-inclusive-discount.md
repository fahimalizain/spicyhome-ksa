# ADR 0009 — Inclusive Discount / Pre-tax Allowance for Promotions

Date: 2026-09-16
Status: Accepted

## Context

Issue #191 adds storewide percentage Promotions (e.g. KSA National Day 10%).
The guest-facing amount is a cut off a VAT-inclusive bill. ZATCA, however,
models the same reduction as a pre-tax **Allowance** on the tax invoice.
Mixing the two views — or storing both and letting them drift — is a
money-critical failure mode.

Story language also confuses the amount rule: "10% of the bill" can be read
as `round(gross × percent)` or as `gross − round(gross × (1 − percent))`.
Those disagree by 1 halala on common ticket sizes (e.g. 1.15 SAR / 10% → 12
vs 11). The system needs one locked formula before schema, API, or UI land.

Vocabulary is already staged in CONTEXT.md: **Promotion** (campaign),
**Discount** (VAT-inclusive money on the Order), **Allowance** (VAT-exclusive
ZATCA view). Do not call the campaign a discount.

## Decision

1. **Vocabulary** — Promotion / Discount / Allowance as in CONTEXT.md.
   Campaign = Promotion; Order column amount = Discount; ZATCA XML amount =
   Allowance. Never swap the names.

2. **Amount rule (payable-first)** — for percent in basis points
   (`percentBp`, 1000 = 10%):

   ```
   payable  = round(grossIncl × (10000 − percentBp) / 10000)
   discount = grossIncl − payable
   ```

   Not `round(gross × percent)`. Story 12's "10% of the bill" means this
   rule. Shared helper: `applyPromotionPercent` in
   `packages/shared/src/money.ts`.

3. **Storage** — `orders.discount_halalas` holds the **inclusive** Discount
   only. Allowance is derived at XML / QR / receipt / report time via
   `applyPromotionPercent` (or the same `decomposeVat` difference). Never
   store Allowance separately.

4. **Canonical money identity** (100.00 SAR incl / 10% / 15% VAT):

   | View        | SAR    | Halalas |
   | ----------- | ------ | ------- |
   | Gross       | 100.00 | 10000   |
   | Discount    | 10.00  | 1000    |
   | Payable     | 90.00  | 9000    |
   | Allowance   | 8.70   | 870     |
   | Post-VAT    | 11.74  | 1174    |

   Locked by unit test on `applyPromotionPercent(10000, 1000, 1500)`.

5. **Line prices and order total** — line unit prices and
   `orders.total_halalas` stay the **pre-discount** item sum. The guest pays
   payable (`total − discount`). Do not rewrite line nets when a Promotion
   attaches.

6. **ZATCA XML** (preview for later slices — do not "fix" the wrong field):

   - `LineExtensionAmount` = Σ line nets (unchanged, e.g. 86.96). **Do not**
     set it equal to TaxExclusive.
   - `AllowanceCharge/Amount` = pre-tax Allowance (8.70). **Amount-only** —
     no `BaseAmount` + `MultiplierFactorNumeric` (derived 8.70 will not
     always equal base × 10/100).
   - Emit TaxCategory `S` / `15` on the Allowance.
   - TaxExclusive = line nets − Allowance (78.26)
   - TaxInclusive = payable (90.00)
   - VAT = post-Allowance (11.74)
   - Payable = payable (90.00)
   - Reason = Promotion name

7. **QR TLV** — tags 4 and 5 use payable and post-Allowance VAT, **not**
   `orders.total_halalas` / `orders.vat_halalas`. Same on credit notes.

8. **Tax receipt / Summary VAT** — when claiming to be tax, show
   post-Allowance VAT (11.74), not the pre-discount 13.04. Showing
   100 / −10 / 90 as cashier explanation is fine.

9. **Reports** — day close, Z-report, sales register, and type/user totals
   use payable and post-Allowance VAT. Item-wise sales stay on gross line
   totals (no per-line Discount allocation).

10. **Mixed 0% + 15% lines** — still apply the inclusive Discount (guest
    pays 90% of the whole bill). Derive Allowance / post-VAT at
    `vatRateBp = 1500` (whole Allowance on the 15% pot). Restaurant-normal
    is all-15%. Do **not** skip the Promotion when a 0% drink is on the
    ticket. All-0% bills pass `vatRateBp = 0` into the helper.

11. **Partner orders excluded** — ADR 0007's "Discount interplay is a
    non-goal" is superseded only insofar as partner set/clear remains the
    sole post-create attach/detach path for partners; partner tickets
    **never** get a Promotion. Promotions and partners do not mix.

12. **Stamped percent does not live-refresh** — when a Promotion attaches,
    the order stamps `promotion_percent_bp`. Admin edits to the Promotion
    row do not rewrite open or paid orders.

## Rejected alternatives

### `round(gross × percent)` as the Discount

**Rejected.** Yields a different residual on half-halala boundaries
(1.15 SAR / 10% → 12 instead of 11). Payable-first keeps
`payable + discount = gross` with a single round, matching how cashiers
read "pay 90% of the bill."

### Store Allowance alongside Discount

**Rejected.** Two sources of truth drift under rounding. Allowance is a
pure function of (gross, percent, vatRate) via `decomposeVat`; derive at
emit time.

### Per-line Discount allocation

**Rejected** for v1. Mixed-rate tickets put the whole Allowance on the 15%
pot. Restaurant-normal is all-15%; per-line split is complexity without a
current compliance driver.

### `BaseAmount` + `MultiplierFactorNumeric` on AllowanceCharge

**Rejected.** The derived Allowance will not always equal
`base × percent / 100` after integer rounding. Amount-only is honest.

### Apply Promotions to partner tickets

**Rejected.** Partner pricing is its own path (ADR 0007). Promotions are
guest-facing storewide campaigns only.

## Consequences

### Positive

- One tested helper owns the money identity before any schema or API lands.
- ZATCA / QR / receipt / report implementers share the same payable and
  post-Allowance VAT numbers.
- CONTEXT.md vocabulary stays stable across slices.

### Negative

- Mixed 0%+15% tickets attribute the full Allowance to the 15% category —
  slightly off pure economic split, accepted for restaurant-normal all-15%.
- Implementers must remember that `orders.total_halalas` is **not** what the
  guest paid when a Discount is present.

### Neutral / Mitigations

- Schema, attach API, ZATCA XML, receipts, and reports land in later slices
  of #191; this ADR is the money lock only.
- Partner exclusion is enforced at attach time in a later slice, not here.

## References

- Issue #191 — Promotions
- CONTEXT.md — Promotion / Discount / Allowance vocabulary
- `packages/shared/src/money.ts` — `applyPromotionPercent`, `decomposeVat`
- ADR 0007 — Partner orders (attach/detach path; no Promotion mix)
