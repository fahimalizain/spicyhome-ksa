import { describe, it, expect } from 'vitest';
import {
  validateStandardBuyer,
  emptyStandardInvoiceBuyer,
  type ZatcaBuyerDetails,
} from '../components/orders/StandardInvoiceBuyerForm';

function makeBuyer(overrides: Partial<ZatcaBuyerDetails> = {}): ZatcaBuyerDetails {
  return {
    ...emptyStandardInvoiceBuyer(),
    ...overrides,
  };
}

describe('validateStandardBuyer', () => {
  it('returns no errors for a fully valid buyer', () => {
    const buyer = makeBuyer({
      name: 'Abdullah Al-Otaibi Est.',
      vatNumber: '300123456789012',
      street: 'King Fahd Road',
      buildingNumber: '7845',
      citySubdivision: 'Al-Olaya',
      city: 'Riyadh',
      postalCode: '12271',
      country: 'SA',
    });
    expect(validateStandardBuyer(buyer)).toEqual({});
  });

  it('returns error when name is empty', () => {
    const buyer = makeBuyer({
      name: '',
      vatNumber: '300123456789012',
      street: 'King Fahd Road',
      buildingNumber: '7845',
      citySubdivision: 'Al-Olaya',
      city: 'Riyadh',
      postalCode: '12271',
    });
    const errors = validateStandardBuyer(buyer);
    expect(errors.name).toBeDefined();
    expect(errors.name).toContain('required');
  });

  it('returns error when name is whitespace only', () => {
    const buyer = makeBuyer({
      name: '   ',
      vatNumber: '300123456789012',
      street: 'King Fahd Road',
      buildingNumber: '7845',
      citySubdivision: 'Al-Olaya',
      city: 'Riyadh',
      postalCode: '12271',
    });
    const errors = validateStandardBuyer(buyer);
    expect(errors.name).toBeDefined();
  });

  it('returns error when vatNumber is empty', () => {
    const buyer = makeBuyer({
      name: 'Test Co.',
      vatNumber: '',
      street: 'King Fahd Road',
      buildingNumber: '7845',
      citySubdivision: 'Al-Olaya',
      city: 'Riyadh',
      postalCode: '12271',
    });
    const errors = validateStandardBuyer(buyer);
    expect(errors.vatNumber).toBeDefined();
  });

  it('returns error when vatNumber is not 15 digits', () => {
    const buyer = makeBuyer({
      name: 'Test Co.',
      vatNumber: '123',
      street: 'King Fahd Road',
      buildingNumber: '7845',
      citySubdivision: 'Al-Olaya',
      city: 'Riyadh',
      postalCode: '12271',
    });
    const errors = validateStandardBuyer(buyer);
    expect(errors.vatNumber).toBeDefined();
  });

  it('returns error when vatNumber has non-digit characters', () => {
    const buyer = makeBuyer({
      name: 'Test Co.',
      vatNumber: '30012345678901A',
      street: 'King Fahd Road',
      buildingNumber: '7845',
      citySubdivision: 'Al-Olaya',
      city: 'Riyadh',
      postalCode: '12271',
    });
    const errors = validateStandardBuyer(buyer);
    expect(errors.vatNumber).toBeDefined();
  });

  it('returns error when vatNumber is 16 digits', () => {
    const buyer = makeBuyer({
      name: 'Test Co.',
      vatNumber: '3001234567890123',
      street: 'King Fahd Road',
      buildingNumber: '7845',
      citySubdivision: 'Al-Olaya',
      city: 'Riyadh',
      postalCode: '12271',
    });
    const errors = validateStandardBuyer(buyer);
    expect(errors.vatNumber).toBeDefined();
  });

  it('returns error when street is empty', () => {
    const buyer = makeBuyer({
      name: 'Test Co.',
      vatNumber: '300123456789012',
      street: '',
      buildingNumber: '7845',
      citySubdivision: 'Al-Olaya',
      city: 'Riyadh',
      postalCode: '12271',
    });
    const errors = validateStandardBuyer(buyer);
    expect(errors.street).toBeDefined();
  });

  it('returns error when buildingNumber is empty', () => {
    const buyer = makeBuyer({
      name: 'Test Co.',
      vatNumber: '300123456789012',
      street: 'King Fahd Road',
      buildingNumber: '',
      citySubdivision: 'Al-Olaya',
      city: 'Riyadh',
      postalCode: '12271',
    });
    const errors = validateStandardBuyer(buyer);
    expect(errors.buildingNumber).toBeDefined();
  });

  it('returns error when citySubdivision is empty', () => {
    const buyer = makeBuyer({
      name: 'Test Co.',
      vatNumber: '300123456789012',
      street: 'King Fahd Road',
      buildingNumber: '7845',
      citySubdivision: '',
      city: 'Riyadh',
      postalCode: '12271',
    });
    const errors = validateStandardBuyer(buyer);
    expect(errors.citySubdivision).toBeDefined();
  });

  it('returns error when city is empty', () => {
    const buyer = makeBuyer({
      name: 'Test Co.',
      vatNumber: '300123456789012',
      street: 'King Fahd Road',
      buildingNumber: '7845',
      citySubdivision: 'Al-Olaya',
      city: '',
      postalCode: '12271',
    });
    const errors = validateStandardBuyer(buyer);
    expect(errors.city).toBeDefined();
  });

  it('returns error when postalCode is empty', () => {
    const buyer = makeBuyer({
      name: 'Test Co.',
      vatNumber: '300123456789012',
      street: 'King Fahd Road',
      buildingNumber: '7845',
      citySubdivision: 'Al-Olaya',
      city: 'Riyadh',
      postalCode: '',
    });
    const errors = validateStandardBuyer(buyer);
    expect(errors.postalCode).toBeDefined();
  });

  it('returns error when country is empty', () => {
    const buyer = makeBuyer({
      name: 'Test Co.',
      vatNumber: '300123456789012',
      street: 'King Fahd Road',
      buildingNumber: '7845',
      citySubdivision: 'Al-Olaya',
      city: 'Riyadh',
      postalCode: '12271',
      country: '',
    });
    const errors = validateStandardBuyer(buyer);
    expect(errors.country).toBeDefined();
  });

  it('returns multiple errors when multiple fields are invalid', () => {
    const buyer = makeBuyer({
      name: '',
      vatNumber: '',
      street: '',
      buildingNumber: '',
      citySubdivision: '',
      city: '',
      postalCode: '',
      country: '',
    });
    const errors = validateStandardBuyer(buyer);
    expect(Object.keys(errors).length).toBeGreaterThanOrEqual(8);
  });

  it('accepts valid 15-digit VAT number with leading zeros', () => {
    const buyer = makeBuyer({
      name: 'Test Co.',
      vatNumber: '000123456789012',
      street: 'King Fahd Road',
      buildingNumber: '7845',
      citySubdivision: 'Al-Olaya',
      city: 'Riyadh',
      postalCode: '12271',
    });
    expect(validateStandardBuyer(buyer)).toEqual({});
  });
});

describe('emptyStandardInvoiceBuyer', () => {
  it('returns buyer with all fields empty except country defaulted to SA', () => {
    const buyer = emptyStandardInvoiceBuyer();
    expect(buyer.name).toBe('');
    expect(buyer.vatNumber).toBe('');
    expect(buyer.street).toBe('');
    expect(buyer.buildingNumber).toBe('');
    expect(buyer.citySubdivision).toBe('');
    expect(buyer.city).toBe('');
    expect(buyer.postalCode).toBe('');
    expect(buyer.country).toBe('SA');
  });
});
