import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn } from 'child_process';
import { Logger } from '@nestjs/common';
import { resolveRawprintPath, isWindows } from './rawprint-helpers';

/**
 * Transport interface for Windows raw spooler printing.
 */
export interface WindowsSpoolerTransport {
  /** Send raw data to a named Windows printer queue. */
  send(printerName: string, data: Buffer, timeoutMs?: number): Promise<void>;

  /** Check if the named printer queue exists. */
  check(printerName: string, timeoutMs?: number): Promise<boolean>;

  /** List all local + network printer queues. */
  listQueues(timeoutMs?: number): Promise<string[]>;
}

/**
 * Maximum time (ms) to wait for rawprint.exe to finish a single job.
 */
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Production transport: spawns rawprint.exe to send raw data via the
 * Windows spooler.
 */
export class WindowsRawprintTransport implements WindowsSpoolerTransport {
  private readonly logger = new Logger(WindowsRawprintTransport.name);
  private readonly exePath: string | null;

  constructor() {
    this.exePath = resolveRawprintPath();
    if (!this.exePath) {
      this.logger.warn(
        'rawprint.exe not found. Set RAWPRINT_PATH env or place rawprint.exe in cwd/prebuilt/. ' +
          'Windows spooler printing will not work until it is available.',
      );
    }
  }

  /**
   * Throw a descriptive error if we are not on win32.
   * Called before any spooler operation.
   */
  private guardPlatform(): void {
    if (!isWindows()) {
      throw new Error('WindowsSpoolerTransport: only supported on win32 platform');
    }
  }

  /**
   * Get the path to rawprint.exe, throwing if not found.
   */
  private getExe(): string {
    if (!this.exePath) {
      throw new Error(
        'rawprint.exe not found. Ensure it is deployed alongside the server ' +
          '(prebuilt/rawprint.exe) or set RAWPRINT_PATH.',
      );
    }
    return this.exePath;
  }

  async send(printerName: string, data: Buffer, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
    this.guardPlatform();
    const exe = this.getExe();

    if (!printerName || printerName.trim().length === 0) {
      throw new Error('WindowsSpoolerTransport.send: printerName is required');
    }

    // Write data to a temp file so we can pass the path to rawprint.exe
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(
      tmpDir,
      `spicyhome-print-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`,
    );
    await fs.promises.writeFile(tmpFile, data);

    try {
      await this.spawnExe(exe, [printerName, tmpFile], timeoutMs);
    } finally {
      // Clean up temp file
      await fs.promises.unlink(tmpFile).catch(() => {
        // best-effort cleanup
      });
    }
  }

  async check(printerName: string, timeoutMs = 5000): Promise<boolean> {
    this.guardPlatform();

    if (!printerName || printerName.trim().length === 0) {
      return false;
    }

    // A printer exists if it appears in the --list output.
    try {
      const queues = await this.listQueues(timeoutMs);
      return queues.some(
        (name) => name.localeCompare(printerName, undefined, { sensitivity: 'base' }) === 0,
      );
    } catch {
      // If listing fails, fall back to just checking that rawprint exists
      // and the name is non-empty.
      return this.exePath !== null && printerName.trim().length > 0;
    }
  }

  async listQueues(timeoutMs = 10_000): Promise<string[]> {
    this.guardPlatform();
    const exe = this.getExe();

    const output = await this.spawnExeCapture(exe, ['--list'], timeoutMs);
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  /**
   * Spawn rawprint.exe and wait for it to finish. Throws on non-zero exit code
   * or timeout.
   */
  private spawnExe(exePath: string, args: string[], timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const proc = spawn(exePath, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        proc.kill();
        reject(new Error(`rawprint.exe timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      proc.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.on('error', (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error(`rawprint.exe spawn failed: ${err.message}`));
      });

      proc.on('close', (code: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        if (code === 0) {
          resolve();
          return;
        }

        const msg = stderr.trim() || `exit code ${code}`;
        switch (code) {
          case 1:
            reject(new Error(`rawprint: bad usage — ${msg}`));
            break;
          case 2:
            reject(new Error(`rawprint: printer not found or access denied — ${msg}`));
            break;
          case 3:
            reject(new Error(`rawprint: print job failed — ${msg}`));
            break;
          case 4:
            reject(new Error(`rawprint: file I/O error — ${msg}`));
            break;
          default:
            reject(new Error(`rawprint: ${msg}`));
        }
      });
    });
  }

  /**
   * Spawn rawprint.exe, capture its stdout, and return it as a string.
   * Used for --list.
   */
  private spawnExeCapture(exePath: string, args: string[], timeoutMs: number): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const proc = spawn(exePath, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        proc.kill();
        reject(new Error(`rawprint.exe timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      proc.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      proc.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.on('error', (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error(`rawprint.exe spawn failed: ${err.message}`));
      });

      proc.on('close', (code: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        if (code === 0) {
          resolve(stdout);
          return;
        }

        reject(new Error(`rawprint.exe ${args.join(' ')}: ${stderr.trim() || `exit ${code}`}`));
      });
    });
  }
}

/**
 * Fake transport for tests — records send operations instead of spawning.
 */
export class FakeWindowsSpoolerTransport implements WindowsSpoolerTransport {
  sent: Array<{ printerName: string; data: Buffer }> = [];
  queues: string[] = [];
  /** If set, throw this error on send. */
  nextError: Error | null = null;

  async send(printerName: string, data: Buffer): Promise<void> {
    if (this.nextError) {
      const err = this.nextError;
      this.nextError = null;
      throw err;
    }
    this.sent.push({ printerName, data });
  }

  async check(printerName: string): Promise<boolean> {
    return this.queues.some(
      (name) => name.localeCompare(printerName, undefined, { sensitivity: 'base' }) === 0,
    );
  }

  async listQueues(): Promise<string[]> {
    return [...this.queues];
  }

  reset() {
    this.sent = [];
    this.queues = [];
    this.nextError = null;
  }
}
