import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { printers, settings } from '@spicyhome/db';
import { PrinterRole } from '@spicyhome/shared';
import { DRIZZLE } from '../database/database.module';
import { createAuditFields, updateAuditFields } from '../../common/audit-fields.helper';
import {
  PrinterTransport,
  TcpPrinterTransport,
  PrinterUnreachableError,
} from './printer-transport';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '@spicyhome/db';

export interface PrinterRecord {
  id: number;
  name: string;
  ip: string;
  port: number;
  role: string;
  isActive: number;
}

@Injectable()
export class PrintersService {
  private transport: PrinterTransport;

  constructor(@Inject(DRIZZLE) private db: BetterSQLite3Database<typeof schema>) {
    this.transport = new TcpPrinterTransport(); // overridden in tests
  }

  /** Replace transport for testing. */
  setTransport(t: PrinterTransport): void {
    this.transport = t;
  }

  getTransport(): PrinterTransport {
    return this.transport;
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────────

  list(): PrinterRecord[] {
    return this.db.select().from(printers).all() as PrinterRecord[];
  }

  get(id: number): PrinterRecord {
    const p = this.db.select().from(printers).where(eq(printers.id, id)).get() as PrinterRecord | undefined;
    if (!p) throw new NotFoundException('Printer not found');
    return p;
  }

  create(dto: any, userId: number) {
    const now = Math.floor(Date.now() / 1000);
    const row = {
      name: dto.name,
      ip: dto.ip,
      port: dto.port ?? 9100,
      role: dto.role,
      isActive: dto.isActive !== undefined ? (dto.isActive ? 1 : 0) : 1,
      ...createAuditFields(userId, now),
    };
    const result = this.db.insert(printers).values(row as any).run();
    return { id: Number(result.lastInsertRowid), ...row };
  }

  update(id: number, dto: any, userId: number) {
    const p = this.db.select().from(printers).where(eq(printers.id, id)).get();
    if (!p) throw new NotFoundException('Printer not found');

    const updates: Record<string, any> = { ...updateAuditFields(userId) };
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.ip !== undefined) updates.ip = dto.ip;
    if (dto.port !== undefined) updates.port = dto.port;
    if (dto.role !== undefined) updates.role = dto.role;
    if (dto.isActive !== undefined) updates.isActive = dto.isActive ? 1 : 0;

    this.db.update(printers).set(updates).where(eq(printers.id, id)).run();
    return this.db.select().from(printers).where(eq(printers.id, id)).get();
  }

  // ── Printing ─────────────────────────────────────────────────────────────────

  async sendBuffer(printer: PrinterRecord, buffer: Buffer): Promise<void> {
    try {
      await this.transport.send(printer.ip, printer.port, buffer);
    } catch (err: any) {
      throw new PrinterUnreachableError(
        `Printer "${printer.name}" unreachable: ${err.message}`,
        printer.name,
        err,
      );
    }
  }

  async checkPrinter(id: number): Promise<{ reachable: boolean }> {
    const p = this.get(id);
    const reachable = await this.transport.check(p.ip, p.port);
    return { reachable };
  }

  /** Get active printer by role. Returns null if none or multiple found. */
  getActiveByRole(role: string): PrinterRecord | null {
    const results = this.db
      .select()
      .from(printers)
      .where(eq(printers.role, role))
      .all() as PrinterRecord[];
    const active = results.filter((p) => p.isActive === 1);
    if (active.length === 1) return active[0];
    return null;
  }

  /** Get active printer by printer_id — used for category kitchen routing. */
  getByPrinterId(printerId: number): PrinterRecord | null {
    const p = this.db
      .select()
      .from(printers)
      .where(eq(printers.id, printerId))
      .get() as PrinterRecord | undefined;
    if (!p || p.isActive !== 1) return null;
    return p;
  }

  // ── Settings ─────────────────────────────────────────────────────────────────

  getSetting(key: string, defaultValue = ''): string {
    const row = this.db.select().from(settings).where(eq(settings.key, key)).get();
    return row?.value ?? defaultValue;
  }

  setSetting(key: string, value: string): void {
    const existing = this.db.select().from(settings).where(eq(settings.key, key)).get();
    if (existing) {
      this.db.update(settings).set({ value }).where(eq(settings.key, key)).run();
    } else {
      this.db.insert(settings).values({ key, value }).run();
    }
  }

  getAllSettings(): Array<{ key: string; value: string }> {
    return this.db.select().from(settings).all();
  }
}
