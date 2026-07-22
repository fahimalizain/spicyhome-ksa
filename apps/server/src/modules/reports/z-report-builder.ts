import { EscPosBuilder, Align, CutType } from '../printers/esc-pos-builder';
import { halalasToSar } from '@spicyhome/shared';

export interface ZReportOptions {
  businessDate: string;
  status: string;
  openingCashHalalas: number;
  closingCashHalalas: number;
  totalSalesHalalas: number;
  totalVatHalalas: number;
  paidOrderCount: number;
  voidedOrderCount: number;
  restaurantName: string;
}

export class ZReportBuilder {
  private readonly width: number;

  constructor(width = 42) {
    this.width = width;
  }

  build(opts: ZReportOptions): Buffer {
    const eb = new EscPosBuilder(this.width);

    eb.init();

    eb.align(Align.Center);
    eb.bold(true);
    eb.doubleSize(true);
    eb.text(opts.status.toUpperCase() === 'OPEN' ? 'X-REPORT' : 'Z-REPORT');
    eb.doubleSize(false);
    eb.bold(false);
    eb.text(opts.restaurantName);
    eb.blankLine();

    eb.align(Align.Left);
    eb.bold(true);
    eb.text(`Date: ${opts.businessDate}`);
    eb.bold(false);
    eb.separator();

    eb.bold(true);
    eb.text('CASH');
    eb.bold(false);
    eb.columnsWidth('Opening Cash', halalasToSar(opts.openingCashHalalas), 10);

    if (opts.closingCashHalalas > 0 || opts.status === 'closed') {
      eb.columnsWidth('Closing Cash', halalasToSar(opts.closingCashHalalas), 10);
      const expectedCash = opts.openingCashHalalas + opts.totalSalesHalalas;
      eb.columnsWidth('Expected', halalasToSar(expectedCash), 10);
      const diff = opts.closingCashHalalas - expectedCash;
      eb.columnsWidth('Difference', halalasToSar(diff), 10);
    }

    eb.separator();
    eb.bold(true);
    eb.text('SALES');
    eb.bold(false);
    eb.columnsWidth('Total Sales', halalasToSar(opts.totalSalesHalalas), 10);
    eb.columnsWidth('Total VAT', halalasToSar(opts.totalVatHalalas), 10);
    eb.separator();

    eb.columnsWidth('Paid Orders', String(opts.paidOrderCount), 10);
    if (opts.voidedOrderCount > 0) {
      eb.columnsWidth('Voided Orders', String(opts.voidedOrderCount), 10);
    }

    eb.separator();

    eb.align(Align.Center);
    eb.text(`Report generated: ${this.formatNow()}`);

    eb.feed(3);
    eb.cut(CutType.Partial);

    return eb.getBuffer();
  }

  private formatNow(): string {
    try {
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Riyadh',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      return fmt.format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 16);
    }
  }
}
