# ZATCA Sandbox Mode

## Purpose

ZATCA Fatoora provides a **sandbox** environment for initial integration testing.
It uses predefined placeholder credentials and issues **test** Cryptographic Stamp
Identifiers (CSIDs) that are not linked to any real business VAT registration.

This document lists the sandbox-specific values and CSR configuration needed
when operating SpicyHome POS in sandbox mode.

## SpicyHome Sandbox Autofill

These values are the defaults populated by the POS sandbox config form
(`useZatcaSandboxDefaults.ts`). Use them when onboarding in the sandbox
via the ZATCA Fatoora Developer Portal.

| Field            | Value                                                          |
| ---------------- | -------------------------------------------------------------- |
| VAT (TIN) seller | `399999999900003`                                              |
| Onboarding OTP   | `123456`                                                       |
| CRN              | `1234567890`                                                   |
| Seller name      | `Test POS Sandbox`                                             |
| Org unit         | `Riyadh Branch`                                                |
| Street           | `Test Street`                                                  |
| Building number  | `1234`                                                         |
| City             | `Riyadh`                                                       |
| Postal code      | `12345`                                                        |
| Country          | `SA`                                                           |
| API base URL     | `https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal` |

> **OTP**: `123456` is issued/entered via the Fatoora Developer Portal; it is not bundled
> in the offline SDK.

### Autofill vs. SDK sample identity

The ZATCA offline SDK samples (R3.4.8) ship with a **different** sample seller
identity. The table below clarifies which values belong to SpicyHome autofill
and which are the SDK sample data:

| Attribute | SpicyHome autofill | SDK sample                      |
| --------- | ------------------ | ------------------------------- |
| VAT       | `399999999900003`  | `399999999900003` (same)        |
| OTP       | `123456`           | n/a (not in offline SDK)        |
| CRN       | `1234567890`       | `1010010000`                    |
| Name      | `Test POS Sandbox` | `Maximum Speed Tech Supply LTD` |
| Org unit  | `Riyadh Branch`    | `Riyadh Branch`                 |
| Location  | `Riyadh`           | `RRRD2929`                      |

Both are valid for sandbox testing. The SpicyHome autofill set is the intended
one for POS onboarding; the SDK sample values are useful for cross-referencing
the SDK's bundled examples.

## ZATCA SDK Sample Parties (Standard B2B Invoices)

The offline SDK includes sample Standard Invoice XML with known buyer and
seller identities. These are useful when testing standard (B2B) invoice flow
against the sandbox.

### SDK sample seller

Extracted from `tools/zatca-sdk/Data/Samples/Standard/Standard_Invoice.xml`:

| Field            | Value                           |
| ---------------- | ------------------------------- |
| Name             | `Maximum Speed Tech Supply LTD` |
| VAT (TIN)        | `399999999900003`               |
| CRN              | `1010010000`                    |
| Street           | `Prince Sultan`                 |
| Building number  | `2322`                          |
| City subdivision | `Al-Murabba`                    |
| City             | `Riyadh`                        |
| Postal code      | `23333`                         |
| Country          | `SA`                            |

### SDK sample buyer

Required for Standard (B2B) invoices:

| Field            | Value                 |
| ---------------- | --------------------- |
| Name             | `Fatoora Samples LTD` |
| VAT (TIN)        | `399999999800003`     |
| Street           | `Salah Al-Din`        |
| Building number  | `1111`                |
| City subdivision | `Al-Murooj`           |
| City             | `Riyadh`              |
| Postal code      | `12222`               |
| Country          | `SA`                  |

### VAT group CSR variant (optional reference)

The SDK also ships a VAT-group variant of the CSR example
(`csr-config-example-EN-VAT-group.properties`):

- Organization identifier (SAN VAT): `399999999910003`
- Organizational unit (parent TIN prefix): `3999999999`

This is for entities registered under a VAT group and is noted here for
reference; SpicyHome POS does not currently use the VAT-group variant.

## Standard (B2B) Invoice Buyer Fields

### Fields collected by POS

For standard (B2B) invoices, the POS collects the following buyer fields
(type `ZatcaBuyerDetails`):

- `name`
- `vatNumber`
- `street`
- `buildingNumber`
- `citySubdivision`
- `city`
- `postalCode`
- `country`

### SpicyHome compliance dummy buyer

The server uses a hardcoded buyer for automated compliance checks
(`zatca-invoice.service.ts`):

| Field            | Value                  |
| ---------------- | ---------------------- |
| Name             | `Compliance Buyer LTD` |
| VAT (TIN)        | `399999999800003`      |
| Street           | `King Fahd Road`       |
| Building number  | `9999`                 |
| City subdivision | `Al Olaya`             |
| City             | `Riyadh`               |
| Postal code      | `12345`                |
| Country          | `SA`                   |

### Simplified vs. Standard

| Invoice type | Buyer VAT required | Buyer address required | ZATCA flow |
| ------------ | ------------------ | ---------------------- | ---------- |
| Simplified   | No                 | No                     | Reporting  |
| Standard     | Yes                | Yes                    | Clearance  |

- **Simplified (B2C)**: buyer VAT and address are not required. Invoices go
  through ZATCA **reporting**.
- **Standard (B2B)**: buyer VAT and full address are required. Invoices go
  through ZATCA **clearance** (the POS Pay flow polls clearance status via
  `ZatcaClearanceModal`).

