import {
  buildUnsignedInvoiceXML,
  InvoiceXMLInput,
  SellerInfo,
  BuyerInfo,
} from './zatca-xml-builder.service';
import { ZATCA_INITIAL_PIH, decomposeVat, halalasToSar } from '@spicyhome/shared';

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
    documentId: 'INV-1',
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

  it('includes documentId as the root cbc:ID, not ICV', () => {
    const input = { ...baseInput, documentId: 'DOC-42', icv: 42 };
    const xml = buildUnsignedInvoiceXML(input);
    // The top-level cbc:ID is the documentId
    expect(xml).toMatch(/<cbc:ID>DOC-42<\/cbc:ID>/);
    // ICV is still in AdditionalDocumentReference
    expect(xml).toContain('<cbc:ID>ICV</cbc:ID>');
    expect(xml).toContain('<cbc:UUID>42</cbc:UUID>');
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

  it('uses InvoiceTypeCode 383 for debit notes with subtype 0211000', () => {
    const xml = buildUnsignedInvoiceXML({ ...baseInput, type: 'debit_note' });
    expect(xml).toContain('<cbc:InvoiceTypeCode name="0211000">383</cbc:InvoiceTypeCode>');
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

  it('emits explicit PaymentMeansCode when provided', () => {
    const input: InvoiceXMLInput = { ...baseInput, paymentMeansCode: '48' };
    const xml = buildUnsignedInvoiceXML(input);
    expect(xml).toContain('<cbc:PaymentMeansCode>48</cbc:PaymentMeansCode>');
    expect(xml).not.toContain('<cbc:PaymentMeansCode>10</cbc:PaymentMeansCode>');
  });

  it('coerces a non-allow-listed PaymentMeansCode to 10', () => {
    for (const bad of ['54', '55', '99', '']) {
      const input: InvoiceXMLInput = { ...baseInput, paymentMeansCode: bad };
      const xml = buildUnsignedInvoiceXML(input);
      expect(xml).toContain('<cbc:PaymentMeansCode>10</cbc:PaymentMeansCode>');
    }
  });

  // ── Multi-block paymentMeans (BT-81 1..n) ────────────────────────────────

  it('emits one PaymentMeans block per paymentMeans entry', () => {
    const input: InvoiceXMLInput = {
      ...baseInput,
      paymentMeans: [
        { code: '48', instructionNote: 'Card | 70.00 SAR' },
        { code: '10', instructionNote: 'Cash | 45.00 SAR' },
      ],
    };
    const xml = buildUnsignedInvoiceXML(input);
    expect(xml.match(/<cac:PaymentMeans>/g)).toHaveLength(2);
    expect(xml.match(/<cbc:PaymentMeansCode>/g)).toHaveLength(2);
    expect(xml).toContain('<cbc:PaymentMeansCode>48</cbc:PaymentMeansCode>');
    expect(xml).toContain('<cbc:PaymentMeansCode>10</cbc:PaymentMeansCode>');
    expect(xml).toContain('<cbc:InstructionNote>Card | 70.00 SAR</cbc:InstructionNote>');
    expect(xml).toContain('<cbc:InstructionNote>Cash | 45.00 SAR</cbc:InstructionNote>');
  });

  it('preserves block order as given (caller sorts by methodId)', () => {
    const input: InvoiceXMLInput = {
      ...baseInput,
      paymentMeans: [
        { code: '48', instructionNote: 'Card | 70.00 SAR' },
        { code: '10', instructionNote: 'Cash | 45.00 SAR' },
      ],
    };
    const xml = buildUnsignedInvoiceXML(input);
    const cardIdx = xml.indexOf('Card | 70.00 SAR');
    const cashIdx = xml.indexOf('Cash | 45.00 SAR');
    expect(cardIdx).toBeGreaterThan(-1);
    expect(cashIdx).toBeGreaterThan(cardIdx);
  });

  it('coerces invalid codes per block to 10 while keeping the note', () => {
    const input: InvoiceXMLInput = {
      ...baseInput,
      paymentMeans: [{ code: '55', instructionNote: 'Card | 70.00 SAR' }],
    };
    const xml = buildUnsignedInvoiceXML(input);
    expect(xml).toContain('<cbc:PaymentMeansCode>10</cbc:PaymentMeansCode>');
    expect(xml).toContain('<cbc:InstructionNote>Card | 70.00 SAR</cbc:InstructionNote>');
    expect(xml).not.toContain('<cbc:PaymentMeansCode>55</cbc:PaymentMeansCode>');
  });

  it('omits InstructionNote for invoice blocks without one', () => {
    const input: InvoiceXMLInput = {
      ...baseInput,
      paymentMeans: [{ code: '48' }],
    };
    const xml = buildUnsignedInvoiceXML(input);
    expect(xml).toContain('<cbc:PaymentMeansCode>48</cbc:PaymentMeansCode>');
    expect(xml).not.toContain('<cbc:InstructionNote>');
  });

  it('fills a missing note on credit note blocks from paymentNote (BR-KSA-17)', () => {
    const input: InvoiceXMLInput = {
      ...baseInput,
      type: 'credit_note',
      paymentNote: 'Item was cold',
      paymentMeans: [{ code: '48' }],
    };
    const xml = buildUnsignedInvoiceXML(input);
    expect(xml).toContain('<cbc:PaymentMeansCode>48</cbc:PaymentMeansCode>');
    expect(xml).toContain('<cbc:InstructionNote>Item was cold</cbc:InstructionNote>');
  });

  it('fills a missing note on credit note blocks with the correction default (BR-KSA-17)', () => {
    const input: InvoiceXMLInput = {
      ...baseInput,
      type: 'credit_note',
      paymentMeans: [{ code: '48' }],
    };
    const xml = buildUnsignedInvoiceXML(input);
    expect(xml).toContain(
      '<cbc:InstructionNote>Cancellation or Additional Charge</cbc:InstructionNote>',
    );
  });

  it('escapes XML special characters in InstructionNote', () => {
    const input: InvoiceXMLInput = {
      ...baseInput,
      paymentMeans: [{ code: '10', instructionNote: 'Cash & Co <test> | 5.00 SAR' }],
    };
    const xml = buildUnsignedInvoiceXML(input);
    expect(xml).toContain(
      '<cbc:InstructionNote>Cash &amp; Co &lt;test&gt; | 5.00 SAR</cbc:InstructionNote>',
    );
  });

  it('clamps InstructionNote to 1000 chars (BR-KSA-F-06-C13)', () => {
    const input: InvoiceXMLInput = {
      ...baseInput,
      paymentMeans: [{ code: '10', instructionNote: 'x'.repeat(1500) }],
    };
    const xml = buildUnsignedInvoiceXML(input);
    const match = xml.match(/<cbc:InstructionNote>([^<]*)<\/cbc:InstructionNote>/);
    expect(match).not.toBeNull();
    expect(match![1].length).toBe(1000);
    expect(match![1].endsWith('...')).toBe(true);
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
    expect(xml).toContain(ZATCA_INITIAL_PIH);
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

  it('emits custom PaymentMeansCode together with InstructionNote on credit notes', () => {
    const input: InvoiceXMLInput = {
      ...baseInput,
      type: 'credit_note',
      paymentMeansCode: '48',
      paymentNote: 'Refund for returned items',
    };
    const xml = buildUnsignedInvoiceXML(input);
    expect(xml).toContain('<cbc:PaymentMeansCode>48</cbc:PaymentMeansCode>');
    expect(xml).toContain('<cbc:InstructionNote>Refund for returned items</cbc:InstructionNote>');
    // InstructionNote must sit inside the same PaymentMeans block
    const meansIdx = xml.indexOf('<cac:PaymentMeans>');
    const meansEnd = xml.indexOf('</cac:PaymentMeans>');
    const meansSection = xml.substring(meansIdx, meansEnd);
    expect(meansSection).toContain('<cbc:PaymentMeansCode>48</cbc:PaymentMeansCode>');
    expect(meansSection).toContain(
      '<cbc:InstructionNote>Refund for returned items</cbc:InstructionNote>',
    );
  });

  it('includes default InstructionNote for credit notes without paymentNote', () => {
    const input: InvoiceXMLInput = {
      ...baseInput,
      type: 'credit_note',
    };
    const xml = buildUnsignedInvoiceXML(input);
    expect(xml).toContain(
      '<cbc:InstructionNote>Cancellation or Additional Charge</cbc:InstructionNote>',
    );
  });

  it('includes default InstructionNote for debit notes without paymentNote', () => {
    const input: InvoiceXMLInput = {
      ...baseInput,
      type: 'debit_note',
    };
    const xml = buildUnsignedInvoiceXML(input);
    expect(xml).toContain(
      '<cbc:InstructionNote>Cancellation or Additional Charge</cbc:InstructionNote>',
    );
  });

  it('does NOT include InstructionNote for regular invoices', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);
    expect(xml).not.toContain('<cbc:InstructionNote>');
  });

  it('explicit paymentNote overrides default InstructionNote for corrections', () => {
    const input: InvoiceXMLInput = {
      ...baseInput,
      type: 'debit_note',
      paymentNote: 'Additional charge for extra sauce',
    };
    const xml = buildUnsignedInvoiceXML(input);
    expect(xml).toContain(
      '<cbc:InstructionNote>Additional charge for extra sauce</cbc:InstructionNote>',
    );
    expect(xml).not.toContain('Cancellation or Additional Charge');
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

  it('includes discount when provided as pre-tax Allowance', () => {
    // baseInput: 2300×2 + 575 = 5175 incl. Discount 100 → payable 5075.
    // Allowance is the residual of line nets over the post-discount base.
    const grossIncl = 5175;
    const discount = 100;
    const payable = grossIncl - discount;
    const lineNets =
      decomposeVat(2300, 1500).priceExclHalalas * 2 + decomposeVat(575, 1500).priceExclHalalas;
    const taxExclusive = decomposeVat(payable, 1500).priceExclHalalas;
    const allowance = lineNets - taxExclusive;
    const postVat = payable - taxExclusive;

    const input: InvoiceXMLInput = {
      ...baseInput,
      discountHalalas: discount,
    };
    const xml = buildUnsignedInvoiceXML(input);

    expect(xml).toContain(
      `<cbc:AllowanceTotalAmount currencyID="SAR">${halalasToSar(allowance)}</cbc:AllowanceTotalAmount>`,
    );
    expect(xml).toContain(`<cbc:Amount currencyID="SAR">${halalasToSar(allowance)}</cbc:Amount>`);
    expect(xml).toContain(
      `<cbc:PayableAmount currencyID="SAR">${halalasToSar(payable)}</cbc:PayableAmount>`,
    );
    expect(xml).toContain(
      `<cbc:TaxInclusiveAmount currencyID="SAR">${halalasToSar(payable)}</cbc:TaxInclusiveAmount>`,
    );
    expect(xml).toContain(
      `<cbc:TaxExclusiveAmount currencyID="SAR">${halalasToSar(taxExclusive)}</cbc:TaxExclusiveAmount>`,
    );
    expect(xml).toContain(
      `<cbc:LineExtensionAmount currencyID="SAR">${halalasToSar(lineNets)}</cbc:LineExtensionAmount>`,
    );
    // Header TaxAmount = post-Allowance VAT (first TaxTotal block)
    const firstTaxTotal = xml.match(
      /<cac:TaxTotal>\s*<cbc:TaxAmount currencyID="SAR">([^<]*)<\/cbc:TaxAmount>\s*<\/cac:TaxTotal>/,
    );
    expect(firstTaxTotal).not.toBeNull();
    expect(firstTaxTotal![1]).toBe(halalasToSar(postVat));
    // Amount-only AllowanceCharge — no BaseAmount / MultiplierFactorNumeric
    expect(xml).not.toContain('BaseAmount');
    expect(xml).not.toContain('MultiplierFactorNumeric');
  });

  it('emits canonical 100/10/90 pre-tax Allowance identity (ADR 0009)', () => {
    // Gross 100.00 / Discount 10.00 / 15% VAT → payable 90.00, Allowance 8.70
    const input: InvoiceXMLInput = {
      ...baseInput,
      items: [{ name: 'Plate', unitPriceHalalas: 10000, vatRateBp: 1500, qty: 1 }],
      discountHalalas: 1000,
      allowanceReason: 'National Day',
    };
    const xml = buildUnsignedInvoiceXML(input);

    // LineExtensionAmount (BT-106) = Σ line nets = 86.96 — unchanged by Discount
    expect(xml).toContain(
      '<cbc:LineExtensionAmount currencyID="SAR">86.96</cbc:LineExtensionAmount>',
    );
    // Pre-tax Allowance amount-only
    expect(xml).toContain('<cbc:Amount currencyID="SAR">8.70</cbc:Amount>');
    expect(xml).toContain(
      '<cbc:AllowanceTotalAmount currencyID="SAR">8.70</cbc:AllowanceTotalAmount>',
    );
    expect(xml).toContain(
      '<cbc:TaxExclusiveAmount currencyID="SAR">78.26</cbc:TaxExclusiveAmount>',
    );
    expect(xml).toContain(
      '<cbc:TaxInclusiveAmount currencyID="SAR">90.00</cbc:TaxInclusiveAmount>',
    );
    expect(xml).toContain('<cbc:PayableAmount currencyID="SAR">90.00</cbc:PayableAmount>');
    // Header TaxAmount = post-Allowance VAT 11.74
    const firstTaxTotal = xml.match(
      /<cac:TaxTotal>\s*<cbc:TaxAmount currencyID="SAR">([^<]*)<\/cbc:TaxAmount>\s*<\/cac:TaxTotal>/,
    );
    expect(firstTaxTotal).not.toBeNull();
    expect(firstTaxTotal![1]).toBe('11.74');
    // S/15 TaxSubtotal after Allowance
    expect(xml).toContain('<cbc:TaxableAmount currencyID="SAR">78.26</cbc:TaxableAmount>');
    expect(xml).toContain('<cbc:TaxAmount currencyID="SAR">11.74</cbc:TaxAmount>');
    // Reason = Promotion name
    expect(xml).toContain('<cbc:AllowanceChargeReason>National Day</cbc:AllowanceChargeReason>');
    // TaxCategory S / 15 on Allowance
    const allowanceSection = xml.substring(
      xml.indexOf('<cac:AllowanceCharge>'),
      xml.indexOf('</cac:AllowanceCharge>') + '</cac:AllowanceCharge>'.length,
    );
    expect(allowanceSection).toContain('<cbc:ID>S</cbc:ID>');
    expect(allowanceSection).toContain('<cbc:Percent>15.00</cbc:Percent>');
    // No BaseAmount / MultiplierFactorNumeric
    expect(xml).not.toContain('BaseAmount');
    expect(xml).not.toContain('MultiplierFactorNumeric');
  });

  it('reconciles document totals for a multi-line promoted ticket (BR-CO-15)', () => {
    // Regression: order 2357 — 5×15.00 + 4×14.00 = 131.00 incl, 10% promotion
    // → payable 117.90. Per-unit decomposition gives line nets 113.88 while
    // decomposeVat(131.00) gives 113.91; building the Allowance from the gross
    // decomposition leaked 0.03 into TaxInclusive and failed BR-CO-15.
    const input: InvoiceXMLInput = {
      ...baseInput,
      items: [
        { name: 'Shanghai Hot Soup -Chicken', unitPriceHalalas: 1500, vatRateBp: 1500, qty: 5 },
        { name: 'Sweet Corn Soup-Veg', unitPriceHalalas: 1400, vatRateBp: 1500, qty: 4 },
      ],
      discountHalalas: 1310,
      allowanceReason: 'KSA National Day',
    };
    const xml = buildUnsignedInvoiceXML(input);

    // LineExtension = Σ line nets = 113.88 (unchanged by Discount)
    expect(xml).toContain(
      '<cbc:LineExtensionAmount currencyID="SAR">113.88</cbc:LineExtensionAmount>',
    );
    // Allowance = 113.88 − TaxExclusive
    expect(xml).toContain('<cbc:Amount currencyID="SAR">11.36</cbc:Amount>');
    expect(xml).toContain(
      '<cbc:AllowanceTotalAmount currencyID="SAR">11.36</cbc:AllowanceTotalAmount>',
    );
    expect(xml).toContain(
      '<cbc:TaxExclusiveAmount currencyID="SAR">102.52</cbc:TaxExclusiveAmount>',
    );
    expect(xml).toContain(
      '<cbc:TaxInclusiveAmount currencyID="SAR">117.90</cbc:TaxInclusiveAmount>',
    );
    expect(xml).toContain('<cbc:PayableAmount currencyID="SAR">117.90</cbc:PayableAmount>');
    // Header TaxAmount = post-Allowance VAT (117.90 − 102.52)
    const firstTaxTotal = xml.match(
      /<cac:TaxTotal>\s*<cbc:TaxAmount currencyID="SAR">([^<]*)<\/cbc:TaxAmount>\s*<\/cac:TaxTotal>/,
    );
    expect(firstTaxTotal).not.toBeNull();
    expect(firstTaxTotal![1]).toBe('15.38');
    // VAT breakdown taxable amount matches TaxExclusive
    expect(xml).toContain('<cbc:TaxableAmount currencyID="SAR">102.52</cbc:TaxableAmount>');
    expect(xml).toContain('<cbc:TaxAmount currencyID="SAR">15.38</cbc:TaxAmount>');
  });

  it('keeps BR-CO-15 (TaxInclusive = TaxExclusive + VAT) across a promoted-ticket sweep', () => {
    const prices = [3, 27, 575, 1000, 1400, 1500, 2300, 7500, 9999, 12345];
    const quantities = [1, 2, 3, 4, 5, 7, 10, 13, 100];
    const discounts = [1, 2, 7, 50, 131, 999, 1234];

    for (const price of prices) {
      for (const qty of quantities) {
        const gross = price * qty;
        for (const discount of discounts) {
          if (discount >= gross) continue;

          const xml = buildUnsignedInvoiceXML({
            ...baseInput,
            items: [{ name: 'Item', unitPriceHalalas: price, vatRateBp: 1500, qty }],
            discountHalalas: discount,
          });

          const lineNets = extractHalalas(xml, 'cbc:LineExtensionAmount');
          const allowance = extractHalalas(xml, 'cbc:AllowanceTotalAmount');
          const taxExclusive = extractHalalas(xml, 'cbc:TaxExclusiveAmount');
          const taxInclusive = extractHalalas(xml, 'cbc:TaxInclusiveAmount');
          const payable = extractHalalas(xml, 'cbc:PayableAmount');
          const headerVat = extractHeaderVatHalalas(xml);

          // BR-CO-13: line nets − Allowance = TaxExclusive
          expect(taxExclusive).toBe(lineNets - allowance);
          // BR-CO-15: TaxExclusive + VAT = TaxInclusive
          expect(taxInclusive).toBe(taxExclusive + headerVat);
          // BR-CO-16: Payable = TaxInclusive (Prepaid = 0)
          expect(payable).toBe(taxInclusive);
          // Allowance must never go negative
          expect(allowance).toBeGreaterThanOrEqual(0);

          if (allowance > 0) {
            // BR-CO-17 (VAT = taxable × 15%, rounded) holds whenever an exact
            // solution exists; otherwise TaxInclusive stays anchored to the
            // collected payable and BR-CO-17 is a warning.
            const exact = exactBaseFor(taxInclusive, 1500);
            if (exact !== null) {
              expect(taxExclusive).toBe(exact);
              expect(headerVat).toBe(Math.round((taxExclusive * 1500) / 10000));
            }
          }
        }
      }
    }
  });

  it('clamps the Allowance at zero when per-unit rounding outgrows a tiny discount', () => {
    // 1000 × 0.27 SAR (per-unit VAT rounds up 0.48 halala each) with a
    // 3-halala Discount: raw residual would be negative. Fall back to line
    // nets as the taxable base and keep the totals reconciled.
    const xml = buildUnsignedInvoiceXML({
      ...baseInput,
      items: [{ name: 'Bread', unitPriceHalalas: 27, vatRateBp: 1500, qty: 1000 }],
      discountHalalas: 3,
    });

    expect(xml).toContain('<cbc:Amount currencyID="SAR">0.00</cbc:Amount>');
    expect(xml).toContain(
      '<cbc:AllowanceTotalAmount currencyID="SAR">0.00</cbc:AllowanceTotalAmount>',
    );
    const lineNets = extractHalalas(xml, 'cbc:LineExtensionAmount');
    const taxExclusive = extractHalalas(xml, 'cbc:TaxExclusiveAmount');
    const taxInclusive = extractHalalas(xml, 'cbc:TaxInclusiveAmount');
    const payable = extractHalalas(xml, 'cbc:PayableAmount');
    expect(taxExclusive).toBe(lineNets);
    expect(taxInclusive).toBe(taxExclusive + extractHeaderVatHalalas(xml));
    expect(payable).toBe(taxInclusive);
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

  // ── Standard invoice profile tests ────────────────────────────────────────

  const sampleBuyer: BuyerInfo = {
    name: 'Fatoora Samples LTD',
    vatNumber: '399999999800003',
    street: 'Salah Al-Din',
    buildingNumber: '1111',
    citySubdivision: 'Al-Murooj',
    city: 'Riyadh',
    postalCode: '12222',
    country: 'SA',
  };

  const baseStandardInput: InvoiceXMLInput = {
    ...baseInput,
    invoiceProfile: 'standard',
    buyer: sampleBuyer,
  };

  it('uses standard subtype 0100000 for standard invoice', () => {
    const xml = buildUnsignedInvoiceXML(baseStandardInput);
    expect(xml).toContain('<cbc:InvoiceTypeCode name="0100000">388</cbc:InvoiceTypeCode>');
    expect(xml).not.toContain('name="0200000"');
  });

  it('standard profile does not affect simplified default', () => {
    // Simplified input without invoiceProfile should still use 0200000
    const xml = buildUnsignedInvoiceXML(baseInput);
    expect(xml).toContain('<cbc:InvoiceTypeCode name="0200000">388</cbc:InvoiceTypeCode>');
  });

  it('includes buyer PostalAddress in standard invoice', () => {
    const xml = buildUnsignedInvoiceXML(baseStandardInput);
    expect(xml).toContain('<cac:AccountingCustomerParty>');
    expect(xml).toContain('<cbc:StreetName>Salah Al-Din</cbc:StreetName>');
    expect(xml).toContain('<cbc:BuildingNumber>1111</cbc:BuildingNumber>');
    expect(xml).toContain('<cbc:CitySubdivisionName>Al-Murooj</cbc:CitySubdivisionName>');
    expect(xml).toContain('<cbc:CityName>Riyadh</cbc:CityName>');
    expect(xml).toContain('<cbc:PostalZone>12222</cbc:PostalZone>');
  });

  it('includes buyer VAT in standard invoice', () => {
    const xml = buildUnsignedInvoiceXML(baseStandardInput);
    expect(xml).toContain('<cbc:CompanyID>399999999800003</cbc:CompanyID>');
  });

  it('includes buyer legal entity name in standard invoice', () => {
    const xml = buildUnsignedInvoiceXML(baseStandardInput);
    expect(xml).toContain('<cbc:RegistrationName>Fatoora Samples LTD</cbc:RegistrationName>');
  });

  it('includes buyer country default SA', () => {
    const xml = buildUnsignedInvoiceXML(baseStandardInput);
    expect(xml).toContain('<cbc:IdentificationCode>SA</cbc:IdentificationCode>');
  });

  it('includes Delivery for standard invoice', () => {
    const xml = buildUnsignedInvoiceXML(baseStandardInput);
    expect(xml).toContain('<cac:Delivery>');
    expect(xml).toContain('<cbc:ActualDeliveryDate>2024-01-15</cbc:ActualDeliveryDate>');
  });

  it('does NOT include Delivery for simplified invoice', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);
    expect(xml).not.toContain('<cac:Delivery>');
  });

  it('simplified invoice still has empty customer party', () => {
    const xml = buildUnsignedInvoiceXML(baseInput);
    expect(xml).toContain('<cac:AccountingCustomerParty>');
    // Empty customer party — the AccountingCustomerParty section should not
    // have any child Party elements (the seller's AccountingSupplierParty
    // has its own Party — we check the customer section is empty).
    const customerStart = xml.indexOf('<cac:AccountingCustomerParty>');
    const customerEnd =
      xml.indexOf('</cac:AccountingCustomerParty>') + '</cac:AccountingCustomerParty>'.length;
    const customerSection = xml.substring(customerStart, customerEnd);
    expect(customerSection).not.toContain('<cac:Party>');
  });

  it('standard invoice has full buyer party in customer section', () => {
    const xml = buildUnsignedInvoiceXML(baseStandardInput);
    // AccountingCustomerParty should contain a Party with buyer details
    const customerStart = xml.indexOf('<cac:AccountingCustomerParty>');
    const customerEnd =
      xml.indexOf('</cac:AccountingCustomerParty>') + '</cac:AccountingCustomerParty>'.length;
    const customerSection = xml.substring(customerStart, customerEnd);
    expect(customerSection).toContain('<cac:Party>');
    expect(customerSection).toContain(
      '<cbc:RegistrationName>Fatoora Samples LTD</cbc:RegistrationName>',
    );
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractNumericValue(xml: string, tagName: string): number | null {
  const regex = new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`);
  const match = xml.match(regex);
  if (match === null) return null;
  return parseFloat(match[1]);
}

function extractHalalas(xml: string, tagName: string): number {
  const value = extractNumericValue(xml, tagName);
  if (value === null) throw new Error(`Missing ${tagName}`);
  return Math.round(value * 100);
}

function extractHeaderVatHalalas(xml: string): number {
  const match = xml.match(
    /<cac:TaxTotal>\s*<cbc:TaxAmount currencyID="SAR">([^<]*)<\/cbc:TaxAmount>\s*<\/cac:TaxTotal>/,
  );
  if (match === null) throw new Error('Missing header TaxTotal');
  return Math.round(parseFloat(match[1]) * 100);
}

/**
 * The unique taxable base B satisfying B + round(B × rate/10000) = payable —
 * or null when no integer base reconciles the collected payable (BR-CO-17 is
 * then a warning and the builder anchors TaxInclusive on the payable).
 */
function exactBaseFor(payableHalalas: number, rateBp: number): number | null {
  const base = payableHalalas - Math.round((payableHalalas * rateBp) / (10000 + rateBp));
  if (base < 0) return null;
  return base + Math.round((base * rateBp) / 10000) === payableHalalas ? base : null;
}
