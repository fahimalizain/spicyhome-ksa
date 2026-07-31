# Credit Notes Plan — SpicyHome POS

## Context

`docs/order-lifecycle.md` requires that a refund of a paid order create a **ZATCA credit note** in addition to the refund receipt and refund audit events. The existing `ZatcaInvoiceService` already creates a ZATCA invoice when an order is paid (`@OnEvent('order.paid')`). There is currently no equivalent listener for refunds.

The XML builder (`zatca-xml-builder.service.ts`) already supports `type: 'credit_note'` and emits the correct `InvoiceTypeCode` (`381`) and simplified subtype (`0211000`). It also accepts a `billingReferenceId` for the original invoice. So the main open questions are **persistence**, **ICV sequencing**, and **wiring**.

## Goals

- When `OrdersService.refundOrder()` succeeds, attempt to generate and persist a signed ZATCA credit note.
- The credit note must reference the original invoice.
- The credit note must use the same global ICV sequence as invoices (ZATCA expects one continuous counter per issuer/device).
- Failures must not block the refund: credit-note creation is async and best-effort, matching the invoice-on-pay pattern.
- Keep the existing invoice table and its consumers untouched.

## Non-Goals

- ~~Automatic submission/reporting of credit notes to ZATCA. Credit notes are persisted with status `signed`, same as invoices today. A future reporting layer can pick them up.~~ **Done: `ZatcaReportingService` now handles both `zatca_invoices` and `zatca_credit_notes` tables.**
- ~~Modifying `apps/pos`, Android, or generated client code. The credit note table is a server-internal concern.~~ **Done: POS ZatcaPage now lists credit notes alongside invoices in a unified Documents list with detail, XML, and retry support.**
- Refunding without a prior invoice. If the original invoice was never created (e.g., ZATCA not configured), the credit note listener will log an error and give up; the refund itself still succeeds.

## Recommended Option: A — Separate `zatca_credit_notes` Table

### Why not Option B (share `invoices`)?

`invoices.order_id` is currently unique and several call sites (`getByOrderId`, `getQrTlvPayload`, tests) assume one invoice per order. Relaxing that and adding a `type` column would ripple through the ZATCA module and the reports layer, increasing regression risk for a feature that is already soft-failing in CI due to ZATCA config.

### Why not Option C (non-persistent)?

The doc specifically pairs "ZATCA credit note" with "receipt printed" and audit events. Persisting gives us an audit trail, an ICV sequence, a QR payload for reprinting, and a hook for future reporting — all things the existing `invoices` table provides for invoices.

### Option A summary

| Aspect    | Design                                                                                |
| --------- | ------------------------------------------------------------------------------------- |
| Storage   | New `zatca_credit_notes` table mirrors `zatca_invoices` but links to `refund_id`.     |
| Sequence  | Single global `last_icv` counter; `allocateICV()` checks both tables.                 |
| Reference | `related_invoice_uuid` stored; `billingReferenceId` in XML = original invoice `uuid`. |
| Trigger   | `@OnEvent('order.refund.issued')` in `ZatcaInvoiceService`.                           |
| Failures  | Caught and logged; refund transaction unaffected.                                     |

## Data Model

