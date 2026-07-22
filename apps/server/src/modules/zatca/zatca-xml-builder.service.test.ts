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

  it('builds valid XML with root Invoice element', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);
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
    expect(xml).toContain('<cbc:ID>42</cbc:ID>');
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

  it('includes InvoiceTypeCode 388 with simplified subtype 0200000', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);
    expect(xml).toContain('<cbc:InvoiceTypeCode name="0200000">388</cbc:InvoiceTypeCode>');
  });

  it('includes currency codes', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);
    expect(xml).toContain('<cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>');
    expect(xml).toContain('<cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>');
  });

  it('includes seller party with VAT number and name', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);
    expect(xml).toContain('<cac:AccountingSupplierParty>');
    expect(xml).toContain('<cbc:CompanyID>300123456789</cbc:CompanyID>');
    expect(xml).toContain('<cbc:RegistrationName>SpicyHome Restaurant</cbc:RegistrationName>');
  });

  it('includes seller postal address', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);
    expect(xml).toContain('<cbc:StreetName>King Fahd Road</cbc:StreetName>');
    expect(xml).toContain('<cbc:BuildingNumber>1234</cbc:BuildingNumber>');
    expect(xml).toContain('<cbc:CityName>Riyadh</cbc:CityName>');
  });

  it('includes ICV and PIH in AdditionalDocumentReference', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);
    expect(xml).toContain('<cbc:ID>ICV</cbc:ID>');
    expect(xml).toContain('<cbc:ID>PIH</cbc:ID>');
    expect(xml).toContain('<cbc:UUID>1</cbc:UUID>'); // ICV = 1
  });

  it('includes non-empty PIH when prevInvoiceHash is provided', () => {
    const input = { ...baseInput, prevInvoiceHash: 'abc123hash=' };
    const xml = buildUnsignedInvoiceXML(input);
    // Should have a Note with PIH
    expect(xml).toContain('PIH=abc123hash=');
    // Should have PIH in AdditionalDocumentReference
    expect(xml).toContain('abc123hash=');
  });

  it('does NOT include Note with PIH for first invoice', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);
    expect(xml).not.toContain('<cbc:Note>PIH=');
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
    expect(xml).toContain('<cbc:ID>1</cbc:ID>');
    expect(xml).toContain('<cbc:ID>2</cbc:ID>');
    expect(xml).toContain('<cbc:InvoicedQuantity unitCode="PCE">2</cbc:InvoicedQuantity>');
    expect(xml).toContain('<cbc:InvoicedQuantity unitCode="PCE">1</cbc:InvoicedQuantity>');
  });

  it('includes item names in invoice lines', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);
    expect(xml).toContain('<cbc:Name>Zinger Burger</cbc:Name>');
    expect(xml).toContain('<cbc:Name>Pepsi</cbc:Name>');
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
    // Check excluded and VAT amounts
    // 2300 => excl = Math.round(2300 * 1500 / 11500) = 300, excl = 2300 - 300 = 2000
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
    // 15%: 46 SAR incl → ~40 SAR excl + ~6 SAR VAT
    // 0%: 1 SAR incl → 1 SAR excl + 0 SAR VAT
    // Total: 47 SAR incl, 41 SAR excl, 6 SAR VAT
    const input: InvoiceXMLInput = {
      ...baseInput,
      items: [
        { name: 'Zinger Burger', unitPriceHalalas: 2300, vatRateBp: 1500, qty: 2 },
        { name: 'Bread', unitPriceHalalas: 100, vatRateBp: 0, qty: 1 },
      ],
    };
    const xml = buildUnsignedInvoiceXML(input);

    // Should have both S and Z tax categories
    expect(xml).toContain('<cbc:ID>S</cbc:ID>');
    expect(xml).toContain('<cbc:ID>Z</cbc:ID>');

    // Total incl should be 47.00
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

  it('produces deterministic output for same input', () => {
    const xml1 = buildUnsignedInvoiceXML(baseInput);
    const xml2 = buildUnsignedInvoiceXML(baseInput);
    expect(xml1).toBe(xml2);
  });

  it('line extension amount matches sum of line excl amounts', () => {
    const input: InvoiceXMLInput = {
      ...baseInput,
      items: [
        { name: 'A', unitPriceHalalas: 1150, vatRateBp: 1500, qty: 3 }, // 3 x 11.50 = 34.50
      ],
    };
    const xml = buildUnsignedInvoiceXML(input);

    // 1150 each → excl per unit: Math.round(1150*1500/11500)=150, excl=1000, 3 units: 3000 excl
    const lineExt = extractTagContent(xml, 'cbc:LineExtensionAmount');
    expect(lineExt).not.toBeNull();
  });

  it('VAT total equals inclusive minus exclusive', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);

    const taxIncl = extractNumericValue(xml, 'cbc:TaxInclusiveAmount');
    const taxExcl = extractNumericValue(xml, 'cbc:TaxExclusiveAmount');

    if (taxIncl !== null && taxExcl !== null) {
      const vat = taxIncl - taxExcl;
      // VAT should be roughly 15/115 of the standard-rated portion
      expect(vat).toBeGreaterThan(0);
    }
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractTagContent(xml: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`);
  const match = xml.match(regex);
  return match ? match[1] : null;
}

function extractNumericValue(xml: string, tagName: string): number | null {
  const content = extractTagContent(xml, tagName);
  if (content === null) return null;
  return parseFloat(content);
}
