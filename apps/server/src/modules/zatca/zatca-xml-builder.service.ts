/**
 * ZATCA UBL 2.1 Simplified Invoice XML Builder.
 *
 * Generates KSA-2 profile simplified tax invoice, credit note, and debit note
 * (B2C) from an order and seller configuration.
 *
 * Output is a deterministic XML string (no extraneous whitespace between tags)
 * suitable for canonicalization and hashing.
 *
 * Profile:
 *   - InvoiceTypeCode: 388 (invoice), 381 (credit note), 383 (debit note)
 *   - Subtype: "0200000" (simplified, B2C)
 *   - No Buyer legal data (simplified B2C — anonymous AccountingCustomerParty)
 *   - Line items with VAT-inclusive prices (compute excl. via decomposeVat)
 *   - Tax totals: grouped by rate
 */

import {
  decomposeVat,
  halalasToSar,
  ZATCAInvoiceDocumentType,
  ZATCA_INVOICE_TYPE_CODES,
  ZATCA_SIMPLIFIED_SUBTYPES,
  ZATCA_INITIAL_PIH,
} from '@spicyhome/shared';

export interface InvoiceItemInput {
  name: string;
  /** VAT-inclusive unit price in halalas */
  unitPriceHalalas: number;
  /** VAT rate in basis points */
  vatRateBp: number;
  /** Quantity */
  qty: number;
}

export interface SellerInfo {
  name: string;
  vatNumber: string;
  /** Street name */
  street?: string;
  /** Building number */
  buildingNumber?: string;
  /** City */
  city?: string;
  /** Postal code */
  postalCode?: string;
  /** Country (default SA) */
  country?: string;
  /** Commercial Registration number */
  crNumber?: string;
}

export interface InvoiceXMLInput {
  /** Document type */
  type?: ZATCAInvoiceDocumentType;
  /** Invoice Counter Value (strictly incrementing) */
  icv: number;
  /** UUID for the invoice */
  uuid: string;
  /** Issue date as YYYY-MM-DD in Asia/Riyadh */
  issueDate: string;
  /** Issue time as HH:MM:SS in Asia/Riyadh */
  issueTime: string;
  /** Seller / restaurant info */
  seller: SellerInfo;
  /** Line items */
  items: InvoiceItemInput[];
  /** Invoice-level discount in halalas (optional) */
  discountHalalas?: number;
  /** Previous Invoice Hash — empty string for first invoice */
  prevInvoiceHash: string;
  /** For credit/debit notes: the ICV of the original invoice being corrected */
  billingReferenceId?: string;
  /** Payment instruction note (KSA-10 reason for credit/debit notes) */
  paymentNote?: string;
}

// ── XML Builder ───────────────────────────────────────────────────────────────

/**
 * Build the unsigned UBL 2.1 simplified invoice XML.
 *
 * Supports invoice, credit note, and debit note document types.
 * The XML does NOT include a UBLExtensions / signature block — that is injected
 * later by `embedSignatureIntoXML`.
 */
