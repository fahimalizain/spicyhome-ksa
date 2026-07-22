import { EscPosBuilder, Align, CutType } from './esc-pos-builder';
import { halalasToSar, decomposeVat } from '@spicyhome/shared';

export interface ReceiptOptions {
  restaurantName: string;
  vatNumber: string;
  orderNo: number;
  /** Unix epoch seconds */
  createdAt: number;
  orderType: 'dine_in' | 'takeaway';
  tableName?: string;
  items: ReceiptItem[];
  subtotalHalalas: number;
  vatHalalas: number;
  totalHalalas: number;
  /** VAT rate in basis points for display (default 1500) */
  vatRateBp?: number;
  /** Hex-encoded TLV payload for ZATCA QR (optional — renders native QR). */
  qrTlvPayload?: string;
  /** Whether to prepend a cash-drawer kick command (for paid receipts). */
  kickDrawer?: boolean;
}

export interface ReceiptItem {
  qty: number;
  name: string;
  /** VAT-inclusive total for this line (qty × unitPrice). */
  totalHalalas: number;
}

export class ReceiptBuilder {
  private readonly width: number;

  constructor(width = 42) {
    this.width = width;
  }

  build(opts: ReceiptOptions): Buffer {
    const eb = new EscPosBuilder(this.width);

    // Drawer kick (before printing, so drawer opens on receipt cut)
    if (opts.kickDrawer) {
      eb.cashDrawerKick();
    }

    eb.init();

    // Header
    eb.align(Align.Center);
    eb.bold(true);
    eb.text(opts.restaurantName);
    eb.bold(false);
    if (opts.vatNumber) {
      eb.text(`VAT: ${opts.vatNumber}`);
    }
    eb.blankLine();

    // Order info
    eb.align(Align.Left);
    eb.text(`Order #: ${opts.orderNo}`);
    eb.text(`Date: ${this.formatDateTime(opts.createdAt)}`);
    const typeLabel = opts.orderType === 'dine_in' ? 'Dine-in' : 'Takeaway';
    let typeLine = `Type: ${typeLabel}`;
    if (opts.tableName) typeLine += `  Table: ${opts.tableName}`;
    eb.text(typeLine);
    eb.separator();

    // Items
    for (const item of opts.items) {
      const qty = item.qty;
      const name = item.name.length > 28 ? item.name.slice(0, 25) + '...' : item.name;
      const left = `${qty}x ${name}`;
      const right = halalasToSar(item.totalHalalas);
      eb.columns(left, right);
    }

    eb.separator();

    // Totals
    const vatRateBp = opts.vatRateBp ?? 1500;
    const vatPct = (vatRateBp / 100).toFixed(1);
    eb.columnsWidth('SUBTOTAL (excl. VAT)', halalasToSar(opts.subtotalHalalas), 10);
    eb.columnsWidth(`VAT (${vatPct}%)`, halalasToSar(opts.vatHalalas), 10);

    eb.bold(true);
    eb.columnsWidth('TOTAL', halalasToSar(opts.totalHalalas), 10);
    eb.bold(false);

    eb.separator();

    // Footer
    eb.align(Align.Center);
    eb.text('Thank you! Visit again.');
    eb.blankLine();

    // ZATCA QR (optional slot)
    if (opts.qrTlvPayload) {
      eb.qrCode(opts.qrTlvPayload);
      eb.blankLine();
    }

    // Cut
    eb.feed(3);
    eb.cut(CutType.Partial);

    return eb.getBuffer();
  }

  private formatDateTime(unixSec: number): string {
    const d = new Date(unixSec * 1000);
    try {
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Riyadh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      return fmt.format(d);
    } catch {
      // fallback: basic formatting
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  }
}
