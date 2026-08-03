import { halalasToSar } from '@spicyhome/shared';
import { EscPosBuilder, Align, CutType } from './esc-pos-builder';
import { renderArabicLineToMonoBitmap } from './arabic-raster';
import type { MonoBitmap } from './mono-png';

/** Blank lines between the leading dashed markers before KOT content. */
const LEADING_SPACER_LINES = 5;

/**
 * Scale for item name raster lines. Atlas cell is 32 dots (~between native
 * Font A ~24 and double-height ~48). Tweak this to fine-tune kitchen size
 * without being stuck on ESC/POS integer multipliers.
 */
const ITEM_LINE_SCALE = 1.5;

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
  /** Order total in integer halalas (VAT-inclusive). Printed above order notes when set. */
  totalHalalas?: number | null;
  items: KitchenTicketItem[];
}

export interface KitchenTicketItem {
  qty: number;
  name: string;
  notes?: string | null;
  /** Unit price in integer halalas (VAT-inclusive). Printed under the name when set. */
  unitPriceHalalas?: number | null;
  /** Line total in integer halalas (VAT-inclusive). Right-aligned with unit price when set. */
  totalHalalas?: number | null;
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
    // eb.separator('-');
    for (let i = 0; i < LEADING_SPACER_LINES; i++) {
      eb.blankLine();
    }

    // Big document id — double-size bold, centered, so the kitchen can match
    // the ticket to the order at a glance (e.g. "INV26-0042").
    eb.align(Align.Center);
    eb.doubleSize(true);
    eb.bold(true);
    eb.text(this.truncateDouble(opts.documentId));
    eb.bold(false);
    eb.doubleSize(false);

    eb.separator('-');
    this.writeOrderType(eb, opts);
    eb.separator('-');
    eb.blankLine();

    eb.text(`Date: ${this.formatDate(opts.createdAt)}`);
    eb.text(`Time: ${this.formatTime(opts.createdAt)}`);

    // Printer name — under date/time so kitchen staff can tell which station
    // this ticket belongs to when tickets from several printers pile up.
    if (opts.printerName) {
      eb.text(`Printer: ${opts.printerName}`.slice(0, this.width));
    }

    // Who took the order — display name only (users.name), normal size like
    // the Type/Time lines. Omitted when unknown.
    if (opts.createdByName?.trim()) {
      eb.text(`Created By: ${opts.createdByName}`.slice(0, this.width));
    }

    eb.separator();

    // Items — "{qty}x {name}" as raster (flexible size via glyph atlas),
    // optional unit/line price + Notes as normal text. Each item block ends
    // with a blank line. KOT item names are English/digits only.
    eb.align(Align.Left);
    for (const item of opts.items) {
      const nameLine = `${item.qty}.  ${item.name}`;
      this.writeItemNameLine(eb, nameLine);

      // Unit price (left, Notes indent) + line total (right-aligned).
      const hasUnit = item.unitPriceHalalas != null && Number.isFinite(item.unitPriceHalalas);
      const hasLineTotal = item.totalHalalas != null && Number.isFinite(item.totalHalalas);
      if (hasUnit || hasLineTotal) {
        const left = hasUnit
          ? `    ${halalasToSar(Math.round(item.unitPriceHalalas as number))}`
          : '    ';
        const right = hasLineTotal ? halalasToSar(Math.round(item.totalHalalas as number)) : '';
        eb.columns(left, right);
      }

      // Notes — only when set, bold, indented under the item line.
      if (item.notes) {
        eb.bold(true);
        const notesLine = `    ${item.notes}`;
        eb.text(notesLine.slice(0, this.width));
        eb.bold(false);
      }

      // Blank line after each item block so kitchen staff can read items
      // more easily (gap is between item blocks, not between name and notes).
      eb.blankLine();
    }
    eb.separator('-');

    // Order total (VAT-inclusive) — right-aligned, just above order notes.
    if (opts.totalHalalas != null && Number.isFinite(opts.totalHalalas)) {
      eb.bold(true);
      eb.align(Align.Right);
      eb.text(`Total: ${halalasToSar(Math.round(opts.totalHalalas))} SAR`.slice(0, this.width));
      eb.align(Align.Left);
      eb.bold(false);
    }

    // Order-level notes — after items (and total), framed by dashed separators
    // so kitchen staff still can't miss them. Bold, truncated to paper width.
    if (opts.orderNotes) {
      eb.separator('-');
      eb.bold(true);
      const notesText = `NOTES: ${opts.orderNotes}`;
      eb.text(notesText.slice(0, this.width));
      eb.bold(false);
      eb.separator('-');
    }

