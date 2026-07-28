/**
 * ZATCA Clearance Service — synchronous, blocking HTTP client that POSTs
 * a signed standard invoice (or credit/debit note) to ZATCA's clearance
 * endpoint and returns a structured result.
 *
 * Unlike the reporting service, this service does NOT poll, does NOT enqueue,
 * and does NOT update any database status. It is a pure API client + result
 * parser. Callers (e.g. a future standard invoice service) receive a
 * structured {@link ZatcaClearanceResult} they can act on.
 *
 * **Error handling contract**: this service never throws to the caller for
 * ZATCA API failures or network errors. All outcomes are encoded in the
 * returned result. The only exception is a missing org-unit setting which
 * is a programmer error and will throw.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ZatcaHttpService } from './zatca-http.service';
import { PrintersService } from '../printers/printers.service';
import { zatcaKey } from '@spicyhome/shared';
import type { ZATCAEnvironment } from '@spicyhome/shared';

// ── Public types ───────────────────────────────────────────────────────────────

export type ZatcaClearanceStatus = 'CLEARED' | 'REJECTED' | 'ERROR' | 'NO_CREDENTIALS';

export interface ZatcaClearanceResult {
  status: ZatcaClearanceStatus;
  /** HTTP status code from ZATCA (0 if no request sent) */
  httpStatus: number;
  /** Cleared invoice XML (decoded from response) when CLEARED; null otherwise */
  clearedXml: string | null;
  /** Raw clearedInvoice field from response if present (base64) — optional debug */
  clearedInvoiceBase64: string | null;
  warnings: string[];
  errors: string[];
  /** Raw response body as a string (truncated in logs; full string OK in tests) */
  rawBody: string | null;
}

// ── Service ────────────────────────────────────────────────────────────────────

@Injectable()
export class ZatcaClearanceService {
  private readonly logger = new Logger(ZatcaClearanceService.name);

  constructor(
    private httpClient: ZatcaHttpService,
    private printersService: PrintersService,
  ) {}

