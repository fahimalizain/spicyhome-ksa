# ZATCA Overview

## Purpose

Environment-agnostic domain rules for SpicyHome POS's ZATCA Phase 2 e-invoicing
integration. These facts apply regardless of which ZATCA environment the system
is connected to (sandbox, simulation, or production).

## ICV (Invoice Counter Value)

The **Invoice Counter Value** (ICV) is a ZATCA-mandated sequential number
embedded in every e-invoice XML. It serves as a unique, monotonic identifier
for all documents issued by an Electronic Generation Solution (EGS) unit.

### Key Rules

| Rule               | Detail                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Starting value** | ICV starts at **1**, not 0.                                                                                                                                               |
| **Shared counter** | One continuous monotonic counter per issuer (EGS unit) across all document types — tax invoices, credit notes, and debit notes. The counter is **not** per-document-type. |
| **Wrap**           | ICV must never wrap. Every document consumes exactly one ICV.                                                                                                             |

### SpicyHome Implementation

SpicyHome manages ICV via `last_icv` settings and `allocateICV()` in
`apps/server/src/modules/zatca/zatca-invoice.service.ts`:

- The first allocation (`last_icv` not yet set) assigns `icv = 1`.
- Both invoices and credit notes call the same `allocateICV()` method, sharing
  a single per-EGS counter.
- The previous-invoice-hash chain lookup spans both `zatca_invoices` and
  `zatca_credit_notes` tables to maintain hash continuity across document types.

## Document ID (`document_id`) — UBL Invoice `cbc:ID`

The root UBL element **`cbc:ID`** (the business Invoice ID / document number in
the signed XML) is **`orders.document_id`** for tax invoices and
**`order_refunds.document_id`** for credit notes.

| Kind                   | Column                      | Format         | Example      |
| ---------------------- | --------------------------- | -------------- | ------------ |
| Invoices               | `orders.document_id`        | `INV{YY}-####` | `INV26-0001` |
| Credit notes (refunds) | `order_refunds.document_id` | `REF{YY}-####` | `REF26-0001` |

- `{YY}` = last two digits of the calendar year in **Asia/Riyadh** at allocation.
- Sequence zero-padded to at least 4 digits; may grow beyond 9999.
- Allocated by `DocumentIdService` (`document-id.allocator.ts`).
- Counters in settings via `zatcaKey(env, orgUnit, 'last_inv_document' | 'last_ref_document')`, value `"{yy}:{seq}"` (year change resets seq to 1).
- **Not** the ICV and **not** `orders.id`. ICV stays in the AdditionalDocumentReference ICV block; root `cbc:ID` is only `document_id`.
- Wired in `zatca-xml-builder.service.ts`: `<cbc:ID>${documentId}</cbc:ID>`.
- On clearance **rejection**, `document_id` is rotated (new INV/REF number) together with a new ICV/UUID on reissue. On **error**/retry it is **not** rotated.

## Payment Means (BT-81) — `cac:PaymentMeans/cbc:PaymentMeansCode`

The **Payment means type code** (EN 16931 business term BT-81) tells ZATCA how
the document was paid. Emitted as `cac:PaymentMeans/cbc:PaymentMeansCode`.

