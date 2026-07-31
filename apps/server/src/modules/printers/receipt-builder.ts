import { EscPosBuilder, Align, CutType } from './esc-pos-builder';
import { decomposeVat, halalasToSar } from '@spicyhome/shared';
import { DEFAULT_PRINTER_CONFIG } from '@spicyhome/shared';
import type { PrinterArabicConfig } from '@spicyhome/shared';
import { encodeArabicText } from './arabic-encode';
import { renderArabicLineFromLogical } from './arabic-raster';
import { loadThermalLogo, type MonoBitmap } from './thermal-logo';

export interface ReceiptOptions {
  // Document
  /** ZATCA document kind. Defaults to 'simplified_invoice'. */
  documentKind?: 'simplified_invoice' | 'credit_note';
  /** ZATCA IRN BT-1, e.g. INV26-0042 / REF26-0001. Printed as "Invoice #". */
  documentId: string;
  /** Optional internal order reference — printed as a secondary "Order ref" line. */
  orderNo?: number;
  /** Unix epoch seconds — issue datetime, displayed in Asia/Riyadh. */
  createdAt: number;
  // Seller
  /** Legal seller name from settings (seller_name, not restaurant_name alone). */
  sellerName: string;
  vatNumber: string;
  sellerStreet?: string;
  sellerBuilding?: string;
  sellerCity?: string;
  sellerPostal?: string;
  /** Two-letter country code, e.g. SA. Defaults to 'SA'. */
  sellerCountry?: string;
  // Order meta
  orderType: 'dine_in' | 'takeaway';
  tableName?: string;
  // Lines
  items: ReceiptItem[];
  /** Line totals excluding VAT, integer halalas. */
  subtotalHalalas: number;
  /** VAT amount, integer halalas. */
  vatHalalas: number;
  /** Total including VAT, integer halalas. */
  totalHalalas: number;
  /** VAT rate in basis points — if set, shows "VAT (x.x%)"; if omitted shows "VAT". */
  vatRateBp?: number;
  // Credit note extras
  /** Original invoice IRN for credit notes. */
  originalDocumentId?: string;
  reason?: string;
  // Print / hardware
  /** Hex-encoded TLV payload for ZATCA QR (optional — renders native QR). */
  qrTlvPayload?: string;
  /** Whether to prepend a cash-drawer kick command (for paid receipts). */
  kickDrawer?: boolean;
  /** Optional footer printed centered instead of the default "Thank you! Visit again." */
  footer?: string;
  /** Per-printer Arabic encoding; defaults to DEFAULT_PRINTER_CONFIG.arabic. */
  arabic?: PrinterArabicConfig;
  /**
   * Logo control:
   * - undefined: load default thermal logo (skip silently if missing)
   * - false: never print logo
   * - MonoBitmap: use this bitmap
   */
  logo?: false | MonoBitmap;
}

export interface ReceiptItem {
  qty: number;
  /** English name (optional display; secondary line when Arabic is present). */
  name: string;
  /** Arabic name — primary display when present. */
  nameAr?: string | null;
  /** VAT-inclusive unit price snapshot (order_items.unit_price_halalas). */
  unitPriceHalalas: number;
  /** Line VAT-inclusive total (qty × unit price). */
  totalHalalas: number;
  vatRateBp: number;
}

/** Arabic strings used on the ZATCA receipt. */
const AR_TITLE_SIMPLIFIED =
  '\u0641\u0627\u062A\u0648\u0631\u0629 \u0636\u0631\u064A\u0628\u064A\u0629 \u0645\u0628\u0633\u0637\u0629'; // فاتورة ضريبية مبسطة
const AR_TITLE_CREDIT_NOTE = '\u0625\u0634\u0639\u0627\u0631 \u062F\u0627\u0626\u0646'; // إشعار دائن
const AR_AMOUNT_INCLUDES_VAT =
  '\u0627\u0644\u0645\u0628\u0644\u063A \u0634\u0627\u0645\u0644 \u0636\u0631\u064A\u0628\u0629 \u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0645\u0636\u0627\u0641\u0629'; // المبلغ شامل ضريبة القيمة المضافة

export class ReceiptBuilder {
  private readonly width: number;

  constructor(width = 42) {
    this.width = width;
  }