export function buildUnsignedInvoiceXML(input: InvoiceXMLInput): string {
  const type = input.type || 'invoice';
  const {
    icv,
    uuid,
    issueDate,
    issueTime,
    seller,
    items,
    discountHalalas,
    prevInvoiceHash,
    billingReferenceId,
  } = input;

  const typeCode = ZATCA_INVOICE_TYPE_CODES[type];
  const isCorrection = type === 'credit_note' || type === 'debit_note';

  // Compute line totals and tax breakdown
  const lines = items.map((item, idx) => {
    const decomposed = decomposeVat(item.unitPriceHalalas, item.vatRateBp);
    const lineTotalIncl = item.qty * item.unitPriceHalalas;
    const lineVat = item.vatRateBp === 0 ? 0 : decomposed.vatHalalas * item.qty;
    const lineExcl = decomposed.priceExclHalalas * item.qty;

    return {
      index: idx + 1,
      name: escapeXml(item.name),
      qty: item.qty,
      unitPriceIncl: item.unitPriceHalalas,
      unitPriceExcl: decomposed.priceExclHalalas,
      vatRateBp: item.vatRateBp,
      lineTotalIncl,
      lineVat,
      lineExcl,
    };
  });

  // Compute totals
  const totalExcl = lines.reduce((sum, l) => sum + l.lineExcl, 0);
  const totalIncl = lines.reduce((sum, l) => sum + l.lineTotalIncl, 0);
  const discount = discountHalalas ?? 0;
  const allowanceTotal = discount;
  const payableAmount = totalIncl - discount;

  // Group tax by rate
  const taxGroups = groupTaxByRate(lines);

  const parts: string[] = [];

  // ── XML declaration ──
  parts.push('<?xml version="1.0" encoding="UTF-8"?>');

  // ── Root opening ──
  parts.push(
    '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"' +
      ' xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"' +
      ' xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"' +
      ' xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">',
  );

  // ── Profile & IDs ──
  parts.push(`  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>`);
  parts.push(`  <cbc:ID>${icv}</cbc:ID>`);
  parts.push(`  <cbc:UUID>${uuid}</cbc:UUID>`);
  parts.push(`  <cbc:IssueDate>${issueDate}</cbc:IssueDate>`);
  parts.push(`  <cbc:IssueTime>${issueTime}</cbc:IssueTime>`);
  parts.push(
    `  <cbc:InvoiceTypeCode name="${ZATCA_SIMPLIFIED_SUBTYPES[type]}">${typeCode}</cbc:InvoiceTypeCode>`,
  );

  // ── Currencies ──
  parts.push(`  <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>`);
  parts.push(`  <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>`);

  // ── BillingReference (credit/debit notes only) ──
  if (isCorrection && billingReferenceId) {
    parts.push(`  <cac:BillingReference>`);
    parts.push(`    <cac:InvoiceDocumentReference>`);
    parts.push(`      <cbc:ID>${billingReferenceId}</cbc:ID>`);
    parts.push(`    </cac:InvoiceDocumentReference>`);
    parts.push(`  </cac:BillingReference>`);
  }

  // ── AdditionalDocumentReference: ICV ──
  parts.push(`  <cac:AdditionalDocumentReference>`);
  parts.push(`    <cbc:ID>ICV</cbc:ID>`);
  parts.push(`    <cbc:UUID>${icv}</cbc:UUID>`);
  parts.push(`  </cac:AdditionalDocumentReference>`);

  // ── AdditionalDocumentReference: PIH ──
  const pihValue = prevInvoiceHash || ZATCA_INITIAL_PIH;
  parts.push(`  <cac:AdditionalDocumentReference>`);
  parts.push(`    <cbc:ID>PIH</cbc:ID>`);
  parts.push(`    <cac:Attachment>`);
  parts.push(
    `      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${pihValue}</cbc:EmbeddedDocumentBinaryObject>`,
  );
  parts.push(`    </cac:Attachment>`);
  parts.push(`  </cac:AdditionalDocumentReference>`);

  // ── AdditionalDocumentReference: QR (placeholder — filled after signing) ──
  parts.push(`  <cac:AdditionalDocumentReference>`);
  parts.push(`    <cbc:ID>QR</cbc:ID>`);
  parts.push(`    <cac:Attachment>`);
  parts.push(
    `      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain"></cbc:EmbeddedDocumentBinaryObject>`,
  );
  parts.push(`    </cac:Attachment>`);
  parts.push(`  </cac:AdditionalDocumentReference>`);

  // ── Signature placeholder ──
  parts.push(`  <cac:Signature>`);
  parts.push(`    <cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID>`);
  parts.push(
    `    <cbc:SignatureMethod>urn:oasis:names:specification:ubl:dsig:enveloped:xades</cbc:SignatureMethod>`,
  );
  parts.push(`  </cac:Signature>`);

  // ── AccountingSupplierParty (Seller) ──
  const crn = seller.crNumber || seller.vatNumber;
  parts.push(`  <cac:AccountingSupplierParty>`);
  parts.push(`    <cac:Party>`);
  parts.push(`      <cac:PartyIdentification>`);
  parts.push(`        <cbc:ID schemeID="CRN">${escapeXml(crn)}</cbc:ID>`);
  parts.push(`      </cac:PartyIdentification>`);
  parts.push(`      <cac:PostalAddress>`);
  parts.push(
    `        <cbc:StreetName>${escapeXml(seller.street || 'Main Street')}</cbc:StreetName>`,
  );
  parts.push(
    `        <cbc:BuildingNumber>${escapeXml(seller.buildingNumber || '0000')}</cbc:BuildingNumber>`,
  );
  parts.push(
    `        <cbc:CitySubdivisionName>${escapeXml(seller.city || 'Riyadh')}</cbc:CitySubdivisionName>`,
  );
  parts.push(`        <cbc:CityName>${escapeXml(seller.city || 'Riyadh')}</cbc:CityName>`);
  parts.push(`        <cbc:PostalZone>${escapeXml(seller.postalCode || '12345')}</cbc:PostalZone>`);
  parts.push(`        <cac:Country>`);
  parts.push(
    `          <cbc:IdentificationCode>${escapeXml(seller.country || 'SA')}</cbc:IdentificationCode>`,
  );
  parts.push(`        </cac:Country>`);
  parts.push(`      </cac:PostalAddress>`);
  parts.push(`      <cac:PartyTaxScheme>`);
  parts.push(`        <cbc:CompanyID>${escapeXml(seller.vatNumber)}</cbc:CompanyID>`);
  parts.push(`        <cac:TaxScheme>`);
  parts.push(`          <cbc:ID>VAT</cbc:ID>`);
  parts.push(`        </cac:TaxScheme>`);
  parts.push(`      </cac:PartyTaxScheme>`);
  parts.push(`      <cac:PartyLegalEntity>`);
  parts.push(`        <cbc:RegistrationName>${escapeXml(seller.name)}</cbc:RegistrationName>`);
  parts.push(`      </cac:PartyLegalEntity>`);
  parts.push(`    </cac:Party>`);
  parts.push(`  </cac:AccountingSupplierParty>`);

  // ── AccountingCustomerParty (empty for simplified B2C) ──
  parts.push(`  <cac:AccountingCustomerParty>`);
  parts.push(`  </cac:AccountingCustomerParty>`);

  // ── Delivery (credit/debit notes only) ──
  if (isCorrection) {
    parts.push(`  <cac:Delivery>`);
    parts.push(`    <cbc:ActualDeliveryDate>${issueDate}</cbc:ActualDeliveryDate>`);
    parts.push(`  </cac:Delivery>`);
  }

  // ── PaymentMeans ──
  const instructionNote =
    input.paymentNote || (isCorrection ? 'Cancellation or Additional Charge' : undefined);
  parts.push(`  <cac:PaymentMeans>`);
  parts.push(`    <cbc:PaymentMeansCode>10</cbc:PaymentMeansCode>`);
  if (instructionNote) {
    parts.push(`    <cbc:InstructionNote>${escapeXml(instructionNote)}</cbc:InstructionNote>`);
  }
  parts.push(`  </cac:PaymentMeans>`);

  // ── Invoice-level AllowanceCharge (discount) ──
  if (discount > 0) {
    parts.push(`  <cac:AllowanceCharge>`);
    parts.push(`    <cbc:ChargeIndicator>false</cbc:ChargeIndicator>`);
    parts.push(`    <cbc:AllowanceChargeReason>discount</cbc:AllowanceChargeReason>`);
    parts.push(`    <cbc:Amount currencyID="SAR">${halalasToSar(discount)}</cbc:Amount>`);
    parts.push(`    <cac:TaxCategory>`);
    parts.push(`      <cbc:ID>${taxGroups.standard.rateBp > 0 ? 'S' : 'Z'}</cbc:ID>`);
    parts.push(`      <cbc:Percent>${(taxGroups.standard.rateBp / 100).toFixed(2)}</cbc:Percent>`);
    parts.push(`      <cac:TaxScheme>`);
    parts.push(`        <cbc:ID>VAT</cbc:ID>`);
    parts.push(`      </cac:TaxScheme>`);
    parts.push(`    </cac:TaxCategory>`);
    parts.push(`  </cac:AllowanceCharge>`);
  } else {
    // Always include a zero AllowanceCharge for XSD compliance
    parts.push(`  <cac:AllowanceCharge>`);
    parts.push(`    <cbc:ChargeIndicator>false</cbc:ChargeIndicator>`);
    parts.push(`    <cbc:AllowanceChargeReason>discount</cbc:AllowanceChargeReason>`);
    parts.push(`    <cbc:Amount currencyID="SAR">0.00</cbc:Amount>`);
    parts.push(`    <cac:TaxCategory>`);
    parts.push(`      <cbc:ID schemeAgencyID="6" schemeID="UN/ECE 5305">S</cbc:ID>`);
    parts.push(`      <cbc:Percent>15</cbc:Percent>`);
    parts.push(`      <cac:TaxScheme>`);
    parts.push(`        <cbc:ID schemeAgencyID="6" schemeID="UN/ECE 5153">VAT</cbc:ID>`);
    parts.push(`      </cac:TaxScheme>`);
    parts.push(`    </cac:TaxCategory>`);
    parts.push(`  </cac:AllowanceCharge>`);
  }

  // ── Tax Totals ──
  // First TaxTotal: VAT amount only (without TaxSubtotal) — required per XSD
  const totalVat = totalIncl - totalExcl;
  parts.push(`  <cac:TaxTotal>`);
  parts.push(`    <cbc:TaxAmount currencyID="SAR">${halalasToSar(totalVat)}</cbc:TaxAmount>`);
  parts.push(`  </cac:TaxTotal>`);

  // Additional TaxTotals with subtotals per rate
  for (const group of [taxGroups.standard, taxGroups.zeroRated]) {
    if (group.taxableAmount <= 0) continue;

    parts.push(`  <cac:TaxTotal>`);
    parts.push(
      `    <cbc:TaxAmount currencyID="SAR">${halalasToSar(group.vatAmount)}</cbc:TaxAmount>`,
    );
    parts.push(`    <cac:TaxSubtotal>`);
    parts.push(
      `      <cbc:TaxableAmount currencyID="SAR">${halalasToSar(group.taxableAmount)}</cbc:TaxableAmount>`,
    );
    parts.push(
      `      <cbc:TaxAmount currencyID="SAR">${halalasToSar(group.vatAmount)}</cbc:TaxAmount>`,
    );
    parts.push(`      <cac:TaxCategory>`);
    parts.push(
      `        <cbc:ID schemeAgencyID="6" schemeID="UN/ECE 5305">${group.rateBp === 0 ? 'Z' : 'S'}</cbc:ID>`,
    );
    parts.push(`        <cbc:Percent>${(group.rateBp / 100).toFixed(2)}</cbc:Percent>`);
    parts.push(`        <cac:TaxScheme>`);
    parts.push(`          <cbc:ID schemeAgencyID="6" schemeID="UN/ECE 5153">VAT</cbc:ID>`);
    parts.push(`        </cac:TaxScheme>`);
    parts.push(`      </cac:TaxCategory>`);
    parts.push(`    </cac:TaxSubtotal>`);
    parts.push(`  </cac:TaxTotal>`);
  }

  // ── Legal Monetary Total ──
  parts.push(`  <cac:LegalMonetaryTotal>`);
  parts.push(
    `    <cbc:LineExtensionAmount currencyID="SAR">${halalasToSar(totalExcl)}</cbc:LineExtensionAmount>`,
  );
  parts.push(
    `    <cbc:TaxExclusiveAmount currencyID="SAR">${halalasToSar(totalExcl)}</cbc:TaxExclusiveAmount>`,
  );
  parts.push(
    `    <cbc:TaxInclusiveAmount currencyID="SAR">${halalasToSar(totalIncl)}</cbc:TaxInclusiveAmount>`,
  );
  parts.push(
    `    <cbc:AllowanceTotalAmount currencyID="SAR">${halalasToSar(allowanceTotal)}</cbc:AllowanceTotalAmount>`,
  );
  parts.push(`    <cbc:PrepaidAmount currencyID="SAR">0.00</cbc:PrepaidAmount>`);
  parts.push(
    `    <cbc:PayableAmount currencyID="SAR">${halalasToSar(payableAmount)}</cbc:PayableAmount>`,
  );
  parts.push(`  </cac:LegalMonetaryTotal>`);

  // ── Invoice Lines ──
  for (const line of lines) {
    parts.push(`  <cac:InvoiceLine>`);
    parts.push(`    <cbc:ID>${line.index}</cbc:ID>`);
    parts.push(`    <cbc:InvoicedQuantity unitCode="PCE">${line.qty}</cbc:InvoicedQuantity>`);
    parts.push(
      `    <cbc:LineExtensionAmount currencyID="SAR">${halalasToSar(line.lineExcl)}</cbc:LineExtensionAmount>`,
    );

    parts.push(`    <cac:TaxTotal>`);
    parts.push(
      `      <cbc:TaxAmount currencyID="SAR">${halalasToSar(line.lineVat)}</cbc:TaxAmount>`,
    );
    parts.push(
      `      <cbc:RoundingAmount currencyID="SAR">${halalasToSar(line.lineTotalIncl)}</cbc:RoundingAmount>`,
    );
    parts.push(`    </cac:TaxTotal>`);

    // Item info
    parts.push(`    <cac:Item>`);
    parts.push(`      <cbc:Name>${line.name}</cbc:Name>`);
    parts.push(`      <cac:ClassifiedTaxCategory>`);
    parts.push(`        <cbc:ID>${line.vatRateBp === 0 ? 'Z' : 'S'}</cbc:ID>`);
    parts.push(`        <cbc:Percent>${(line.vatRateBp / 100).toFixed(2)}</cbc:Percent>`);
    parts.push(`        <cac:TaxScheme>`);
    parts.push(`          <cbc:ID>VAT</cbc:ID>`);
    parts.push(`        </cac:TaxScheme>`);
    parts.push(`      </cac:ClassifiedTaxCategory>`);
    parts.push(`    </cac:Item>`);

    // Price
    parts.push(`    <cac:Price>`);
    parts.push(
      `      <cbc:PriceAmount currencyID="SAR">${halalasToSar(line.unitPriceExcl)}</cbc:PriceAmount>`,
    );
    parts.push(`    </cac:Price>`);

    parts.push(`  </cac:InvoiceLine>`);
  }

  // ── Root closing ──
  parts.push(`</Invoice>`);

  return parts.join('\n');
}

// ── Tax Grouping ──────────────────────────────────────────────────────────────

interface TaxGroup {
  taxableAmount: number;
  vatAmount: number;
  rateBp: number;
}

interface TaxGroups {
  standard: TaxGroup;
  zeroRated: TaxGroup;
}

function groupTaxByRate(
  lines: Array<{ lineExcl: number; lineVat: number; vatRateBp: number }>,
): TaxGroups {
  const standard: TaxGroup = { taxableAmount: 0, vatAmount: 0, rateBp: 1500 };
  const zeroRated: TaxGroup = { taxableAmount: 0, vatAmount: 0, rateBp: 0 };

  for (const line of lines) {
    if (line.vatRateBp === 0) {
      zeroRated.taxableAmount += line.lineExcl;
    } else {
      standard.taxableAmount += line.lineExcl;
      standard.vatAmount += line.lineVat;
      standard.rateBp = line.vatRateBp;
    }
  }

  return { standard, zeroRated };
}

// ── XML Escaping ──────────────────────────────────────────────────────────────

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
