/**
 * ZATCA Payment Means type code — UBL `cac:PaymentMeans/cbc:PaymentMeansCode`
 * (EN 16931 business term **BT-81**, "Payment means type code").
 *
 * Sources (all checked into the repo):
 * - Data dictionary (`docs/zatca/20230519_EInvoice_Data_Dictionary vF.xlsx`,
 *   BT-81): optional on all invoice profiles; resolution field **9.1** maps
 *   "cash, credit/debit cards, bank transfer, credit, and/or others"; code
 *   list is a "subset of UNTDID 4461". UBL/EN 16931 cardinality is `1..n`,
 *   so one `cac:PaymentMeans` block per payment line is emitted (see
 *   `buildInvoicePaymentMeans` / `buildCreditNotePaymentMeans` below).
 * - XML Implementation Standard
 *   (`docs/zatca/20230519_ZATCA_Electronic_Invoice_XML_Implementation_Standard_ vF.pdf`,
 *   §11.2.5): payment means type code from a subset of UN/CEFACT 4461 D.16B.
 *   **BR-KSA-16**: if BT-81 is present it must be one of the subset values.
 * - Schematron (runtime enforcement):
 *   `tools/zatca-sdk/Data/Rules/schematrons/20210819_ZATCA_E-invoice_Validation_Rules.xsl`
 *   accepts codes `10`, `30`, `42`, `48`, `1` only, and requires every
 *   `cac:PaymentMeans` block on credit/debit notes (381/383) to carry an
 *   `cbc:InstructionNote` (**BR-KSA-17**, KSA-10 reason, 1–1000 chars per
 *   BR-KSA-F-06-C13).
 *
 * Codes `54` (Credit card) and `55` (Debit card) exist in the full UN/ECE 4461
 * registry but are **excluded** from ZATCA's subset — card payments must use
 * `48` (Bank card), which is how the seeded `card`/`mada` methods are mapped.
 */
import { halalasToSar } from './money';
export const ZATCA_PAYMENT_MEANS_CODES = ['10', '30', '42', '48', '1'] as const;

export type ZatcaPaymentMeansCode = (typeof ZATCA_PAYMENT_MEANS_CODES)[number];

/** Fallback code used when no payment lines exist or a snapshot is invalid. */
export const DEFAULT_ZATCA_PAYMENT_MEANS_CODE: ZatcaPaymentMeansCode = '10';

/**
 * Short admin-UI labels, tracking the resolution field 9.1 categories
 * (cash / credit & debit cards / bank transfer / other).
 */
export const ZATCA_PAYMENT_MEANS_CODE_LABELS: Record<ZatcaPaymentMeansCode, string> = {
  '10': 'Cash',
  '30': 'Credit transfer (bank transfer)',
  '42': 'Payment to bank account',
  '48': 'Bank card (credit/debit)',
  '1': 'Instrument not defined (other)',
};

export function isZatcaPaymentMeansCode(value: string): value is ZatcaPaymentMeansCode {
  return (ZATCA_PAYMENT_MEANS_CODES as readonly string[]).includes(value);
}

/** BR-KSA-F-06-C13: KSA-10 reason (InstructionNote) max length. */
export const MAX_INSTRUCTION_NOTE_LENGTH = 1000;

/**
 * Clamp an InstructionNote body to the schematron limit (BR-KSA-F-06-C13).
 * Truncates from the end, keeping any leading reason prefix intact.
 */
export function clampInstructionNote(note: string): string {
  if (note.length <= MAX_INSTRUCTION_NOTE_LENGTH) return note;
  return `${note.slice(0, MAX_INSTRUCTION_NOTE_LENGTH - 3)}...`;
}

/** One order_payments row as consumed by `buildInvoicePaymentMeans`. */
export interface PaymentMeansLineInput {
  methodId: string;
  /** Snapshot of the method title at pay time (may be empty). */
  methodTitle: string;
  amountHalalas: number;
  /** Snapshot of the method's ZATCA code at pay time. */
  zatcaPaymentMeansCode: string;
}

/** One `cac:PaymentMeans` block ready for the XML builder. */
export interface BuiltPaymentMeans {
  /** UN/ECE 4461 code; invalid input is coerced to `10`. */
  code: ZatcaPaymentMeansCode;
  /** InstructionNote body (plain text — the builder escapes/clamps it). */
  instructionNote: string;
}

