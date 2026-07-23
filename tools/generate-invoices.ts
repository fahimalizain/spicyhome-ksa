#!/usr/bin/env node
/**
 * ZATCA Invoice Generator
 *
 * Generates three simplified UBL 2.1 XML documents for SDK validation:
 *   - Simplified Tax Invoice (388)
 *   - Simplified Credit Note (381)
 *   - Simplified Debit Note (383)
 *
 * Output: tools/zatca-sdk/Data/Samples/Generated/<type>.xml
 *
 * Usage: npx tsx tools/generate-invoices.ts [--output-dir <path>]
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  buildUnsignedInvoiceXML,
  InvoiceXMLInput,
  SellerInfo,
} from '../apps/server/src/modules/zatca/zatca-xml-builder.service';
import { ZATCAInvoiceDocumentType } from '@spicyhome/shared';

const OUTPUT_DIR = join(__dirname, 'zatca-sdk', 'Data', 'Samples', 'Generated');

// ── Common seller config ───────────────────────────────────────────────────────

const seller: SellerInfo = {
  name: 'SpicyHome Restaurant',
  vatNumber: '399999999900003',
  crNumber: '1010010000',
  street: 'King Fahd Road',
  buildingNumber: '2322',
  city: 'Riyadh',
  postalCode: '23333',
  country: 'SA',
};

// ── Common line items ──────────────────────────────────────────────────────────

const items = [
  { name: 'Shawarma', unitPriceHalalas: 1150, vatRateBp: 1500, qty: 2 },
  { name: 'Falafel', unitPriceHalalas: 575, vatRateBp: 1500, qty: 1 },
];

// ── Invoice generation ─────────────────────────────────────────────────────────

function generateDocument(
  type: ZATCAInvoiceDocumentType,
  icv: number,
  billingReferenceId?: string,
  paymentNote?: string,
): string {
  const input: InvoiceXMLInput = {
    type,
    icv,
    uuid: crypto.randomUUID(),
    issueDate: '2025-07-22',
    issueTime: '14:30:00',
    seller,
    items,
    prevInvoiceHash:
      'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==',
    discountHalalas: 0,
    billingReferenceId,
    paymentNote,
  };

  return buildUnsignedInvoiceXML(input);
}

// ── Main ───────────────────────────────────────────────────────────────────────

function main(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const types: Array<{ type: ZATCAInvoiceDocumentType; icv: number; billingReferenceId?: string }> =
    [
      { type: 'invoice', icv: 1 },
      {
        type: 'credit_note',
        icv: 2,
        billingReferenceId: '1',
        paymentNote: 'In case of goods or services refund',
      },
      {
        type: 'debit_note',
        icv: 3,
        billingReferenceId: '1',
        paymentNote: 'Amendment of the supply value',
      },
    ];

  for (const doc of types) {
    const xml = generateDocument(doc.type, doc.icv, doc.billingReferenceId, doc.paymentNote);
    const filename = `simplified_${doc.type}.xml`;
    const filepath = join(OUTPUT_DIR, filename);

    writeFileSync(filepath, xml, 'utf-8');
    console.log(`Generated: ${filepath}`);
  }
}

main();