For manual POS testing of standard invoices in sandbox, use the **SDK sample
buyer** (`Fatoora Samples LTD` / VAT `399999999800003`) or the **SpicyHome
compliance dummy buyer** above.

## CSR Configuration

When generating a Certificate Signing Request in sandbox mode, the CSR subject
DN and SAN extension must carry placeholder business data. The sandbox does not
validate these against a real business registration.

### Subject DN Fields

| CSR Attribute            | OID        | Guidance                                                                                                                                                   |
| ------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Common Name (CN)         | `2.5.4.3`  | Auto-generated by the system: `TST-<random_hex>-<vat_number>`                                                                                              |
| Organization Name (O)    | `2.5.4.10` | Any test name, e.g. `Test POS Sandbox`                                                                                                                     |
| Organizational Unit (OU) | `2.5.4.11` | ZATCA sandbox accepts any branch/unit string (e.g. `Riyadh Branch`). SpicyHome populates OU from the configured Org Unit field (`zatca_org_unit` setting). |
| Country (C)              | `2.5.4.6`  | `SA`                                                                                                                                                       |

SDK sample CN pattern (for reference): `TST-886431145-399999999900003`

### SAN Extension Fields

The Subject Alternative Name extension embeds additional ZATCA-required
attributes as a directory name:

| SAN Attribute          | OID                         | Guidance                                                                                                     |
| ---------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Serial Number          | `2.5.4.4`                   | Auto-generated: `1-TST                                                                                       | 2-TST | 3-<uuid>` |
| VAT / TIN              | `0.9.2342.19200300.100.1.1` | `399999999900003`                                                                                            |
| Invoice Type (Title)   | `2.5.4.12`                  | `1100` (Standard + Simplified)                                                                               |
| Location / Address (L) | `2.5.4.26`                  | SpicyHome uses the city string (e.g. `Riyadh`). The SDK sample uses a registered location code (`RRRD2929`). |
| Business Category      | `2.5.4.15`                  | Any valid industry string, e.g. `Retail`. The SDK sample uses `Supply activities`.                           |

SDK sample serial (for reference): `1-TST|2-TST|3-ed22f1d8-e6a2-1118-9b58-d9a8f11e445f`

### Custom Extension (OID `1.3.6.1.4.1.311.20.2`)

The CSR includes a ZATCA-specific custom extension whose UTF-8 value selects the
signing certificate environment:

| Environment | Extension Value          |
| ----------- | ------------------------ |
| Sandbox     | `TESTZATCA-Code-Signing` |
| Simulation  | `PREZATCA-Code-Signing`  |
| Production  | `ZATCA-Code-Signing`     |

SpicyHome automatically sets the correct label based on the `zatca_environment`
setting.

## Cryptographic Requirements

Even in sandbox mode, the system must correctly generate and use cryptographic
material:

1. **Key generation**: An Elliptic Curve keypair on the `secp256k1` curve
   (`1.3.132.0.10`) is generated for every CSR. The private key is stored
   encrypted at rest (AES-256-GCM).

2. **CSR signing**: The CSR is self-signed with `ecdsa-with-SHA256`
   (`1.2.840.10045.4.3.2`) using the generated private key.

3. **Invoice signing**: Every invoice XML is digitally signed with the same
   private key (`secp256k1` ECDSA) and the certificate issued by ZATCA.

4. **Test CSID**: The sandbox issues a **test** Cryptographic Stamp Identifier
   (CSID) -- a certificate + secret pair used as Basic auth credentials against
   sandbox reporting and clearance endpoints. The CSID is stored in SpicyHome's
   settings table alongside the encrypted private key.

## API Endpoints

| Environment | Base URL                                                       |
| ----------- | -------------------------------------------------------------- |
| Sandbox     | `https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal` |
| Simulation  | `https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation`       |

The POS sandbox config form autofills the developer-portal URL. Simulation mode
is a separate `zatca_environment` value and must be configured with real business
VAT registration data (not the sandbox placeholders).

## Relation to SpicyHome Environments

SpicyHome models three ZATCA environments in `packages/shared/src/zatca.ts`:

| Key          | Purpose                                                      |
| ------------ | ------------------------------------------------------------ |
| `sandbox`    | Initial testing with placeholder credentials (this document) |
| `simulation` | Pre-production testing with real business VAT registration   |
| `production` | Live e-invoicing with ZATCA                                  |

Set `zatca_environment` to `sandbox` in SpicyHome settings when using the values
in this document. Real simulation and production onboarding requires authentic
business VAT, OTP, and Commercial Registration numbers issued by ZATCA.

The CSID onboarding state machine (`not_started`, `csr_generated`, `compliance`,
`production`) is tracked per environment and per organizational unit. Credentials are
stored under settings keys of the form `zatca_<env>_<ouSlug>_<suffix>` (e.g.
`zatca_sandbox_spicyhome-pos_private_key_encrypted`) and do not interfere with
simulation or production credentials.

## Sources

- `apps/pos/src/hooks/useZatcaSandboxDefaults.ts` -- POS sandbox autofill defaults
- `tools/zatca-sdk/` -- ZATCA offline SDK samples (R3.4.8)
- ZATCA Fatoora Developer Portal -- `https://fatoora.zatca.gov.sa`