Sources (in-repo): Data dictionary `docs/zatca/20230519_EInvoice_Data_Dictionary vF.xlsx`
(BT-81; resolution field **9.1** maps "cash, credit/debit cards, bank transfer,
credit, and/or others"; code list is a "subset of UNTDID 4461") and the XML
Implementation Standard `docs/zatca/20230519_ZATCA_Electronic_Invoice_XML_Implementation_Standard_ vF.pdf`
(§11.2.5, **BR-KSA-16**).

| Fact                    | Value                                                           |
| ----------------------- | --------------------------------------------------------------- |
| Path                    | `cac:PaymentMeans / cbc:PaymentMeansCode`                       |
| Cardinality             | `1..n` (UBL/EN 16931)                                           |
| Status                  | Optional — but **BR-KSA-16**: if present, must be in the subset |
| Allow-list (schematron) | `10 \| 30 \| 42 \| 48 \| 1`                                     |

**SpicyHome mapping** (payment method → code):

| Method          | Code                                                        | Resolution 9.1 category                                            |
| --------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| `cash`          | `10`                                                        | cash                                                               |
| `card` / `mada` | `48`                                                        | credit/debit cards (UN/ECE 54/55 are excluded from ZATCA's subset) |
| custom methods  | any allow-listed code (default `30`/`42` for bank transfer) | bank transfer / other                                              |

**Emission rules:**

- **Snapshot**: `order_payments` and `order_refunds` copy the catalog value
  (`payment_methods.zatca_payment_means_code`) at pay/refund time, so signed
  XML stays stable even if the catalog method is later re-mapped.
- **Invoices**: one `cac:PaymentMeans` block **per `order_payments` line**
  (BT-81 cardinality `1..n`), sorted by `methodId` ASC for deterministic
  (C14N-stable) output. Each block carries an `cbc:InstructionNote` with the
  method title and amount: `{methodTitle} | {amount} SAR`.
- **Credit/debit notes**: one block from the **refund** tender (not the
  original order's multi-pay). **BR-KSA-17** requires every block on a
  credit/debit note to carry an `cbc:InstructionNote` — the KSA-10 reason
  stays first, then the method (and the refund amount when known):
  `{reason} | {methodTitle} | {amount} SAR`. Missing notes are filled with the
  default correction text (`Cancellation or Additional Charge`).
- **InstructionNote length**: clamped to 1000 chars (BR-KSA-F-06-C13),
  truncating from the end so the reason prefix survives.
- **Fallback**: a single `10` block when no payment rows exist or the snapshot
  is invalid.
- Reference implementation: `packages/shared/src/zatca-payment-means.ts`
  (`buildInvoicePaymentMeans` / `buildCreditNotePaymentMeans`).

## EGS Registration

SpicyHome POS targets **branch-level EGS registration**. Each physical branch
registers its own Electronic Generation Solution (EGS) — i.e., its own device
CSID (Cryptographic Stamp Identifier) — independently with ZATCA.

This is the planned architectural direction:

- A multi-branch restaurant group registers each branch as a separate EGS unit.
- Each branch holds its own ECC private key, compliance CSID, and production
  CSID.
- Each branch maintains its own independent ICV sequence and invoice hash
  chain.
- Onboarding (CSR generation, OTP submission, compliance/production CSID
  acquisition) happens per branch.
- Implementation keys in the `settings` table are scoped per environment and
  organizational unit: `zatca_<env>_<ouSlug>_<suffix>` (e.g.
  `zatca_simulation_spicyhome-pos_last_icv`). The active OU is selected via
  the `zatca_org_unit` setting.

## Invoice Types: Simplified vs Standard

ZATCA defines two invoice formats with different requirements:

| Document Type              | Also Known As | Typical Use                                                         | ZATCA Reporting                          |
| :------------------------- | :------------ | :------------------------------------------------------------------ | :--------------------------------------- |
| **Simplified Tax Invoice** | B2C           | Retail / restaurant sales to end consumers                          | Reporting (batch, polling-based)         |
| **Standard Tax Invoice**   | B2B           | Sales to VAT-registered businesses that require input tax deduction | Clearance (pre-approval before issuance) |

### Simplified (B2C) — Restaurant POS Invoices

For walk-in restaurant customers, SpicyHome generates **Simplified Tax Invoices**
(B2C). The customer orders, pays, and receives a simplified invoice. Simplified
invoices are reported to ZATCA via the Reporting API within 24 hours of issuance.

### Standard (B2B) — Threshold and Input Tax

When the buyer is a business requiring input tax (B2B / VAT-registered buyer),
SpicyHome must issue a **Standard Tax Invoice**, not a simplified one. This is
particularly relevant for invoices above **1,000 SAR** (100,000 halalas).

Standard invoices use ZATCA's **Clearance** flow: the invoice XML must be
pre-approved by ZATCA before it can be issued to the buyer.

### Current Gap

| Capability                         | Status                                                                 |
| :--------------------------------- | :--------------------------------------------------------------------- |
| Simplified Tax Invoice (B2C)       | Implemented                                                            |
| Standard Tax Invoice (B2B)         | **Implemented** — clearance flow with multi-attempt lifecycle          |
| ZATCA Clearance API (pre-approval) | **Implemented** — real-time clearance via `/invoices/clearance/single` |

## Standard Invoice Clearance Lifecycle

Standard invoices (B2B) and credit/debit notes use ZATCA's **clearance** flow:
the invoice XML must be pre-approved by ZATCA before it can be issued to the
buyer.

### Multi-Attempt Lifecycle

Each clearance attempt follows these rules:

1. **Persist XML, UUID, ICV, hash, PIH as `pending` before the API call** —
   the ICV is burned and the store of record is written before ZATCA is contacted.

2. **Never reuse UUID/ICV when fixing validation errors** — a rejected attempt
   keeps its ICV/UUID in the hash chain. Recovery requires a **new** ICV+UUID
   via `reissue()`.

3. **PIH (Previous Invoice Hash)** is always the hash of the last local document
   (invoice or credit note) — independent of clearance success or failure.

4. **`error` → identical payload retry** — network errors, 5xx ZATCA errors,
   and credentials issues are transient. `retryClearance()` resubmits the
   **exact same** XML/UUID/ICV/Hash. No new ICV is allocated.

5. **HTTP classification rules** (from `categorizeClearanceResponse`):
   - **5xx** → `ERROR` (retry with same ICV)
   - **4xx** → `REJECTED` (ICV burned — must reissue with new ICV)
   - **Network error** → `ERROR` (httpStatus 0)
   - **200/202 + `clearedInvoice` present OR `clearanceStatus === 'CLEARED'`** → `CLEARED`
   - **200/202 + `clearanceStatus` present and ≠ `CLEARED`** → `REJECTED`
   - **200/202 + `validationResults.status` is `ERROR` or `REJECTED`** → `REJECTED`
   - **200/202 + non-empty error messages** → `REJECTED`
   - **200/202 without `clearedInvoice` AND without errors AND no rejecting status** → **Unhandled → treated as `ERROR`** (never CLEARED)

6. **Burn meaning** — a rejected attempt keeps its ICV/UUID in the hash chain
   forever. The operator must fix the problem and call `reissue()` which
   allocates a new ICV, generates a new UUID, and builds new XML (with
   optionally updated buyer details).

7. **UBL `cbc:ID`** — see [Document ID section](#document-id-document_id--ubl-invoice-cbcid)
   above. The root Invoice ID in the signed XML is `orders.document_id`
   (or `order_refunds.document_id`), never `orders.id`.

8. **cbc:ID rotation**: on business rejection (`status = 'rejected'`),
   the `document_id` is rotated to a new value so the next reissue gets a
   fresh document number. The burn event records the burned business document
   number in both `cbcId` and `documentId` fields (they carry the same value).
   The `zatcaRecordId` field records the PK of the ZATCA row.
   `orders.id` is **never** renumbered. On `error` / retry, the
   `document_id` is **not** rotated.

9. **Uniqueness**: `UNIQUE` on `(uuid)`, `(icv)`, and
   `(orders.document_id)`. Partial unique on `(order_id, status)` for
   `cleared` only (one cleared invoice per order). **Do not** restore a full
   `UNIQUE` on `order_id` — multi-attempt reissue creates multiple rows for
   the same order.

10. **Audit**: on business rejection (`status = 'rejected'`), an immutable
    `order_events` row of type `zatca_clearance_rejected` records the ICV,
    UUID, `cbcId` and `documentId` (= burned business document_id),
    `zatcaRecordId` (= PK of the zatca row), `orderId`, `errors`, and
    `httpStatus`. This provides a permanent audit trail of burned document
    numbers for operator recovery.

11. **Document ID counters**: allocated by `DocumentIdService` — see
    [Document ID section](#document-id-document_id--ubl-invoice-cbcid) above
    for format, scoping, and sequence rules.
