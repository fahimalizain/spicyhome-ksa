import { describe, it, expect } from 'vitest';
import { formatOrderTypeLabel } from './order-type-label';

describe('formatOrderTypeLabel', () => {
  it('dine_in without partner shows "Dine-in"', () => {
    expect(
      formatOrderTypeLabel({
        type: 'dine_in',
        deliveryPartnerTitle: null,
        deliveryExternalRef: null,
      }),
    ).toBe('Dine-in');
  });

  it('dine_in ignores partner fields', () => {
    expect(
      formatOrderTypeLabel({
        type: 'dine_in',
        deliveryPartnerTitle: 'HungerStation',
        deliveryExternalRef: 'HS-1',
      }),
    ).toBe('Dine-in');
  });

  it('takeaway without partner shows "Takeaway"', () => {
    expect(
      formatOrderTypeLabel({
        type: 'takeaway',
        deliveryPartnerTitle: null,
        deliveryExternalRef: null,
      }),
    ).toBe('Takeaway');
  });

  it('takeaway with empty title shows "Takeaway"', () => {
    expect(
      formatOrderTypeLabel({
        type: 'takeaway',
        deliveryPartnerTitle: '',
        deliveryExternalRef: null,
      }),
    ).toBe('Takeaway');
  });

  it('takeaway with partner and no ref shows the title', () => {
    expect(
      formatOrderTypeLabel({
        type: 'takeaway',
        deliveryPartnerTitle: 'HungerStation',
        deliveryExternalRef: null,
      }),
    ).toBe('HungerStation');
  });

  it('takeaway with partner and empty ref shows the title only', () => {
    expect(
      formatOrderTypeLabel({
        type: 'takeaway',
        deliveryPartnerTitle: 'HungerStation',
        deliveryExternalRef: '',
      }),
    ).toBe('HungerStation');
  });

  it('takeaway with partner and ref shows "title / ref"', () => {
    expect(
      formatOrderTypeLabel({
        type: 'takeaway',
        deliveryPartnerTitle: 'HungerStation',
        deliveryExternalRef: 'HS-883129',
      }),
    ).toBe('HungerStation / HS-883129');
  });

  it('trims whitespace around the external ref', () => {
    expect(
      formatOrderTypeLabel({
        type: 'takeaway',
        deliveryPartnerTitle: 'HungerStation',
        deliveryExternalRef: '  HS-1  ',
      }),
    ).toBe('HungerStation / HS-1');
  });

  it('missing partner fields are treated as no partner', () => {
    expect(formatOrderTypeLabel({ type: 'takeaway' })).toBe('Takeaway');
  });

  it('whitespace-only title is treated as no partner', () => {
    expect(
      formatOrderTypeLabel({
        type: 'takeaway',
        deliveryPartnerTitle: '   ',
        deliveryExternalRef: 'HS-1',
      }),
    ).toBe('Takeaway');
  });
});
