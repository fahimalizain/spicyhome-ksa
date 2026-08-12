/**
 * bake/types.ts — shared types for the generic bake-print-probe.
 *
 * The bake-print-probe reads the local SQLite DB **read-only**, builds one
 * ESC/POS buffer per (source x target printer) using the real print-documents
 * helpers (the same builders the production print paths use), and emits a
 * single self-contained Node 18 script that prints every baked buffer
 * immediately when run on the live Win7 POS machine.
 *
 * Zero writes: no order_events, no order/printer mutations, no ledger state.
 * This is a probe — not a real send-to-printer.
 */

/** Every format the probe knows about. Collectors are added per slice. */
export type ProbeFormat = 'kitchen' | 'receipt' | 'open_order' | 'credit_note' | 'test';

/** Valid `--format` values, in the order they should be listed in errors. */
export const PROBE_FORMATS: readonly ProbeFormat[] = [
  'kitchen',
  'receipt',
  'open_order',
  'credit_note',
  'test',
];

/** Connection target baked into the emit script, straight from the printers row. */
export interface BakedPrinterTarget {
  printerId: number;
  printerName: string; // printers.name — also printed in the ticket header
  connectionType: 'tcp' | 'windows';
  ip: string;
  port: number;
  windowsPrinterName: string | null;
}

/** One baked print job: a single buffer for a single target printer. */
export interface BakedPrintJob {
  format: ProbeFormat;
  /** Log label: documentId / refund IRN / "test" */
  label: string;
  /** orderId or refundId; null for test */
  sourceId: number | null;
  printer: BakedPrinterTarget;
  /** ESC/POS bytes from the print-documents builder */
  buffer: Buffer;
}

/** Filter options accepted by the CLI, passed through to the collector. */
export interface BakeFilters {
  /** orders.id — repeatable */
  orderIds?: number[];
  /** order_refunds.id — repeatable */
  refundIds?: number[];
  /** printers.id — repeatable */
  printerIds?: number[];
  limit?: number;
  /** Widen receipt/credit_note defaults (ignored for kitchen this slice) */
  all?: boolean;
  kickDrawer?: boolean;
}

/** Result of a collect run: jobs + human-readable skip/info lines for CLI logging. */
export interface BakeCollectResult {
  jobs: BakedPrintJob[];
  /** Human-readable skip/info lines for CLI logging */
  notes: string[];
}
