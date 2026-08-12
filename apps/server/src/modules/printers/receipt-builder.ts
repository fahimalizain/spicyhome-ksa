import { EscPosBuilder, Align, CutType } from './esc-pos-builder';
import { halalasToSar } from '@spicyhome/shared';
import { DEFAULT_PRINTER_CONFIG } from '@spicyhome/shared';
import type { PrinterArabicConfig } from '@spicyhome/shared';
import { encodeArabicText } from './arabic-encode';
import { renderArabicLineFromLogical, renderLeftRightLineFromLogical } from './arabic-raster';
import { loadThermalLogo, type MonoBitmap } from './thermal-logo';

/** Column widths for money on the item rate/total line (chars). */
const ITEM_RATE_W = 10;
const ITEM_TOTAL_W = 10;

/**
 * Scale for item-name raster lines (qty + EN | AR). Atlas cell is 32 dots
 * (~native Font A height). 1.25 is a slight bump; kitchen tickets use 1.5.
 * Seller/title rasters stay unscaled.
 */
const ITEM_NAME_LINE_SCALE = 1.25;

export interface ReceiptOptions {
  // Document
  /**
   * Document kind. Defaults to 'simplified_invoice'.
   * - 'simplified_invoice' / 'credit_note': ZATCA documents (QR, VAT #, address).
   * - 'open_order': non-ZATCA open order slip — no QR, no VAT #, no address,
   *   no "Invoice #" line, no drawer kick.
   */
  documentKind?: 'simplified_invoice' | 'credit_note' | 'open_order';
  /**
   * ZATCA IRN BT-1, e.g. INV26-0042 / REF26-0001. Printed as "Invoice #" for
   * ZATCA documents. Ignored for 'open_order' (never printed).
   */
  documentId: string;
  /** Optional internal order reference — printed as a secondary "Order ref" line. Required for 'open_order' (printed as "Order #"). */
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
  /** Arabic seller legal name (settings.seller_name_ar) — right-aligned next to the English name on ZATCA receipts. */
  sellerNameAr?: string;
  /** Arabic street (settings.seller_street_ar) — right-aligned on the seller street/building line. */
  sellerStreetAr?: string;
  /** Arabic city (settings.seller_city_ar) — right-aligned on the seller city/country line. */
  sellerCityAr?: string;
  // Order meta
  orderType: 'dine_in' | 'takeaway';
  tableName?: string;
  /** Delivery partner title (e.g. "HungerStation") — printed when the order is linked to a delivery partner (ADR 0007). */
  deliveryPartnerTitle?: string;
  /** Delivery app's order number for reconciliation (e.g. "HS-883129") — printed when set. */
  deliveryExternalRef?: string;
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
  /** Net payments already recorded (SUM order_payments.amount_halalas). Open order only. */
  paidHalalas?: number;
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

/** Full country names for the seller city/country line — never the ISO code on the receipt. */
const SELLER_COUNTRY_EN = 'Kingdom of Saudi Arabia';
const SELLER_COUNTRY_AR =
  '\u0627\u0644\u0645\u0645\u0644\u0643\u0629 \u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0627\u0644\u0633\u0639\u0648\u062F\u064A\u0629'; // المملكة العربية السعودية

/** Arabic strings used on the non-ZATCA open order receipt. */
const AR_TITLE_OPEN_ORDER =
  '\u0625\u064A\u0635\u0627\u0644 \u0637\u0644\u0628 \u0645\u0641\u062A\u0648\u062D'; // إيصال طلب مفتوح
const AR_NOT_TAX_INVOICE =
  '\u0647\u0630\u0627 \u0644\u064A\u0633 \u0641\u0627\u062A\u0648\u0631\u0629 \u0636\u0631\u064A\u0628\u064A\u0629'; // هذا ليس فاتورة ضريبية
const AR_COLLECT_STI =
  '\u064A\u0631\u062C\u0649 \u0627\u0633\u062A\u0644\u0627\u0645 \u0641\u0627\u062A\u0648\u0631\u062A\u0643 \u0627\u0644\u0636\u0631\u064A\u0628\u064A\u0629 \u0627\u0644\u0645\u0628\u0633\u0637\u0629 \u0641\u064A \u0646\u0647\u0627\u064A\u0629 \u0632\u064A\u0627\u0631\u062A\u0643\u0645'; // يرجى استلام فاتورتك الضريبية المبسطة في نهاية زيارتكم

export class ReceiptBuilder {
  private readonly width: number;