```sql
CREATE TABLE `zatca_credit_notes` (
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `order_id` INTEGER NOT NULL REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
  `refund_id` INTEGER NOT NULL REFERENCES `order_refunds`(`id`) ON UPDATE no action ON DELETE no action,
  `related_invoice_uuid` TEXT NOT NULL,
  `icv` INTEGER NOT NULL,
  `uuid` TEXT NOT NULL,
  `invoice_hash` TEXT NOT NULL,
  `prev_invoice_hash` TEXT NOT NULL,
  `xml` TEXT NOT NULL,
  `qr_tlv` TEXT NOT NULL,
  `status` TEXT NOT NULL, -- 'signed' | 'reported' | 'failed'
  `total_halalas` INTEGER NOT NULL,
  `vat_halalas` INTEGER NOT NULL,
  `reason` TEXT,
  `created_at` INTEGER NOT NULL,
  `updated_at` INTEGER NOT NULL,
  `created_by` INTEGER REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  `updated_by` INTEGER REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX `zatca_credit_notes_refund_id_unique` ON `zatca_credit_notes` (`refund_id`);
CREATE UNIQUE INDEX `zatca_credit_notes_icv_unique` ON `zatca_credit_notes` (`icv`);
CREATE UNIQUE INDEX `zatca_credit_notes_uuid_unique` ON `zatca_credit_notes` (`uuid`);
CREATE INDEX `zatca_credit_notes_order_id_idx` ON `zatca_credit_notes` (`order_id`);
```

Drizzle schema export (`packages/db/src/schema.ts`):

```ts
export const zatcaCreditNotes = sqliteTable('zatca_credit_notes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderId: integer('order_id')
    .references(() => orders.id)
    .notNull(),
  refundId: integer('refund_id')
    .references(() => orderRefunds.id)
    .notNull(),
  relatedInvoiceUuid: text('related_invoice_uuid').notNull(),
  icv: integer('icv').notNull().unique(),
  uuid: text('uuid').notNull().unique(),
  invoiceHash: text('invoice_hash').notNull(),
  prevInvoiceHash: text('prev_invoice_hash').notNull(),
  xml: text('xml').notNull(),
  qrTlv: text('qr_tlv').notNull(),
  status: text('status').notNull(),
  totalHalalas: integer('total_halalas').notNull(),
  vatHalalas: integer('vat_halalas').notNull(),
  reason: text('reason'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
});
```

