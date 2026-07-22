/**
 * ZATCA UBL 2.1 Simplified Invoice XML Builder.
 *
 * Generates a KSA-2 profile simplified tax invoice (B2C) from an order
 * and seller configuration. Output is a deterministic XML string
 * (no extraneous whitespace between tags) suitable for hashing.
 *
 * Profile:
 *   - InvoiceTypeCode: 388 (tax invoice) with subtype "0200000" (simplified)
 *   - No Buyer legal data (simplified B2C — buyer is anonymous)
 *   - Line items with VAT-inclusive prices (compute excl. via decomposeVat)
 *   - Tax totals: 15% standard rate and zero-rated support
 *   - Seller: name, VAT number, CR placeholder, address placeholders
 */

import { decomposeVat, sarToHalalas, halalasToSar } from '@spicyhome/shared';

// ── Types ─────────────────────────────────────────────────────────────────────

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
  /** Street name — placeholder if not configured */
  street?: string;
  /** Building number — placeholder if not configured */
  buildingNumber?: string;
  /** City */
  city?: string;
  /** Postal code */
  postalCode?: string;
  /** Country (default SA) */
  country?: string;
}

export interface InvoiceXMLInput {
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
}

// ── XML Builder ───────────────────────────────────────────────────────────────

/**
 * Build the unsigned UBL 2.1 simplified invoice XML.
 *
 * The XML does NOT include a UBLExtensions / signature block.
 * That is injected later by `embedSignatureIntoXML`.
 *
 * Namespace conventions:
 *   - Default namespace: urn:oasis:names:specification:ubl:schema:xsd:Invoice-2
 *   - cac: CommonAggregateComponents-2
 *   - cbc: CommonBasicComponents-2
 *   - ext: CommonExtensionComponents-2
 *
 * Deterministic serialization: no self-closing tags where possible,
 * consistent indentation, no extraneous whitespace around values.
 */
