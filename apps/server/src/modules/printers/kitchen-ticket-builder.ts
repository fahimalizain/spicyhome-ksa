import { EscPosBuilder, Align, CutType } from './esc-pos-builder';

/** Blank lines between the leading dashed markers before KOT content. */
const LEADING_SPACER_LINES = 5;

export interface KitchenTicketOptions {
  /**
   * Human-facing order identifier (e.g. "INV26-0042") — printed big in the
   * header. The caller resolves the ZATCA document id with a fallback to the
   * internal reference (`Order-<orderNo>`) before calling build().
   */
  documentId: string;
  /**
   * Printer name — printed in the header so kitchen staff can identify the
   * station when tickets from several printers pile up.
   */
  printerName?: string;
  /** Unix epoch seconds */
  createdAt: number;
  orderType: 'dine_in' | 'takeaway';
  tableName?: string;
  /** Delivery partner title (e.g. "HungerStation") — printed prominently when the order is linked to a delivery partner (ADR 0007). */
  deliveryPartnerTitle?: string;
  /** Delivery app's order number for reconciliation (e.g. "HS-883129") — printed when set (useful for packing). */
  deliveryExternalRef?: string;
  /** Order-level notes ("Order notes") — printed prominently when set (bold, before the items). */
  orderNotes?: string | null;
  /** Display name of the user who created the order (users.name). Omitted when unknown. */
  createdByName?: string | null;
  items: KitchenTicketItem[];
}

export interface KitchenTicketItem {
  qty: number;
  name: string;
  notes?: string | null;
}

export class KitchenTicketBuilder {
  private readonly width: number;

  constructor(width = 42) {
    this.width = width;
  }

  build(opts: KitchenTicketOptions): Buffer {
    const eb = new EscPosBuilder(this.width);

    eb.init();

    // Leading tear-off / grab space so kitchen content starts well below the
    // cutter. Two dashed markers frame the blank region for easy tearing.
    eb.separator('-');
    for (let i = 0; i < LEADING_SPACER_LINES; i++) {
      eb.blankLine();
    }
    eb.separator('-');

    // Big document id — double-size bold, centered, so the kitchen can match
    // the ticket to the order at a glance (e.g. "INV26-0042").
    eb.align(Align.Center);
    eb.doubleSize(true);
    eb.bold(true);
    eb.text(this.truncateDouble(opts.documentId));
    eb.bold(false);
    eb.doubleSize(false);

    // Printer name — normal size under the document id so kitchen staff can
    // tell which station this ticket belongs to.
    if (opts.printerName) {
      eb.text(`Printer: ${opts.printerName}`.slice(0, this.width));
    }

    eb.separator('=');

    // Delivery partner (ADR 0007): bold title for kitchen hand-off + app
    // order ref for packing, only when set.
    if (opts.deliveryPartnerTitle) {
      eb.align(Align.Left);
      eb.bold(true);
      eb.text(`Delivery: ${opts.deliveryPartnerTitle}`);
      eb.bold(false);
    }
    if (opts.deliveryExternalRef) {
      eb.align(Align.Left);
      eb.text(`App order #: ${opts.deliveryExternalRef}`);
    }

    // Order info
    eb.align(Align.Left);
    const typeLabel = opts.orderType === 'dine_in' ? 'Dine-in' : 'Takeaway';
    eb.text(`Type: ${typeLabel}`);

    // Table — its own line at double size + bold (far more visible than the
    // old inline "Table: T4" on the type line). Omitted for takeaway.
    if (opts.tableName) {
      eb.align(Align.Center);
      eb.bold(true);
      eb.doubleSize(true);
      eb.text(this.truncateDouble(`TABLE ${opts.tableName}`));
      eb.doubleSize(false);
      eb.bold(false);
      eb.align(Align.Left);
    }

    eb.text(`Time: ${this.formatTime(opts.createdAt)}`);

    // Who took the order — display name only (users.name), normal size like
    // the Type/Time lines. Omitted when unknown.
    if (opts.createdByName?.trim()) {
      eb.text(`Created By: ${opts.createdByName}`.slice(0, this.width));
    }

    // Order-level notes — prominent (bold), truncated to paper width, right
    // after type/time so the kitchen sees them before the items.
    if (opts.orderNotes) {
      eb.bold(true);
      const notesText = `NOTES: ${opts.orderNotes}`;
      eb.text(notesText.slice(0, this.width));
      eb.bold(false);
    }

    eb.separator();

    // Items — name (bold), Qty line, optional Notes.
    // Each item is its own block, separated by a blank line for readability.
    eb.align(Align.Left);
    for (const item of opts.items) {
      // Name — bold only (normal size), truncated to paper width.
      eb.bold(true);
      const nameLine = `- ${item.name}`;
      eb.text(nameLine.slice(0, this.width));
      eb.bold(false);

      // Qty — always printed, normal weight, indented under the name.
      eb.text(`    Qty: ${item.qty}x`);

      // Notes — only when set, underlined (kept prominent for the kitchen),
      // indented to align with the Qty line.
      if (item.notes) {
        eb.underline(true);
        const notesLine = `    Notes: ${item.notes}`;
        eb.text(notesLine.slice(0, this.width));
        eb.underline(false);
      }

      // Blank line after each item block so kitchen staff can read items
      // more easily (gap is between item blocks, not between name and notes).
      eb.blankLine();
    }

    eb.separator('=');
    eb.feed(2);
    eb.cut(CutType.Partial);

    return eb.getBuffer();
  }

  private formatTime(unixSec: number): string {
    const d = new Date(unixSec * 1000);
    try {
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Riyadh',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
      // Some Node/ICU builds insert NNBSP (U+202F) before AM/PM; EscPosBuilder
      // strips non-ASCII, which would glue "01:13AM". Normalize to plain space.
      return fmt.format(d).replace(/\u202f|\u00a0/g, ' ');
    } catch {
      // Manual 12h fallback (local machine TZ — last resort only)
      const h24 = d.getHours();
      const m = d.getMinutes();
      const ampm = h24 >= 12 ? 'PM' : 'AM';
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${pad(h12)}:${pad(m)} ${ampm}`;
    }
  }

  /** Double-size characters occupy two columns each — keep to half the paper width. */
  private truncateDouble(text: string): string {
    return text.slice(0, Math.floor(this.width / 2));
  }
}
