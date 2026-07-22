import { EscPosBuilder, Align, CutType } from './esc-pos-builder';

export interface KitchenTicketOptions {
  orderNo: number;
  /** Unix epoch seconds */
  createdAt: number;
  orderType: 'dine_in' | 'takeaway';
  tableName?: string;
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

    // Big order number
    eb.align(Align.Center);
    eb.doubleSize(true);
    eb.bold(true);
    eb.text(`ORDER #${opts.orderNo}`);
    eb.bold(false);
    eb.doubleSize(false);

    eb.separator('=');

    // Order info
    eb.align(Align.Left);
    const typeLabel = opts.orderType === 'dine_in' ? 'Dine-in' : 'Takeaway';
    let typeLine = `Type: ${typeLabel}`;
    if (opts.tableName) typeLine += `  Table: ${opts.tableName}`;
    eb.text(typeLine);
    eb.text(`Time: ${this.formatTime(opts.createdAt)}`);
    eb.separator();

    // Items — qty BIG, name, notes highlighted
    for (const item of opts.items) {
      eb.bold(true);
      eb.doubleSize(true);
      const qtyStr = `${item.qty}`;
      const nameWidth = this.width - qtyStr.length - 1;
      const namePart = item.name.slice(0, nameWidth);
      eb.text(`${qtyStr} ${namePart}`);
      eb.doubleSize(false);
      eb.bold(false);

      if (item.notes) {
        eb.underline(true);
        const notesText = `  * ${item.notes}`;
        const truncated = notesText.slice(0, this.width);
        eb.text(truncated);
        eb.underline(false);
      }
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
        hour12: false,
      });
      return fmt.format(d);
    } catch {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  }
}
