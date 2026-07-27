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
- The previous-invoice-hash chain lookup spans both `invoices` and
  `credit_notes` tables to maintain hash continuity across document types.

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

### Simplified (B2C) — What SpicyHome Generates Today

SpicyHome currently generates only **Simplified Tax Invoices** (B2C). This
covers the restaurant POS use case: a customer walks in, orders, pays, and
receives a simplified invoice. Simplified invoices are reported to ZATCA via
the Reporting API within 24 hours of issuance.

### Standard (B2B) — Threshold and Input Tax

When the buyer is a business requiring input tax (B2B / VAT-registered buyer),
SpicyHome must issue a **Standard Tax Invoice**, not a simplified one. This is
particularly relevant for invoices above **1,000 SAR** (100,000 halalas).

Standard invoices use ZATCA's **Clearance** flow: the invoice XML must be
pre-approved by ZATCA before it can be issued to the buyer.

### Current Gap

| Capability                         | Status                                                   |
| :--------------------------------- | :------------------------------------------------------- |
| Simplified Tax Invoice (B2C)       | Implemented                                              |
| Standard Tax Invoice (B2B)         | **Not yet implemented** — known gap / future requirement |
| ZATCA Clearance API (pre-approval) | Not yet implemented                                      |

SpicyHome does not currently support buyer VAT registration capture, B2B
invoice generation, or ZATCA clearance. These are planned additions for a
future iteration of the ZATCA Phase 2 rollout — in particular when the system
needs to handle corporate / catering / bulk orders that require input-tax-
enabled invoices (notably larger orders above 1,000 SAR).