  build(opts: ReceiptOptions): Buffer {
    const eb = new EscPosBuilder(this.width);
    const arabic = opts.arabic ?? DEFAULT_PRINTER_CONFIG.arabic;
    const isCreditNote = (opts.documentKind ?? 'simplified_invoice') === 'credit_note';

    // Drawer kick (before printing, so drawer opens on receipt cut)
    if (opts.kickDrawer) {
      eb.cashDrawerKick();
    }

    eb.init();
    eb.align(Align.Center);

    // Thermal logo (centered), then document title
    const logo = this.resolveLogo(opts.logo);
    if (logo) {
      eb.rasterBitImage(logo.width, logo.height, logo.bits);
      eb.blankLine();
    }

    // Document title (EN) + Arabic title
    eb.bold(true);
    eb.text(isCreditNote ? 'CREDIT NOTE' : 'SIMPLIFIED TAX INVOICE');
    eb.bold(false);
    this.writeArabicCentered(eb, isCreditNote ? AR_TITLE_CREDIT_NOTE : AR_TITLE_SIMPLIFIED, arabic);
    eb.blankLine();

    // Seller block
    eb.bold(true);
    eb.text(opts.sellerName);
    eb.bold(false);
    const street = [opts.sellerStreet, opts.sellerBuilding].filter(Boolean).join(' ');
    if (street) eb.text(street);
    const city = [opts.sellerCity, opts.sellerPostal].filter(Boolean).join(' ');
    if (city) eb.text(city);
    if (opts.sellerCountry) eb.text(opts.sellerCountry);
    if (opts.vatNumber) {
      eb.text(`VAT: ${opts.vatNumber}`);
    }
    eb.blankLine();

    // Document / order info
    eb.align(Align.Left);
    eb.text(`Invoice #: ${opts.documentId}`);
    const dt = this.formatDateTime(opts.createdAt);
    eb.text(`Date: ${dt.date}  Time: ${dt.time}`);
    const typeLabel = opts.orderType === 'dine_in' ? 'Dine-in' : 'Takeaway';
    let typeLine = `Type: ${typeLabel}`;
    if (opts.tableName) typeLine += `  Table: ${opts.tableName}`;
    eb.text(typeLine);
    if (opts.orderNo != null) {
      eb.text(`Order ref: #${opts.orderNo}`);
    }
    eb.separator();

    // Items
    for (const item of opts.items) {
      this.printItem(eb, item, arabic);
    }

    eb.separator();

    // Totals
    eb.columnsWidth('SUBTOTAL (excl. VAT)', halalasToSar(opts.subtotalHalalas), 10);
    const vatLabel = opts.vatRateBp != null ? `VAT (${(opts.vatRateBp / 100).toFixed(1)}%)` : 'VAT';
    eb.columnsWidth(vatLabel, halalasToSar(opts.vatHalalas), 10);

    eb.bold(true);
    eb.columnsWidth('TOTAL (incl. VAT)', halalasToSar(opts.totalHalalas), 10);
    eb.bold(false);

    eb.text('Amount includes VAT');
    this.writeArabicLine(eb, AR_AMOUNT_INCLUDES_VAT, arabic);
    eb.align(Align.Center);
    eb.text('SAR');
    eb.align(Align.Left);

    eb.separator();

    // Credit note extras
    if (isCreditNote) {
      if (opts.originalDocumentId) {
        eb.text(`Original Invoice: ${opts.originalDocumentId}`);
      }
      if (opts.reason) {
        eb.text(`Reason: ${opts.reason}`);
      }
      eb.separator();
    }

    // Footer
    eb.align(Align.Center);
    eb.text(opts.footer ?? 'Thank you! Visit again.');
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

  // ── Item lines ─────────────────────────────────────────────────────────────

  /**
   * Print one item line block:
   *   {qty}x {nameAr|name}          Arabic primary when present, else English
   *      {name}                     English secondary (indented, when both differ)
   *      @{unitNet}    {lineTotal}  unit net excl. VAT + line total columns
   */
  private printItem(eb: EscPosBuilder, item: ReceiptItem, arabic: PrinterArabicConfig): void {
    const nameAr = item.nameAr && item.nameAr.length > 0 ? item.nameAr : null;
    const qtyPrefix = `${item.qty}x `;
    const primary = nameAr ?? item.name;
    const showEnSecondary = nameAr != null && item.name !== nameAr && item.name.length > 0;

    // Primary name line (Arabic via code page, or ASCII)
    if (nameAr != null) {
      this.writeArabicLine(eb, qtyPrefix + nameAr, arabic);
    } else {
      eb.text(`${qtyPrefix}${this.truncate(primary)}`);
    }

    // English secondary line
    if (showEnSecondary) {
      eb.text(`    ${this.truncate(item.name)}`);
    }

    // Unit net price + line total (ASCII columns)
    const unitNet = decomposeVat(item.unitPriceHalalas, item.vatRateBp).priceExclHalalas;
    eb.columns(`    @${halalasToSar(unitNet)}`, halalasToSar(item.totalHalalas));
  }

  // ── Arabic line helpers ─────────────────────────────────────────────────────

  /**
   * Write a full-width Arabic line.
   *
   * renderMode 'raster': shape + visual order + rasterize to a monochrome
   * bitmap, printed via GS v 0 (joined letterforms). Falls back to the
   * charset path when the glyph atlas is unavailable.
   *
   * renderMode 'charset' (default): switch code page when the encoding needs
   * one, emit encoded bytes, then restore code page 0 for ASCII.
   */
  private writeArabicLine(eb: EscPosBuilder, text: string, arabic: PrinterArabicConfig): void {
    if (arabic.renderMode === 'raster') {
      const bmp = renderArabicLineFromLogical(text, arabic, { maxWidthDots: this.maxWidthDots() });
      if (bmp) {
        eb.rasterBitImage(bmp.width, bmp.height, bmp.bits);
        eb.blankLine();
        return;
      }
      // Atlas missing — fall through to charset bytes.
    }
    const bytes = encodeArabicText(arabic, text);
    if (bytes.length === 0) return;
    const needCP = this.needCodePage(arabic);
    if (needCP) eb.codePage(arabic.codePage);
    eb.rawLine(bytes);
    if (needCP) eb.codePage(0);
  }

  /**
   * Write an Arabic line centered on the paper width.
   *
   * raster mode centers the rendered bitmap (pad left) so the visual line is
   * truly centered; charset mode uses byte-based padding — good enough for a
   * short title line; column math for mixed RTL is avoided by design.
   */
  private writeArabicCentered(eb: EscPosBuilder, text: string, arabic: PrinterArabicConfig): void {
    if (arabic.renderMode === 'raster') {
      const bmp = renderArabicLineFromLogical(text, arabic, {
        maxWidthDots: this.maxWidthDots(),
        align: 'center',
      });
      if (bmp) {
        eb.rasterBitImage(bmp.width, bmp.height, bmp.bits);
        eb.blankLine();
        return;
      }
      // Atlas missing — fall through to charset bytes.
    }
    const bytes = encodeArabicText(arabic, text);
    if (bytes.length === 0) return;
    const needCP = this.needCodePage(arabic);
    if (needCP) eb.codePage(arabic.codePage);
    const pad = Math.max(0, Math.floor((this.width - bytes.length) / 2));
    if (pad > 0) eb.raw(new Array(pad).fill(0x20));
    eb.rawLine(bytes);
    if (needCP) eb.codePage(0);
  }

  /**
   * Whether the configured encoding requires an explicit ESC t code page
   * switch. UTF-8 with codePage 0 needs no switch; 'none' also emits UTF-8
   * without switching (capable printers only — production should set an
   * explicit encoding).
   */
  private needCodePage(arabic: PrinterArabicConfig): boolean {
    if (arabic.encoding === 'w1256' || arabic.encoding === 'pc864') return true;
    return arabic.encoding === 'utf8' && arabic.codePage !== 0;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Raster line width in dots for the current paper width: font A is 12 dots
   * per character column, so 42 chars ≈ 504 dots (80mm) and 32 chars = 384
   * dots (58mm). Capped at 576 (max 80mm raster width at 203dpi).
   */
  private maxWidthDots(): number {
    return Math.min(Math.max(this.width * 12, 1), 576);
  }

  private resolveLogo(logo: ReceiptOptions['logo']): MonoBitmap | null {
    if (logo === false) return null;
    if (logo && typeof logo === 'object') return logo;
    return loadThermalLogo({ size: 240 });
  }

  private truncate(s: string, max = 28): string {
    return s.length > max ? s.slice(0, max - 3) + '...' : s;
  }

  /** Format unix seconds as Asia/Riyadh date (YYYY-MM-DD) + time (HH:mm). */
  private formatDateTime(unixSec: number): { date: string; time: string } {
    const d = new Date(unixSec * 1000);
    try {
      const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Riyadh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      });
      const parts: Record<string, string> = {};
      for (const p of fmt.formatToParts(d)) {
        parts[p.type] = p.value;
      }
      const date = `${parts.year}-${parts.month}-${parts.day}`;
      const time = `${parts.hour}:${parts.minute}`;
      return { date, time };
    } catch {
      // fallback: local-time formatting (server runs with TZ=Asia/Riyadh)
      const pad = (n: number) => String(n).padStart(2, '0');
      return {
        date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      };
    }
  }
}