  /** Default 45 chars (80mm; between standard 42 and full 48). */
  constructor(width = 45) {
    this.width = width;
  }

  build(opts: ReceiptOptions): Buffer {
    const eb = new EscPosBuilder(this.width);
    const arabic = opts.arabic ?? DEFAULT_PRINTER_CONFIG.arabic;
    const isCreditNote = opts.documentKind === 'credit_note';
    const isOpenOrder = opts.documentKind === 'open_order';

    // Drawer kick (before printing, so drawer opens on receipt cut).
    // Never kick the drawer on a non-ZATCA open order receipt.
    if (opts.kickDrawer && !isOpenOrder) {
      eb.cashDrawerKick();
    }

    eb.init();
    eb.align(Align.Center);

    // Thermal logo (GS v 0 is left-origin on most printers — leave unpadded).
    const logo = this.resolveLogo(opts.logo);
    if (logo) {
      eb.rasterBitImage(logo.width, logo.height, logo.bits);
      eb.blankLine();
    }

    // Text block: ~5% left margin so content isn't flush-left against the
    // paper edge (uses spare space that otherwise shows as a right-side gap).
    eb.leftMargin(Math.round(this.maxWidthDots() * 0.05));

    // Document title (EN) + Arabic title
    const titleEn = isCreditNote
      ? 'CREDIT NOTE'
      : isOpenOrder
        ? 'OPEN ORDER RECEIPT'
        : 'SIMPLIFIED TAX INVOICE';
    const titleAr = isCreditNote
      ? AR_TITLE_CREDIT_NOTE
      : isOpenOrder
        ? AR_TITLE_OPEN_ORDER
        : AR_TITLE_SIMPLIFIED;
    eb.bold(true);
    eb.text(titleEn);
    eb.bold(false);
    this.writeArabicCentered(eb, titleAr, arabic);
    eb.blankLine();

    // Seller block — open order receipts show only the display name
    // (restaurant_name), never the ZATCA legal name/address/VAT number.
    if (isOpenOrder) {
      eb.bold(true);
      eb.text(opts.sellerName);
      eb.bold(false);
    } else {
      // ZATCA documents: bilingual seller lines — English flush left, Arabic
      // flush right on the same line.
      // 1. Legal name — kept bold (bold wraps the whole line, AR included).
      const sellerNameAr =
        opts.sellerNameAr && opts.sellerNameAr.length > 0 ? opts.sellerNameAr : null;
      eb.bold(true);
      if (sellerNameAr) {
        this.printLeftRightLine(eb, opts.sellerName, sellerNameAr, arabic);
      } else {
        eb.text(opts.sellerName);
      }
      eb.bold(false);

      // 2. Street/building: EN "building street" (1234 King Fahd Rd),
      //    AR "streetAr building" only when streetAr is set (don't mirror
      //    bare building digits on the right).
      const streetEn = [opts.sellerBuilding, opts.sellerStreet].filter(Boolean).join(' ');
      const streetAr =
        opts.sellerStreetAr && opts.sellerStreetAr.length > 0
          ? [opts.sellerStreetAr, opts.sellerBuilding].filter(Boolean).join(' ')
          : '';
      this.printSellerLine(eb, streetEn, streetAr, arabic);

      // 3. City — bilingual when cityAr set. No postal / ISO country code.
      const cityEn = (opts.sellerCity ?? '').trim();
      const cityAr = (opts.sellerCityAr ?? '').trim();
      this.printSellerLine(eb, cityEn, cityAr, arabic);

      // 4. Country — full names. Too long for one EN|AR row on 42–45 col
      //    paper, so EN is a full left line and AR is right-aligned alone.
      eb.text(SELLER_COUNTRY_EN.slice(0, this.width));
      this.printSellerLine(eb, '', SELLER_COUNTRY_AR, arabic);

      if (opts.vatNumber) {
        eb.text(`VAT: ${opts.vatNumber}`);
      }
    }
    eb.blankLine();

    // Document / order info
    eb.align(Align.Left);
    if (isOpenOrder) {
      // Internal order number — NOT the ZATCA IRN / documentId.
      eb.text(`Order #: ${opts.orderNo ?? ''}`);
    } else {
      eb.text(`Invoice #: ${opts.documentId}`);
    }
    const dt = this.formatDateTime(opts.createdAt);
    eb.text(`Date: ${dt.date}  Time: ${dt.time}`);
    const typeLabel = opts.orderType === 'dine_in' ? 'Dine-in' : 'Takeaway';
    let typeLine = `Type: ${typeLabel}`;
    if (opts.tableName) typeLine += `  Table: ${opts.tableName}`;
    eb.text(typeLine);
    // Delivery partner (ADR 0007): title + app order ref, only when set.
    if (opts.deliveryPartnerTitle) {
      eb.text(`Delivery: ${opts.deliveryPartnerTitle}`);
    }
    if (opts.deliveryExternalRef) {
      eb.text(`App order #: ${opts.deliveryExternalRef}`);
    }
    eb.separator();

    // Items table (separator above header is the one just emitted)
    this.printItemHeader(eb);
    eb.separator();
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

    if (!isOpenOrder) {
      eb.text('Amount includes VAT');
      this.writeArabicLine(eb, AR_AMOUNT_INCLUDES_VAT, arabic);
    }

    eb.separator();

    // Open order: payment summary for the table-side ATM-POS. AMOUNT DUE is
    // always printed (even when it equals the total) so the amount the guest
    // still owes is unambiguous; PAID only when payments have already been
    // recorded on the order (ADR 0006 — payment before food).
    if (isOpenOrder) {
      const paidHalalas = opts.paidHalalas ?? 0;
      const outstandingHalalas = opts.totalHalalas - paidHalalas;
      if (paidHalalas > 0) {
        eb.columnsWidth('PAID', halalasToSar(paidHalalas), 10);
      }
      eb.bold(true);
      eb.columnsWidth('AMOUNT DUE', halalasToSar(outstandingHalalas), 10);
      eb.bold(false);
      eb.separator();
    }

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
    if (isOpenOrder) {
      // Non-ZATCA framing: NOT a tax invoice, and the guest must collect the
      // Simplified Tax Invoice at the end of the visit. Replaces the default
      // "Thank you" footer.
      eb.bold(true);
      eb.text('*** NOT A TAX INVOICE ***');
      eb.bold(false);
      this.writeArabicCentered(eb, AR_NOT_TAX_INVOICE, arabic);
      eb.blankLine();
      eb.text('Please collect your Simplified Tax Invoice');
      eb.text('at the end of your visit.');
      this.writeArabicCentered(eb, AR_COLLECT_STI, arabic);
    } else {
      eb.align(Align.Center);

      // Store contact (all receipt kinds)
      eb.text('Home Delivery');
      eb.text('0112357926 | 0533243439');
      eb.blankLine();
      eb.text('********');
      eb.text(opts.footer ?? 'Thank you! Visit again.');
      eb.text('********');
      eb.blankLine();

      // ZATCA QR (optional slot) — never on open order receipts.
      if (opts.qrTlvPayload) {
        eb.qrCode(opts.qrTlvPayload);
        eb.blankLine();
      }
    }

    // Cut
    eb.feed(3);
    eb.cut(CutType.Partial);

    return eb.getBuffer();
  }