function methodDisplayName(methodId: string, methodTitle: string): string {
  return methodTitle.trim() || methodId;
}

/**
 * Net payment lines by `methodId` (ADR 0006): sums `amountHalalas` per
 * method, keeps the `methodTitle` / `zatcaPaymentMeansCode` snapshot of the
 * **latest** line for that method (original input order), and drops nets
 * `<= 0` — zero nets are redundant and negative nets must never reach an
 * invoice (Submit rejects them; the overall sum equals the order total, so a
 * fully-paid order always has at least one positive net).
 *
 * Output is sorted by `methodId` ASC for deterministic (C14N-stable) XML.
 */
export function netPaymentMeansLines(
  lines: ReadonlyArray<PaymentMeansLineInput>,
): PaymentMeansLineInput[] {
  const nets = new Map<string, PaymentMeansLineInput>();
  for (const line of lines) {
    const prev = nets.get(line.methodId);
    nets.set(line.methodId, {
      methodId: line.methodId,
      // Latest line wins for the snapshot fields (append order = oldest first)
      methodTitle: line.methodTitle,
      zatcaPaymentMeansCode: line.zatcaPaymentMeansCode,
      amountHalalas: (prev?.amountHalalas ?? 0) + line.amountHalalas,
    });
  }

  return [...nets.values()]
    .filter((line) => line.amountHalalas > 0)
    .sort((a, b) => {
      if (a.methodId < b.methodId) return -1;
      if (a.methodId > b.methodId) return 1;
      return 0;
    });
}

/**
 * Build one `cac:PaymentMeans` per **netted** payment method (BT-81
 * cardinality `1..n`), sorted by `methodId` ASC for deterministic
 * (C14N-stable) output.
 *
 * Multi-line / correction payments are netted per `methodId` first (see
 * `netPaymentMeansLines`): a method paid in two lines (+100 / −20) emits a
 * single block for the net (80). Zero or negative nets are dropped.
 *
 * InstructionNote format (tax invoices): `{methodTitle} | {amount} SAR`.
 * Invalid codes are coerced per line to `10` but the line is still emitted
 * with its method/amount info.
 *
 * Empty input → `[]` (the XML builder falls back to a single `10` block).
 */
export function buildInvoicePaymentMeans(
  lines: ReadonlyArray<PaymentMeansLineInput>,
): BuiltPaymentMeans[] {
  return netPaymentMeansLines(lines).map((line) => ({
    code: isZatcaPaymentMeansCode(line.zatcaPaymentMeansCode)
      ? line.zatcaPaymentMeansCode
      : DEFAULT_ZATCA_PAYMENT_MEANS_CODE,
    instructionNote: clampInstructionNote(
      `${methodDisplayName(line.methodId, line.methodTitle)} | ${halalasToSar(line.amountHalalas)} SAR`,
    ),
  }));
}

/** One refund tender as consumed by `buildCreditNotePaymentMeans`. */
export interface CreditNotePaymentMeansInput {
  methodId: string;
  /** Snapshot of the refund method title (may be empty). */
  methodTitle: string;
  /** Snapshot of the refund method's ZATCA code. */
  zatcaPaymentMeansCode: string;
  /** KSA-10 reason — callers default to 'Refund' when the refund has none. */
  reason: string;
  /** Refund total in halalas when available (appended to the note). */
  amountHalalas?: number;
}

/**
 * Build the single `cac:PaymentMeans` for a credit/debit note from the refund
 * tender. BR-KSA-17 requires the note on every block, so the KSA-10 reason is
 * always part of the InstructionNote (BR-KSA-F-06-C13 clamped):
 * `{reason} | {methodTitle}` plus ` | {amount} SAR` when the amount is known.
 */
export function buildCreditNotePaymentMeans(
  input: CreditNotePaymentMeansInput,
): BuiltPaymentMeans[] {
  const reason = input.reason.trim() || 'Refund';
  let note = `${reason} | ${methodDisplayName(input.methodId, input.methodTitle)}`;
  if (input.amountHalalas !== undefined) {
    note += ` | ${halalasToSar(input.amountHalalas)} SAR`;
  }

  return [
    {
      code: isZatcaPaymentMeansCode(input.zatcaPaymentMeansCode)
        ? input.zatcaPaymentMeansCode
        : DEFAULT_ZATCA_PAYMENT_MEANS_CODE,
      instructionNote: clampInstructionNote(note),
    },
  ];
}