export function buildUnsignedInvoiceXML(input: InvoiceXMLInput): string {
  const { icv, uuid, issueDate, issueTime, seller, items, discountHalalas, prevInvoiceHash } =
    input;

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
  const totalVat = totalIncl - totalExcl;

  // Discount
  const discount = discountHalalas ?? 0;
  const allowanceTotal = discount;
  const payableAmount = totalIncl - discount;

  // Group tax by rate for tax totals
  const taxGroups = groupTaxByRate(lines);

  // Build XML parts
  const parts: string[] = [];

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

  // InvoiceTypeCode — simplified tax invoice
  parts.push(`  <cbc:InvoiceTypeCode name="0200000">388</cbc:InvoiceTypeCode>`);

  // Invoice Document Currency
  parts.push(`  <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>`);
  parts.push(`  <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>`);

  // ── Invoice Note for PIH ──
  if (prevInvoiceHash) {
    parts.push(`  <cbc:Note>PIH=${prevInvoiceHash}</cbc:Note>`);
  }

  // ── AdditionalDocumentReference for ICV and PIH ──
  // ICV
  parts.push(`  <cac:AdditionalDocumentReference>`);
  parts.push(`    <cbc:ID>ICV</cbc:ID>`);
  parts.push(`    <cbc:UUID>${icv}</cbc:UUID>`);
  parts.push(`  </cac:AdditionalDocumentReference>`);

  // PIH
  parts.push(`  <cac:AdditionalDocumentReference>`);
  parts.push(`    <cbc:ID>PIH</cbc:ID>`);
  parts.push(`    <cac:Attachment>`);
  parts.push(
    `      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${prevInvoiceHash || 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjYzQ0OTg1YTJlN2I3MjZiZTk3Mjg3YjUyZjFhM2E0M2Q1YjViMTI5Zg=='}</cbc:EmbeddedDocumentBinaryObject>`,
  );
  parts.push(`    </cac:Attachment>`);
  parts.push(`  </cac:AdditionalDocumentReference>`);

  // ── Seller (AccountingSupplierParty) ──
  parts.push(`  <cac:AccountingSupplierParty>`);
  parts.push(`    <cac:Party>`);
  parts.push(`      <cac:PartyIdentification>`);
  parts.push(`        <cbc:ID schemeID="CRN">${escapeXml(seller.vatNumber)}</cbc:ID>`);
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
  parts.push(
    `        <cbc:CountrySubentity>${escapeXml(seller.city || 'Riyadh')}</cbc:CountrySubentity>`,
  );
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

  // ── Invoice Lines ──
  for (const line of lines) {
    parts.push(`  <cac:InvoiceLine>`);
    parts.push(`    <cbc:ID>${line.index}</cbc:ID>`);
    parts.push(`    <cbc:InvoicedQuantity unitCode="PCE">${line.qty}</cbc:InvoicedQuantity>`);
    parts.push(
      `    <cbc:LineExtensionAmount currencyID="SAR">${halalasToSar(line.lineExcl)}</cbc:LineExtensionAmount>`,
    );

    // Tax total for this line
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
    // Tax category per item
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
    parts.push(`      <cac:AllowanceCharge>`);
    parts.push(`        <cbc:ChargeIndicator>false</cbc:ChargeIndicator>`);
    parts.push(`        <cbc:Amount currencyID="SAR">0.00</cbc:Amount>`);
    parts.push(`      </cac:AllowanceCharge>`);
    parts.push(`    </cac:Price>`);

    parts.push(`  </cac:InvoiceLine>`);
  }

  // ── Tax Totals ──
  // Standard rate
  if (taxGroups.standard.vatAmount > 0) {
    parts.push(`  <cac:TaxTotal>`);
    parts.push(
      `    <cbc:TaxAmount currencyID="SAR">${halalasToSar(taxGroups.standard.vatAmount)}</cbc:TaxAmount>`,
    );
    parts.push(`    <cac:TaxSubtotal>`);
    parts.push(
      `      <cbc:TaxableAmount currencyID="SAR">${halalasToSar(taxGroups.standard.taxableAmount)}</cbc:TaxableAmount>`,
    );
    parts.push(
      `      <cbc:TaxAmount currencyID="SAR">${halalasToSar(taxGroups.standard.vatAmount)}</cbc:TaxAmount>`,
    );
    parts.push(`      <cac:TaxCategory>`);
    parts.push(`        <cbc:ID>S</cbc:ID>`);
    parts.push(
      `        <cbc:Percent>${(taxGroups.standard.rateBp / 100).toFixed(2)}</cbc:Percent>`,
    );
    parts.push(`        <cac:TaxScheme>`);
    parts.push(`          <cbc:ID>VAT</cbc:ID>`);
    parts.push(`        </cac:TaxScheme>`);
    parts.push(`      </cac:TaxCategory>`);
    parts.push(`    </cac:TaxSubtotal>`);
    parts.push(`  </cac:TaxTotal>`);
  }

  // Zero-rated
  if (taxGroups.zeroRated.vatAmount >= 0 && taxGroups.zeroRated.taxableAmount > 0) {
    parts.push(`  <cac:TaxTotal>`);
    parts.push(`    <cbc:TaxAmount currencyID="SAR">0.00</cbc:TaxAmount>`);
    parts.push(`    <cac:TaxSubtotal>`);
    parts.push(
      `      <cbc:TaxableAmount currencyID="SAR">${halalasToSar(taxGroups.zeroRated.taxableAmount)}</cbc:TaxableAmount>`,
    );
    parts.push(`      <cbc:TaxAmount currencyID="SAR">0.00</cbc:TaxAmount>`);
    parts.push(`      <cac:TaxCategory>`);
    parts.push(`        <cbc:ID>Z</cbc:ID>`);
    parts.push(`        <cbc:Percent>0.00</cbc:Percent>`);
    parts.push(`        <cac:TaxScheme>`);
    parts.push(`          <cbc:ID>VAT</cbc:ID>`);
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
  if (allowanceTotal > 0) {
    parts.push(
      `    <cbc:AllowanceTotalAmount currencyID="SAR">${halalasToSar(allowanceTotal)}</cbc:AllowanceTotalAmount>`,
    );
  }
  parts.push(
    `    <cbc:PayableAmount currencyID="SAR">${halalasToSar(payableAmount)}</cbc:PayableAmount>`,
  );
  parts.push(`  </cac:LegalMonetaryTotal>`);

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
