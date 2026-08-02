# ADR 0008 — Service Day Alignment for Business Day

Date: 2026-08-02
Status: Accepted

## Context

SpicyHome closes past midnight. After 00:00, the cashier is still taking orders
for the **previous** operational day: the day was opened the morning before, the
restaurant is still serving, and post-midnight sales must land on that same
operational day's report and cash count.

Today that is impossible. `day_openings.business_date` and `createOrder` use the
**calendar** Asia/Riyadh day (`todayInRiyadh`, calendar midnight boundary):

1. **Post-midnight blocking.** At 00:00 the calendar date flips, so
   `getServiceDayString`-style logic is not applied — instead, a still-open day
   whose `business_date` no longer matches the new calendar date blocks new
   orders with a 409 until staff manually close and reopen. The restaurant
   cannot keep taking orders on a busy post-midnight shift without breaking
   the operational day.
2. **Two day concepts already exist.** `packages/shared/src/service-day.ts`
   defines the **service day** used for JWT expiry: window
   `[D 05:00, (D+1) 05:00)` Asia/Riyadh (half-open), label `D` (`YYYY-MM-DD`
   = the **start** date of the window); times before 05:00 belong to the
   **previous** service day. AGENTS.md currently says business date and
   service day are separate concepts ("do not conflate") — but the JWT already
   rolls at 05:00 while the business day rolls at 00:00, so a staff member
   logged in on service day `D` after midnight is running an open business
   day labeled `D-1` and cannot create orders for it.
3. **Reports already key off the opening, not the calendar.** X/Z reports
   aggregate by `day_opening_id`; the sales/VAT filters use the
   `business_date` label strings. The report model does not need to change —
   only what label a `day_openings` row gets and what the list filter means.

The accepted direction (locked in grilling): **Business Day is a Service Day
session**. One window/label algorithm everywhere — JWT expiry, day open/close,
order creation, order sequence reset, and the orders list filter. This ADR
**supersedes** the AGENTS.md separation note for ops, day, orders list, and
sequence; JWT already ran on service day.

## Decision

**Business Day** = a cash open/close session (`day_openings`) for a **Service
Day** label `D`. The window and label algorithm are identical to the JWT
service day: `[D 05:00, (D+1) 05:00)` Asia/Riyadh, label `D` = start date;
times before 05:00 belong to the previous service day.

1. **On day open**: `business_date = getServiceDayString(now)` — the service
   day label at open time.
2. **On `createOrder`**: require an open day **and**
   `business_date === getServiceDayString(now)`. After 05:00 with a stale
   open day, new order creation returns **409** until staff manually close
   and reopen. **No auto-close.** Existing `open` orders remain editable and
   payable after 05:00 — only **creation** of new orders is gated.
3. **Close day**: unchanged — blocks while any `open` orders exist; freezes
   paid totals for the X/Z report.
4. **Multiple `day_openings` rows may share the same `business_date`**
   (close + reopen within one service day); only one row may have
   `status = 'open'` at a time.
5. **Open before 05:00** stamps the current — possibly previous **calendar**
   date — service day label. No special case: `getServiceDayString(now)` is
   the only rule.
6. **`daily_order_seq`** resets on the service-day label (not UTC
   `toISOString` date, not calendar midnight). The sequence number and the
   day label always move together.
7. **`GET /orders?date=YYYY-MM-DD`**: the filter is now a **service-day
   window** on `orders.created_at` — bounds `[D 05:00, (D+1) 05:00)`
   Asia/Riyadh. The default "today" in clients =
   `getServiceDayString(now)`. (Semantics: an order created at 01:00 on
   calendar date `X` belongs to service day `X-1` and appears under that
   label.)
8. **Reports**: no new aggregation model. X/Z continue to aggregate by
   `day_opening_id`; sales/VAT filters continue to use the `business_date`
   label. The label itself is simply the service day now.
9. **ZATCA `IssueDate` / `IssueTime`**: remain wall-clock Asia/Riyadh at
   sign time — **not** backdated to the service-day label. After midnight
   the ops bag (service-day labeled) and the tax document clock (calendar
   wall clock) may disagree; accepted.
10. **No historical backfill** of `business_date`. Existing rows keep their
    labels. The orders-list filter semantic change may regroup rare
    historical creates that happened in `[00:00, 05:00)` — accepted.
11. **Shared helpers**: consolidate into `packages/shared/src/service-day.ts`:
    keep `getServiceDayString`, `getNextServiceDayBoundaryUnix`, and add
    `getServiceDayBoundsUnix` (start/end of a service day). **Delete**
    `riyadh.ts` and its public `todayInRiyadh` (ops "today" is the service
    day). Calendar formatting for ZATCA may stay inline where it is used.
