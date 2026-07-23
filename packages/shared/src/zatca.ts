export const ZATCA_INVOICE_TYPE_CODES = {
  invoice: 388,
  credit_note: 381,
  debit_note: 383,
} as const;

export type ZATCAInvoiceDocumentType = 'invoice' | 'credit_note' | 'debit_note';

export const ZATCA_SIMPLIFIED_SUBTYPES: Record<ZATCAInvoiceDocumentType, string> = {
  invoice: '0200000',
  credit_note: '0200000',
  debit_note: '0211000',
};

export const ZATCA_INITIAL_PIH =
  'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjYzQ0OTg1YTJlN2I3MjZiZTk3Mjg3YjUyZjFhM2E0M2Q1YjViMTI5Zg==';