> **UBL `cbc:ID`**: The root Invoice ID is `order_refunds.document_id`
> (`REF{YY}-####`), **not** the ICV. ICV remains in the
> AdditionalDocumentReference ICV block. See [overview.md](./zatca/overview.md#document-id-document_id--ubl-invoice-cbcid).

## ICV and PIH Sequencing

The ZATCA simplified-invoice counter (`ICV`) must be strictly monotonic across **all** issued documents (invoice, credit note, debit note). We keep the existing `last_icv` setting as the single source of truth.

`ZatcaInvoiceService.allocateICV()` is updated to:

1. Increment `last_icv` by 1 inside a transaction.
2. Look up the previous document (ICV − 1) in **both** `zatca_invoices` and `zatca_credit_notes` to compute `prevInvoiceHash`.
3. Return `{ icv, prevInvoiceHash }`.

Because the SQLite write path is single-threaded and `allocateICV` runs inside a transaction, no duplicate ICV should occur. If a future code path bypasses the transaction, the unique index on `icv` in each table is a backstop, but the combined uniqueness is enforced by the single shared counter.

## Flow

```
OrdersService.refundOrder()
    -> emits order.refund.issued { orderId, refundId, userId }

ZatcaInvoiceService.onOrderRefundIssued()
    -> catch errors; never throw
    -> createCreditNote(orderId, refundId)

ZatcaInvoiceService.createCreditNote(orderId, refundId)
    1. Load original invoice for order.
       If none exists -> throw (logged by listener).
    2. Load refund + order_refund_items for refundId.
    3. Compute refund totals (same VAT decomposition as refundOrder).
    4. In a transaction:
       a. allocateICV() (updated to check both tables).
       b. Build InvoiceXMLInput:
          - type: 'credit_note'
          - billingReferenceId: originalInvoice.uuid
          - paymentNote: refund.reason || 'Refund'
          - items from order_refund_items
          - prevInvoiceHash from allocateICV()
       c. Sign and inject QR TLV.
        d. Insert row into zatca_credit_notes with status 'signed'.
    5. Log success and return.
```

## Files to Touch

| File                                                          | Change                                                                                                                        |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/src/schema.ts`                                   | Add `zatcaCreditNotes` table export.                                                                                          |
| `packages/db/drizzle/0000_initial.sql`                        | Add `zatca_credit_notes` DDL and indexes.                                                                                     |
| `packages/db/src/schema.test.ts`                              | Add `zatca_credit_notes` to expected table list; add ICV/UUID/refund_id unique tests.                                         |
| `packages/db/src/audit-trigger.test.ts`                       | Include `zatca_credit_notes` in audit-field checks if applicable.                                                             |
| `apps/server/src/modules/zatca/zatca-invoice.service.ts`      | Update `allocateICV` to read both tables; add `createCreditNote()` and `onOrderRefundIssued()` listener.                      |
| `apps/server/src/modules/zatca/zatca-invoice.service.test.ts` | _New file._ Assert listener catches missing-invoice errors; maybe assert happy-path row creation with a stored test key/cert. |

No controller or OpenAPI changes are required — credit notes are driven entirely by the `order.refund.issued` event.

## Testing Strategy

1. **Schema-level** (`packages/db/src/schema.test.ts`):
   - `zatca_credit_notes` is created.
   - `refund_id`, `icv`, and `uuid` are unique.
   - FKs to `orders` and `order_refunds` exist.

2. **Service-level** (`apps/server/src/modules/zatca/zatca-invoice.service.test.ts`):
   - Setup an in-memory DB with a paid order, an invoice row, a refund, and refund items.
   - Test `onOrderRefundIssued` when no original invoice exists: logs error, throws no exception.
   - Test `createCreditNote` happy path (requires valid ZATCA keys/certificate in settings). Because the existing ZATCA test suite decodes real PEM certificates, we can reuse the same fixture approach if available; otherwise we seed symmetric encrypted-key settings and a double-base64 compliance cert.
   - Assert the new row in `zatca_credit_notes` has the correct `related_invoice_uuid`, `icv` greater than the original invoice's ICV, and XML containing `InvoiceTypeCode` `381`.

3. **No regression**:
   - `bazel test //... -- -//apps/android/...` still passes with only the pre-existing 4 ZATCA integration failures.

## Risks and Mitigations

| Risk                                            | Mitigation                                                                                                                                                       |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ICV collision between invoices and credit notes | Single `last_icv` counter; `allocateICV` reads both tables for prev hash.                                                                                        |
| Credit-note failure blocks refund               | Listener wraps `createCreditNote` in try/catch and logs only, same pattern as `onOrderPaid`.                                                                     |
| Original invoice missing when refund happens    | Listener logs and exits; refund still succeeds.                                                                                                                  |
| Reports still only read `zatca_invoices`        | Document that credit notes are not yet included in sales totals; they represent money returned, so the order’s paid total already reflects the pre-refund state. |

## Open Decisions

1. **`billingReferenceId` value**: use original invoice `uuid` (recommended) or original invoice `icv`? ZATCA generally expects the original document identifier; we use `uuid` because it is stable and globally unique.
2. **`zatca_credit_notes.refund_id` unique?**: Yes — one credit note per refund transaction. If future business rules require multiple credit notes per refund, we can relax the unique index later.
3. **Include credit-note totals in Z-report?** No — out of scope for this slice. Keep Z-report based on `orders.status = 'paid'` net totals; refunds are tracked separately through `order_refunds` and `zatca_credit_notes`.

## Acceptance Criteria

- [ ] `zatca_credit_notes` table exists in schema and migration.
- [ ] `ZatcaInvoiceService` has an `onOrderRefundIssued` listener.
- [ ] `createCreditNote(orderId, refundId)` generates a signed XML row with `InvoiceTypeCode 381`.
- [ ] `allocateICV` correctly chains `prev_invoice_hash` across invoices and credit notes.
- [ ] Refund still succeeds if credit-note creation fails.
- [ ] `bazel test //... -- -//apps/android/...` passes except the pre-existing 4 ZATCA integration failures.