12. **Android**: a Kotlin twin of the service-day helpers, with
    cross-file documentation pointers (TS ↔ Kotlin) so the two
    implementations cannot silently diverge. Note: the Android orders-list
    date filter was removed in #146 — the helper is still documented for
    any remaining "today" needs and future use.

### Defaults locked in grilling

- **No auto-close** at 05:00 (or any other time). Closing a day is always
  manual — cash count and open tickets are the cashier's job, not the
  clock's.
- **Stale open day after 05:00** → 409 on `createOrder` only; editing and
  paying existing `open` orders is unaffected.
- **No backfill**, **no migration** of `business_date` values — the change
  is behavioral (what label is written, what the filter means), not
  historical data repair.
- **ZATCA clocks are calendar wall clocks** at sign time; service-day
  backdating is rejected (compliance).
- **List filter default** is the service-day label, not the calendar day.

## Rejected alternatives

### Auto-close at 05:00

**Rejected.** A day that is still serving after midnight must not be cut off
by the clock; staff need to count cash and finish open tickets on their own
schedule. Close stays manual (as today), and creation is gated by the label
match instead.

### Backdate ZATCA IssueDate/IssueTime to the service day

**Rejected.** The tax document carries the wall-clock time of signing;
backdating to an ops label is a compliance risk with no benefit. The
documented disagreement between the ops bag and the tax clock after midnight
is accepted.

### Keep the calendar-day list filter

**Rejected.** Filtering `GET /orders?date=` by calendar midnight would keep
splitting a single operational day across two labels, misreporting
post-midnight sales and making the list disagree with the day-open session
staff actually worked.

### Unique `business_date`

**Rejected.** Forbidding two `day_openings` rows per label would prevent
close + reopen within one service day (e.g. a deliberate close mid-shift),
forcing an artificial new label. Only one `status = 'open'` row is required.

## Consequences

### Positive

- **Post-midnight service works.** A day opened before 05:00 stays the
  operational day until staff close it; new orders keep being created under
  the same label through the night, including after calendar midnight.
- **One day concept everywhere.** JWT expiry boundary, day open label, order
  creation gate, `daily_order_seq` reset, and the orders-list filter all use
  the same `[D 05:00, (D+1) 05:00)` window and label — no second
  interpretation of "today" to drift.
- **Reports unchanged in shape.** X/Z keep aggregating by `day_opening_id`;
  the sales/VAT filters keep using the `business_date` string. Only the
  meaning of the stored label changes.
- **Small, safe blast radius on data.** No schema change, no backfill, no
  migration; `day_openings.business_date` stays a `YYYY-MM-DD` label.

### Negative

- **The cliff moves to 05:00.** A still-open day after 05:00 rejects new
  order creation (409) until manual close + reopen — the same failure mode as
  today's post-midnight 409, moved to a different hour. Staff must be
  trained that the "day" boundary is 05:00.
- **Historical list regroup.** The orders-list filter change may move rare
  historical orders created in `[00:00, 05:00)` to the previous label in
  filtered views (no data is rewritten).
- **AGENTS.md separation note is superseded** — the timezone section must be
  updated in the implementation slice to describe the aligned model.

### Neutral / Mitigations

- ZATCA stays on wall-clock Asia/Riyadh at sign time; the label mismatch
  with the ops day after midnight is documented, accepted behavior.
- The Android Kotlin twin is a pure port of tested TS helpers, with
  doc-pointer comments; both sides keep a single testable truth.
- `riyadh.ts` deletion is mechanical: its consumers move to the service-day
  helpers or inline ZATCA formatting.

## Non-goals (explicit)

- **Auto-close** of days at any hour.
- **Historical backfill / migration** of `business_date`.
- **New aggregation model** for reports.
- **ZATCA issue-date backdating** to the service-day label.
- **Android orders-list date filter** (removed in #146; the Kotlin helper is
  documented for future/remaining "today" needs only).

## Supersedes AGENTS.md

This ADR supersedes the AGENTS.md statement that business date must **not**
be conflated with service day: ops "today", `day_openings.business_date`,
the orders-list date filter, and `daily_order_seq` now all run on the
service-day window/label, matching the JWT. Updating AGENTS.md is a
**required follow-up** in the implementation slice (not part of this ADR).

## References

- `packages/shared/src/service-day.ts` — existing service-day helpers
  (`getServiceDayString`, `getNextServiceDayBoundaryUnix`), reused as the
  single source of truth; `getServiceDayBoundsUnix` is added here.
- `packages/shared/src/riyadh.ts` — `todayInRiyadh` /
  `riyadhCalendarDayBoundsUnix`, deleted by this decision.
- `day_openings` (`business_date`, `status`) and `daily_order_seq` — server
  schema touched only behaviorally, not structurally.
- **AGENTS.md** — Timezone / service-day section (superseded in part, see
  above).