  // ── Item table ─────────────────────────────────────────────────────────────

  private printItemHeader(eb: EscPosBuilder): void {
    // Single header line; item body is still 2 lines (name, then rate+total).
    const money = 'Rate'.padStart(ITEM_RATE_W) + ' ' + 'Total'.padStart(ITEM_TOTAL_W);
    const leftW = Math.max(0, this.width - money.length);
    const left = 'Qty  Item'.slice(0, leftW).padEnd(leftW);
    eb.bold(true);
    eb.text((left + money).slice(0, this.width));
    eb.bold(false);
  }

  /** Left half of the name line: "2  Zinger Burger". */
  private formatQtyEnLeft(qty: number, nameEn: string): string {
    const en = (nameEn || '').trim();
    const prefix = `${qty}  `;
    if (!en) return prefix.trimEnd();
    const maxEn = Math.max(0, this.width - prefix.length);
    return prefix + en.slice(0, maxEn);
  }

  /**
   * One item = two lines:
   *   1) Qty  ItemNameEn …… ItemNameAr   (AR flush to the right paper edge)
   *   2)                Rate …… Total
   */
  private printItem(eb: EscPosBuilder, item: ReceiptItem, arabic: PrinterArabicConfig): void {
    const nameAr = item.nameAr && item.nameAr.length > 0 ? item.nameAr : null;
    const left = this.formatQtyEnLeft(item.qty, item.name);

    if (nameAr != null) {
      this.printQtyNameLine(eb, left, nameAr, arabic, ITEM_NAME_LINE_SCALE);
    } else {
      eb.text(left.slice(0, this.width));
    }

    // Rate (VAT-incl) right-aligned just before Total (both on trailing money cols).
    const rate = halalasToSar(item.unitPriceHalalas).padStart(ITEM_RATE_W);
    const total = halalasToSar(item.totalHalalas).padStart(ITEM_TOTAL_W);
    const money = `${rate} ${total}`;
    const pad = Math.max(0, this.width - money.length);
    eb.text((' '.repeat(pad) + money).slice(0, this.width));
  }