  /**
   * POST a signed document to the ZATCA clearance endpoint and return a
   * structured result.
   *
   * **Never throws** for ZATCA API or network failures — all outcomes are
   * encoded in the returned {@link ZatcaClearanceResult}.
   *
   * @param input.invoiceHash - Base64 hash of the signed XML (invoice hash).
   * @param input.uuid - Unique identifier for the document (ZATCA UUID).
   * @param input.xml - Raw signed XML string (the service base64-encodes it).
   */
  async clearDocument(input: {
    invoiceHash: string;
    uuid: string;
    xml: string;
  }): Promise<ZatcaClearanceResult> {
    const env = this.getEnv();
    const orgUnit = this.getOrgUnit();

    // Resolve credentials — prefer production, fall back to compliance
    const productionCert = this.printersService.getSetting(
      zatcaKey(env, orgUnit, 'production_cert'),
      '',
    );
    const productionSecret = this.printersService.getSetting(
      zatcaKey(env, orgUnit, 'production_secret'),
      '',
    );
    const complianceCert = this.printersService.getSetting(
      zatcaKey(env, orgUnit, 'compliance_cert'),
      '',
    );
    const complianceSecret = this.printersService.getSetting(
      zatcaKey(env, orgUnit, 'compliance_secret'),
      '',
    );

    const cert = productionCert || complianceCert;
    const secret = productionSecret || complianceSecret;

    if (!cert || !secret) {
      this.logger.warn(`Clearance skipped for uuid=${input.uuid}: no credentials available`);
      return {
        status: 'NO_CREDENTIALS',
        httpStatus: 0,
        clearedXml: null,
        clearedInvoiceBase64: null,
        warnings: [],
        errors: [],
        rawBody: null,
      };
    }

    const baseUrl = this.getApiBaseUrl();
    const url = `${baseUrl}/invoices/clearance/single`;

    const body = JSON.stringify({
      invoiceHash: input.invoiceHash,
      uuid: input.uuid,
      invoice: Buffer.from(input.xml).toString('base64'),
    });

    let response;
    try {
      response = await this.httpClient.post(url, {
        body,
        headers: {
          'Content-Type': 'application/json',
          'Accept-Version': 'V2',
          'Clearance-Status': '1',
          'Accept-Language': 'en',
        },
        auth: {
          username: cert,
          password: secret,
        },
        timeoutMs: 30000,
      });
    } catch (err: any) {
      this.logger.error(`Clearance network error for uuid=${input.uuid}: ${err.message}`);
      return {
        status: 'ERROR',
        httpStatus: 0,
        clearedXml: null,
        clearedInvoiceBase64: null,
        warnings: [],
        errors: [err.message],
        rawBody: null,
      };
    }

    const httpStatus = response.status;
    const rawBody = response.body;

    this.logger.log(
      `Clearance response for uuid=${input.uuid}: HTTP ${httpStatus} body=${rawBody.slice(0, 200)}`,
    );

    return this.parseResponse(httpStatus, rawBody, input.uuid);
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private getEnv(): ZATCAEnvironment {
    return this.printersService.getSetting('zatca_environment', 'simulation') as ZATCAEnvironment;
  }

  private getOrgUnit(): string {
    return this.printersService.getSetting('zatca_org_unit', '');
  }

  private getApiBaseUrl(): string {
    return this.printersService.getSetting(
      'zatca_api_base_url',
      'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation',
    );
  }

  /**
   * Parse the clearance HTTP response body into a structured result.
   *
   * Handles 200/202 (success paths with possible warnings), 4xx/5xx
   * (rejection paths), and bodies that may or may not be valid JSON.
   */
  private parseResponse(httpStatus: number, rawBody: string, uuid: string): ZatcaClearanceResult {
    if (httpStatus === 200 || httpStatus === 202) {
      return this.parseSuccessResponse(httpStatus, rawBody, uuid);
    }

    return this.parseErrorResponse(httpStatus, rawBody, uuid);
  }

  private parseSuccessResponse(
    httpStatus: number,
    rawBody: string,
    uuid: string,
  ): ZatcaClearanceResult {
    let warnings: string[] = [];
    let errors: string[] = [];
    let clearanceStatus: string | undefined;
    let clearedInvoiceBase64: string | null = null;
    let clearedXml: string | null = null;

    try {
      const json = JSON.parse(rawBody);

      // Extract explicit clearance status if present
      if (typeof json.clearanceStatus === 'string') {
        clearanceStatus = json.clearanceStatus;
      }

      // Extract warnings from multiple possible paths
      if (Array.isArray(json.warnings)) {
        warnings = json.warnings.map(extractMessage);
      } else if (json.validationResults?.warningMessages) {
        warnings = json.validationResults.warningMessages.map(extractMessage);
      }

      // Extract errors from multiple possible paths
      if (Array.isArray(json.errors)) {
        errors = json.errors.map(extractMessage);
      } else if (json.validationResults?.errorMessages) {
        errors = json.validationResults.errorMessages.map(extractMessage);
      }

      // Extract clearedInvoice (base64) if present
      if (json.clearedInvoice && typeof json.clearedInvoice === 'string') {
        clearedInvoiceBase64 = json.clearedInvoice;
        try {
          clearedXml = Buffer.from(json.clearedInvoice, 'base64').toString('utf8');
        } catch {
          this.logger.warn(`Clearance for uuid=${uuid}: failed to decode clearedInvoice base64`);
        }
      }
    } catch {
      // Body is not valid JSON — fall through to status-based logic
      this.logger.warn(`Clearance for uuid=${uuid}: unparseable JSON response body`);
    }

    // Determine final status
    if (clearanceStatus === 'CLEARED' || clearedXml) {
      if (clearanceStatus && clearanceStatus !== 'CLEARED' && !clearedXml) {
        // Explicit non-CLEARED status with no cleared invoice → REJECTED
        this.logger.warn(
          `Clearance for uuid=${uuid}: status=${clearanceStatus}, no cleared invoice`,
        );
        return {
          status: 'REJECTED',
          httpStatus,
          clearedXml: null,
          clearedInvoiceBase64: null,
          warnings,
          errors,
          rawBody,
        };
      }
      return {
        status: 'CLEARED',
        httpStatus,
        clearedXml,
        clearedInvoiceBase64,
        warnings,
        errors,
        rawBody,
      };
    }

    if (clearanceStatus && clearanceStatus !== 'CLEARED') {
      // Explicit rejection status
      return {
        status: 'REJECTED',
        httpStatus,
        clearedXml: null,
        clearedInvoiceBase64: null,
        warnings,
        errors,
        rawBody,
      };
    }

    // No explicit clearanceStatus and no clearedInvoice but HTTP 200/202
    // If there are errors, treat as REJECTED; otherwise treat as CLEARED
    if (errors.length > 0) {
      return {
        status: 'REJECTED',
        httpStatus,
        clearedXml: null,
        clearedInvoiceBase64: null,
        warnings,
        errors,
        rawBody,
      };
    }

    // Treat ambiguous 200/202 without errors as CLEARED
    return {
      status: 'CLEARED',
      httpStatus,
      clearedXml,
      clearedInvoiceBase64,
      warnings,
      errors,
      rawBody,
    };
  }

  private parseErrorResponse(
    httpStatus: number,
    rawBody: string,
    _uuid: string,
  ): ZatcaClearanceResult {
    let errors: string[] = [];

    try {
      const json = JSON.parse(rawBody);
      if (Array.isArray(json.errors)) {
        errors = json.errors.map(extractMessage);
      } else if (json.validationResults?.errorMessages) {
        errors = json.validationResults.errorMessages.map(extractMessage);
      } else if (typeof json.message === 'string') {
        errors = [json.message];
      } else if (typeof json.errorMessage === 'string') {
        errors = [json.errorMessage];
      }
    } catch {
      errors = [rawBody];
    }

    return {
      status: 'REJECTED',
      httpStatus,
      clearedXml: null,
      clearedInvoiceBase64: null,
      warnings: [],
      errors,
      rawBody,
    };
  }
}

// ── Helper (duplicated from onboarding to avoid coupling) ──────────────────────

/**
 * Extract a human-readable message from a warning/error item that may be
 * a plain string or an object with a `message` property.
 */
function extractMessage(item: unknown): string {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object' && 'message' in item) {
    return String((item as { message: string }).message);
  }
  return JSON.stringify(item);
}
