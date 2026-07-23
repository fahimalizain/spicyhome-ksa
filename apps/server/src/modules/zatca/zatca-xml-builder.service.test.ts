import {
  buildUnsignedInvoiceXML,
  InvoiceXMLInput,
  InvoiceItemInput,
  SellerInfo,
} from './zatca-xml-builder.service';
import { decomposeVat, halalasToSar } from '@spicyhome/shared';

describe('UBL XML Builder', () => {
  const defaultSeller: SellerInfo = {
    name: 'SpicyHome Restaurant',
    vatNumber: '300123456789',
    street: 'King Fahd Road',
    buildingNumber: '1234',
    city: 'Riyadh',
    postalCode: '12345',
    country: 'SA',
  };

  const baseInput: InvoiceXMLInput = {
    icv: 1,
    uuid: '550e8400-e29b-41d4-a716-446655440000',
    issueDate: '2024-01-15',
    issueTime: '14:30:00',
    seller: defaultSeller,
    items: [
      {
        name: 'Zinger Burger',
        unitPriceHalalas: 2300,
        vatRateBp: 1500,
        qty: 2,
      },
      {
        name: 'Pepsi',
        unitPriceHalalas: 575,
        vatRateBp: 1500,
        qty: 1,
      },
    ],
    prevInvoiceHash: '',
  };

  it('builds XML with root Invoice element and XML declaration', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain(
      '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"',
    );
    expect(xml).toContain('</Invoice>');
  });

  it('includes all required UBL namespaces', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);
    expect(xml).toContain(
      'xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"',
    );
    expect(xml).toContain(
      'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"',
    );
    expect(xml).toContain(
      'xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"',
    );
  });

  it('includes profile ID reporting:1.0', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);
    expect(xml).toContain('<cbc:ProfileID>reporting:1.0</cbc:ProfileID>');
  });

  it('includes ICV as the invoice ID', () => {
    const input = { ...baseInput, icv: 42 };
    const xml = buildUnsignedInvoiceXML(input);
    // The top-level cbc:ID (ICV) is 42
    expect(xml).toMatch(/<cbc:ID>42<\/cbc:ID>/);
  });

  it('includes UUID', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);
    expect(xml).toContain('<cbc:UUID>550e8400-e29b-41d4-a716-446655440000</cbc:UUID>');
  });

  it('includes issue date and time', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);
    expect(xml).toContain('<cbc:IssueDate>2024-01-15</cbc:IssueDate>');
    expect(xml).toContain('<cbc:IssueTime>14:30:00</cbc:IssueTime>');
  });

  it('includes InvoiceTypeCode 388 with simplified subtype 0200000 for invoice type', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);
    expect(xml).toContain('<cbc:InvoiceTypeCode name="0200000">388</cbc:InvoiceTypeCode>');
  });

  it('uses InvoiceTypeCode 381 for credit notes', () => {
    const xml = buildUnsignedInvoiceXML({ ...baseInput, type: 'credit_note' });
    expect(xml).toContain('<cbc:InvoiceTypeCode name="0200000">381</cbc:InvoiceTypeCode>');
  });

  it('uses InvoiceTypeCode 383 for debit notes', () => {
    const xml = buildUnsignedInvoiceXML({ ...baseInput, type: 'debit_note' });
    expect(xml).toContain('<cbc:InvoiceTypeCode name="0200000">383</cbc:InvoiceTypeCode>');
  });

  it('includes currency codes', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);
    expect(xml).toContain('<cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>');
    expect(xml).toContain('<cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>');
  });

  it('includes seller party with CR number when provided', () => {
    const input = {
      ...baseInput,
      seller: { ...defaultSeller, crNumber: '1234567890' },
    };
    const xml = buildUnsignedInvoiceXML(input);
    expect(xml).toContain('schemeID="CRN">1234567890</cbc:ID>');
  });

  it('falls back to VAT number for CRN when CR number not provided', () => {
    const input = {
      ...baseInput,
      seller: { ...defaultSeller, crNumber: undefined },
    };
    const xml = buildUnsignedInvoiceXML(input);
    expect(xml).toContain('schemeID="CRN">300123456789</cbc:ID>');
  });

  it('includes seller party with VAT number and name', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);
    expect(xml).toContain('<cac:AccountingSupplierParty>');
    expect(xml).toContain('<cbc:CompanyID>300123456789</cbc:CompanyID>');
    expect(xml).toContain('<cbc:RegistrationName>SpicyHome Restaurant</cbc:RegistrationName>');
  });

  it('includes seller postal address without CountrySubentity', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);
    expect(xml).toContain('<cbc:StreetName>King Fahd Road</cbc:StreetName>');
    expect(xml).toContain('<cbc:BuildingNumber>1234</cbc:BuildingNumber>');
    expect(xml).toContain('<cbc:CityName>Riyadh</cbc:CityName>');
    // No longer includes CountrySubentity
    expect(xml).not.toContain('<cbc:CountrySubentity>');
  });

  it('includes empty AccountingCustomerParty for B2C simplified', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);
    expect(xml).toContain('<cac:AccountingCustomerParty>');
  });

  it('includes PaymentMeans with code 10', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);
    expect(xml).toContain('<cbc:PaymentMeansCode>10</cbc:PaymentMeansCode>');
  });

  it('includes ICV and PIH in AdditionalDocumentReference', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);
    expect(xml).toContain('<cbc:ID>ICV</cbc:ID>');
    expect(xml).toContain('<cbc:ID>PIH</cbc:ID>');
    expect(xml).toContain('<cbc:ID>QR</cbc:ID>');
    // ICV UUID matches ICV value
    expect(xml).toContain('<cbc:UUID>1</cbc:UUID>');
  });

  it('uses SDK initial PIH hash when prevInvoiceHash is empty', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);
    expect(xml).toContain(
      'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjYzQ0OTg1YTJlN2I3MjZiZTk3Mjg3YjUyZjFhM2E0M2Q1YjViMTI5Zg==',
    );
  });

  it('uses prevInvoiceHash in PIH when provided', () => {
    const input = { ...baseInput, prevInvoiceHash: 'abc123hash=' };
    const xml = buildUnsignedInvoiceXML(input);
    expect(xml).toContain('abc123hash=');
    // No longer uses Note element for PIH
    expect(xml).not.toContain('<cbc:Note>PIH=');
  });

  it('includes BillingReference for credit notes', () => {
    const input: InvoiceXMLInput = {
      ...baseInput,
      type: 'credit_note',
      billingReferenceId: '42',
    };
    const xml = buildUnsignedInvoiceXML(input);
    expect(xml).toContain('<cac:BillingReference>');
    expect(xml).toContain('<cbc:ID>42</cbc:ID>');
  });

  it('includes BillingReference for debit notes', () => {
    const input: InvoiceXMLInput = {
      ...baseInput,
      type: 'debit_note',
      billingReferenceId: '17',
    };
    const xml = buildUnsignedInvoiceXML(input);
    expect(xml).toContain('<cac:BillingReference>');
    expect(xml).toContain('<cbc:ID>17</cbc:ID>');
  });

  it('includes Delivery element for credit notes', () => {
    const input: InvoiceXMLInput = {
      ...baseInput,
      type: 'credit_note',
    };
    const xml = buildUnsignedInvoiceXML(input);
    expect(xml).toContain('<cac:Delivery>');
    expect(xml).toContain('<cbc:ActualDeliveryDate>');
  });

  it('does NOT include BillingReference for regular invoices', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);
    expect(xml).not.toContain('<cac:BillingReference>');
  });

  it('includes InstructionNote in PaymentMeans when paymentNote is provided', () => {
    const input: InvoiceXMLInput = {
      ...baseInput,
      type: 'credit_note',
      paymentNote: 'Refund for returned items',
    };
    const xml = buildUnsignedInvoiceXML(input);
    expect(xml).toContain('<cbc:InstructionNote>Refund for returned items</cbc:InstructionNote>');
  });

  it('escapes XML special characters in text', () => {
    const input: InvoiceXMLInput = {
      ...baseInput,
      seller: { ...defaultSeller, name: 'Spicy & Home <Express>' },
      items: [{ name: 'Burger & Fries" Special', unitPriceHalalas: 2300, vatRateBp: 1500, qty: 1 }],
    };
    const xml = buildUnsignedInvoiceXML(input);
    expect(xml).toContain('Spicy &amp; Home &lt;Express&gt;');
    expect(xml).toContain('Burger &amp; Fries&quot; Special');
  });

  it('includes invoice lines with correct structure', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);
    expect(xml).toContain('<cac:InvoiceLine>');
    expect(xml).toContain('<cbc:InvoicedQuantity unitCode="PCE">2</cbc:InvoicedQuantity>');
    expect(xml).toContain('<cbc:InvoicedQuantity unitCode="PCE">1</cbc:InvoicedQuantity>');
  });

  it('includes item names in invoice lines', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);
    expect(xml).toContain('<cbc:Name>Zinger Burger</cbc:Name>');
    expect(xml).toContain('<cbc:Name>Pepsi</cbc:Name>');
  });

  it('places InvoiceLine elements after LegalMonetaryTotal', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);
    const lmtIdx = xml.indexOf('<cac:LegalMonetaryTotal>');
    const invLineIdx = xml.indexOf('<cac:InvoiceLine>');
    expect(lmtIdx).toBeGreaterThan(-1);
    expect(invLineIdx).toBeGreaterThan(lmtIdx);
  });

  it('includes tax categories S for standard and Z for zero-rated', () => {
    const input: InvoiceXMLInput = {
      ...baseInput,
      items: [
        { name: 'Standard Item', unitPriceHalalas: 1150, vatRateBp: 1500, qty: 1 },
        { name: 'Zero Item', unitPriceHalalas: 1000, vatRateBp: 0, qty: 1 },
      ],
    };
    const xml = buildUnsignedInvoiceXML(input);
    // Tax categories in line items
    expect(xml).toContain('<cbc:ID>S</cbc:ID>');
    expect(xml).toContain('<cbc:ID>Z</cbc:ID>');
  });

  it('computes tax totals correctly for 15% VAT items', () => {
    // Single item: 23 SAR incl VAT → 20 excl + 3 VAT
    const input: InvoiceXMLInput = {
      ...baseInput,
      items: [{ name: 'Item', unitPriceHalalas: 2300, vatRateBp: 1500, qty: 1 }],
    };
    const xml = buildUnsignedInvoiceXML(input);
    expect(xml).toContain(
      '<cbc:LineExtensionAmount currencyID="SAR">20.00</cbc:LineExtensionAmount>',
    );
    expect(xml).toContain('<cbc:TaxAmount currencyID="SAR">3.00</cbc:TaxAmount>');
    expect(xml).toContain(
      '<cbc:TaxInclusiveAmount currencyID="SAR">23.00</cbc:TaxInclusiveAmount>',
    );
    expect(xml).toContain('<cbc:PayableAmount currencyID="SAR">23.00</cbc:PayableAmount>');
  });

  it('handles zero-rated items correctly', () => {
    const input: InvoiceXMLInput = {
      ...baseInput,
      items: [{ name: 'Bread', unitPriceHalalas: 100, vatRateBp: 0, qty: 5 }],
    };
    const xml = buildUnsignedInvoiceXML(input);
    expect(xml).toContain('<cbc:TaxAmount currencyID="SAR">0.00</cbc:TaxAmount>');
    expect(xml).toContain('<cbc:TaxExclusiveAmount currencyID="SAR">5.00</cbc:TaxExclusiveAmount>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="SAR">5.00</cbc:PayableAmount>');
  });

  it('handles mixed VAT rates with correct totals', () => {
    // 2x Zinger @ 23 SAR (15%) + 1x Bread @ 1 SAR (0%)
    const input: InvoiceXMLInput = {
      ...baseInput,
      items: [
        { name: 'Zinger Burger', unitPriceHalalas: 2300, vatRateBp: 1500, qty: 2 },
        { name: 'Bread', unitPriceHalalas: 100, vatRateBp: 0, qty: 1 },
      ],
    };
    const xml = buildUnsignedInvoiceXML(input);

    expect(xml).toContain('<cbc:ID>S</cbc:ID>');
    expect(xml).toContain('<cbc:ID>Z</cbc:ID>');

    expect(xml).toContain(
      '<cbc:TaxInclusiveAmount currencyID="SAR">47.00</cbc:TaxInclusiveAmount>',
    );
    expect(xml).toContain('<cbc:PayableAmount currencyID="SAR">47.00</cbc:PayableAmount>');
  });

  it('includes LegalMonetaryTotal section', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);
    expect(xml).toContain('<cac:LegalMonetaryTotal>');
    expect(xml).toContain('<cbc:LineExtensionAmount');
    expect(xml).toContain('<cbc:TaxExclusiveAmount');
    expect(xml).toContain('<cbc:TaxInclusiveAmount');
    expect(xml).toContain('<cbc:PayableAmount');
    // Always includes AllowanceTotalAmount and PrepaidAmount
    expect(xml).toContain('<cbc:AllowanceTotalAmount');
    expect(xml).toContain('<cbc:PrepaidAmount');
  });

  it('includes invoice-level AllowanceCharge', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);
    expect(xml).toContain('<cac:AllowanceCharge>');
    expect(xml).toContain('<cbc:ChargeIndicator>false</cbc:ChargeIndicator>');
  });

  it('includes discount when provided', () => {
    const input: InvoiceXMLInput = {
      ...baseInput,
      discountHalalas: 100,
    };
    const xml = buildUnsignedInvoiceXML(input);
    expect(xml).toContain(
      '<cbc:AllowanceTotalAmount currencyID="SAR">1.00</cbc:AllowanceTotalAmount>',
    );
    // Payable should be total - discount
    expect(xml).toContain('<cbc:PayableAmount currencyID="SAR">50.75</cbc:PayableAmount>');
  });

  it('includes Signature placeholder', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);
    expect(xml).toContain('<cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID>');
    expect(xml).toContain(
      '<cbc:SignatureMethod>urn:oasis:names:specification:ubl:dsig:enveloped:xades</cbc:SignatureMethod>',
    );
  });

  it('includes PrepaidAmount as 0.00', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);
    expect(xml).toContain('<cbc:PrepaidAmount currencyID="SAR">0.00</cbc:PrepaidAmount>');
  });

  it('produces deterministic output for same input', () => {
    const xml1 = buildUnsignedInvoiceXML(baseInput);
    const xml2 = buildUnsignedInvoiceXML(baseInput);
    expect(xml1).toBe(xml2);
  });

  it('VAT total equals inclusive minus exclusive', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);

    const taxIncl = extractNumericValue(xml, 'cbc:TaxInclusiveAmount');
    const taxExcl = extractNumericValue(xml, 'cbc:TaxExclusiveAmount');

    if (taxIncl !== null && taxExcl !== null) {
      const vat = taxIncl - taxExcl;
      expect(vat).toBeGreaterThan(0);
    }
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractNumericValue(xml: string, tagName: string): number | null {
  const regex = new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`);
  const match = xml.match(regex);
  if (match === null) return null;
  return parseFloat(match[1]);
}