    eb.feed(2);
    eb.cut(CutType.Partial);

    return eb.getBuffer();
  }

  /** Asia/Riyadh calendar date as YYYY-MM-DD (matches receipt date format). */
  private formatDate(unixSec: number): string {
    const d = new Date(unixSec * 1000);
    try {
      const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Riyadh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const parts: Record<string, string> = {};
      for (const p of fmt.formatToParts(d)) {
        parts[p.type] = p.value;
      }
      return `${parts.year}-${parts.month}-${parts.day}`;
    } catch {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
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

  /**
   * Order context block under the document id: type banner, table (dine-in),
   * and delivery partner fields (ADR 0007).
   *
   * Type banner: dine-in is bold normal size (TABLE line carries emphasis);
   * takeaway is bold + double-size (no table line to balance it).
   */
  private writeOrderType(
    eb: EscPosBuilder,
    opts: Pick<
      KitchenTicketOptions,
      'orderType' | 'tableName' | 'deliveryPartnerTitle' | 'deliveryExternalRef'
    >,
  ): void {
    const typeLabel = opts.orderType === 'dine_in' ? 'Dine-in' : 'Takeaway';
    const line = `>>>> ${typeLabel} <<<<`;
    eb.align(Align.Center);
    eb.bold(true);
    if (opts.orderType !== 'dine_in') {
      eb.doubleSize(true);
      eb.text(this.truncateDouble(line));
      eb.doubleSize(false);
    } else {
      eb.text(line.slice(0, this.width));
    }
    eb.bold(false);

    // Delivery partner (ADR 0007) — centered under the type banner.
    // "HungerStation / HS-883129" when ref is set, else just the title.
    if (opts.deliveryPartnerTitle) {
      const ref = opts.deliveryExternalRef?.trim();
      const deliveryLine = ref
        ? `${opts.deliveryPartnerTitle} / ${ref}`
        : opts.deliveryPartnerTitle;
      eb.align(Align.Center);
      eb.text(deliveryLine.slice(0, this.width));
    }

    // Table — double size + bold. Omitted for takeaway / when unset.
    // Stored names are usually "T14"; print as "#14" for kitchen readability.
    if (opts.tableName) {
      const tableLabel = opts.tableName.replace(/^T/i, '#');
      eb.align(Align.Center);
      eb.bold(true);
      eb.doubleSize(true);
      eb.text(this.truncateDouble(`TABLE ${tableLabel}`));
      eb.doubleSize(false);
      eb.bold(false);
    }

    eb.align(Align.Left);
  }

  /** Double-size characters occupy two columns each — keep to half the paper width. */
  private truncateDouble(text: string): string {
    return text.slice(0, Math.floor(this.width / 2));
  }

  /**
   * Raster line width in dots for the current paper width: font A is 12 dots
   * per character column (same as receipt-builder). Capped at 576 (80mm @ 203dpi).
   */
  private maxWidthDots(): number {
    return Math.min(Math.max(this.width * 12, 1), 576);
  }

  /**
   * Print an item name line via glyph-atlas raster (GS v 0) so size is tunable
   * with ITEM_LINE_SCALE. Falls back to bold native text if the atlas is missing.
   */
  private writeItemNameLine(eb: EscPosBuilder, nameLine: string): void {
    const scale = ITEM_LINE_SCALE > 0 ? ITEM_LINE_SCALE : 1;
    const maxDots = this.maxWidthDots();
    // Render into a narrower canvas when scaling up so the scaled width still fits.
    const renderWidth = scale === 1 ? maxDots : Math.max(1, Math.floor(maxDots / scale));
    const bmp = renderArabicLineToMonoBitmap(nameLine, { maxWidthDots: renderWidth });
    if (bmp) {
      const out = scale === 1 ? bmp : scaleMonoBitmap(bmp, scale, maxDots);
      eb.rasterBitImage(out.width, out.height, out.bits);
      return;
    }
    // Atlas missing — bold native text fallback.
    eb.bold(true);
    eb.text(nameLine.slice(0, this.width));
    eb.bold(false);
  }
}

/** Nearest-neighbor scale; width is capped at maxWidthDots (right side cropped). */
function scaleMonoBitmap(src: MonoBitmap, scale: number, maxWidthDots: number): MonoBitmap {
  const rawW = Math.max(1, Math.round(src.width * scale));
  const w = Math.min(rawW, maxWidthDots);
  const h = Math.max(1, Math.round(src.height * scale));
  const bits = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(src.height - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(src.width - 1, Math.floor(x / scale));
      bits[y * w + x] = src.bits[sy * src.width + sx];
    }
  }
  return { width: w, height: h, bits };
}