  /**
   * Qty+EN on the left, Arabic flush-right on the same line.
   * Raster: composite two bitmaps so glyph advances don't leave AR short of the edge.
   * Charset: ASCII left + space pad + encoded AR (1 cell/byte for w1256/pc864).
   * @param scale nearest-neighbor scale for raster output (item names only; default 1).
   */
  private printQtyNameLine(
    eb: EscPosBuilder,
    left: string,
    nameAr: string,
    arabic: PrinterArabicConfig,
    scale = 1,
  ): void {
    if (arabic.renderMode === 'raster') {
      const s = scale > 0 ? scale : 1;
      const maxDots = this.maxWidthDots();
      // Render into a narrower canvas when scaling up so scaled width still fits.
      const renderWidth = s === 1 ? maxDots : Math.max(1, Math.floor(maxDots / s));
      const bmp = renderLeftRightLineFromLogical(left, nameAr, arabic, {
        maxWidthDots: renderWidth,
      });
      if (bmp) {
        const out = s === 1 ? bmp : scaleMonoBitmap(bmp, s, maxDots);
        eb.rasterBitImage(out.width, out.height, out.bits);
        return;
      }
      // Atlas missing — fall through to charset.
    }

    const arBytes = encodeArabicText(arabic, nameAr);
    if (arBytes.length === 0) {
      eb.text(left.slice(0, this.width));
      return;
    }
    // Single-byte code pages: 1 byte ≈ 1 cell. UTF-8: use code-point count.
    const arCells =
      arabic.encoding === 'utf8' || arabic.encoding === 'none'
        ? Array.from(nameAr).length
        : arBytes.length;
    const leftMax = Math.max(0, this.width - arCells);
    const leftText = left.slice(0, leftMax);
    const pad = Math.max(0, this.width - leftText.length - arCells);
    const needCP = this.needCodePage(arabic);
    if (needCP) eb.codePage(arabic.codePage);
    eb.raw(Buffer.from(leftText, 'ascii'));
    if (pad > 0) eb.raw(new Array(pad).fill(0x20));
    eb.rawLine(arBytes);
    if (needCP) eb.codePage(0);
  }

  // ── Seller block lines ──────────────────────────────────────────────────────

  /**
   * One bilingual seller line: English flush left, Arabic flush right (same
   * left-right machinery as item name lines). Skip the line when both sides
   * are empty; print EN alone when AR is missing; right-align AR alone when
   * EN is missing.
   */
  private printSellerLine(
    eb: EscPosBuilder,
    leftEn: string,
    rightAr: string,
    arabic: PrinterArabicConfig,
  ): void {
    const ar = rightAr && rightAr.length > 0 ? rightAr : null;
    if (!leftEn && !ar) return;
    if (ar == null) {
      eb.text(leftEn.slice(0, this.width));
      return;
    }
    this.printLeftRightLine(eb, leftEn, ar, arabic);
  }

  /**
   * Generic left/right bilingual line — alias over the item-name machinery
   * (raster composite + charset padding) so raster/charset logic lives in one
   * place for both item names and seller lines.
   */
  private printLeftRightLine(
    eb: EscPosBuilder,
    left: string,
    rightAr: string,
    arabic: PrinterArabicConfig,
  ): void {
    this.printQtyNameLine(eb, left, rightAr, arabic);
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
    return loadThermalLogo();
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
