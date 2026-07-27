/**
 * ZATCA Onboarding Service — CSR generation, compliance CSID, production CSID.
 *
 * Flow (simplified B2C):
 *   1. POST /zatca/onboard/csr — generate keypair + CSR, store encrypted private key,
 *      return CSR PEM.
 *   2. POST /zatca/onboard/compliance { otp } — POST CSR + OTP to ZATCA
 *      compliance CSID endpoint, store compliance cert + secret.
 *   3. POST /zatca/onboard/production — exchange compliance CSID for production
 *      CSID, store production cert + secret.
 *
 * Onboarding state machine:
 *   not_started → csr_generated → compliance → production
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { ZatcaInvoiceService } from './zatca-invoice.service';
import { ZatcaHttpService } from './zatca-http.service';
import { generateKeyPair, buildCSR, toPem, getPublicKeyPem } from './zatca-crypto.service';
import type { CsrExtensionParams } from './zatca-crypto.service';
import { zatcaKey, slugifyOrgUnit } from '@spicyhome/shared';
import type { ZATCAEnvironment, ZATCAInvoiceDocumentType } from '@spicyhome/shared';
import { PrintersService } from '../printers/printers.service';

// ── Compliance Request ID helpers ────────────────────────────────────────────

/**
 * Normalize a compliance request ID for use in ZATCA API calls.
 *
 * Compliance request IDs must be exactly 13 digits (ZATCA requirement).
 * This handles the edge case where `JSON.parse` returns a number that gets
 * stringified as e.g. `"1234567890123.0"` through SQLite persistence.
 *
 * @throws Error if the value cannot be normalized to a 13-digit string.
 */
export function normalizeComplianceRequestId(raw: unknown): string {
  let str: string;

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // 13-digit IDs are within Number.MAX_SAFE_INTEGER (9,007,199,254,740,991).
    // Use Math.trunc so that a float like 1234567890123.7 never passes.
    str = String(Math.trunc(raw));
  } else if (typeof raw === 'string') {
    str = raw.trim();
  } else if (raw === null || raw === undefined) {
    throw new Error('Compliance request ID is required but received null/undefined.');
  } else {
    throw new Error(
      `Compliance request ID must be a number or string, received type "${typeof raw}".`,
    );
  }

  // Strip a ".0" suffix that arises from float coercion
  // (e.g. "1234567890123.0" → "1234567890123").
  if (/^\d+\.0+$/.test(str)) {
    str = str.replace(/\.0+$/, '');
  }

  // ZATCA requires exactly 13 digits.
  if (!/^\d{13}$/.test(str)) {
    throw new Error(`Compliance request ID must be exactly 13 digits, got "${str}".`);
  }

  return str;
}

/**
 * Soft-coerce a request ID to a clean string for display / return values.
 *
 * Strips a trailing `.0` suffix (float representation) but does **not**
 * enforce any length constraint — production CSIDs may have a different
 * format than the 13-digit compliance ID.
 */
export function formatRequestId(raw: unknown): string {
  if (raw === null || raw === undefined) {
    return 'unknown';
  }

  let str: string;

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    str = String(Math.trunc(raw));
  } else if (typeof raw === 'string') {
    str = raw.trim();
  } else {
    return 'unknown';
  }

  // Strip .0 suffix from float coercion.
  if (/^\d+\.0+$/.test(str)) {
    str = str.replace(/\.0+$/, '');
  }

  return str || 'unknown';
}

export interface ComplianceResultEntry {
  /** 'invoice' | 'credit_note' | 'debit_note' or `invoice_<id>` for real invoices */
  key: string;
  success: boolean;
  status: number;
  warnings: string[];
  errors: string[];
  /** Unix epoch seconds when the check was run */
  checkedAt: number;
}

export interface OnboardingState {
  state: 'not_started' | 'csr_generated' | 'compliance' | 'production';
  /** Whether a keypair has been generated */
  keyGenerated: boolean;
  /** Whether compliance onboarding is done */
  complianceDone: boolean;
  /** Whether production onboarding is done */
  productionDone: boolean;
  /** Compliance cert expiry (Unix epoch seconds, if known) */
  complianceCertExpiry: number | null;
  /** Production cert expiry (Unix epoch seconds, if known) */
  productionCertExpiry: number | null;
  /** Public key PEM */
  publicKeyPem: string | null;
  /** Stored compliance check results (persisted across page refreshes) */
  complianceResults: ComplianceResultEntry[];
}

@Injectable()
export class ZatcaOnboardingService {
  private readonly logger = new Logger(ZatcaOnboardingService.name);

  constructor(
    private invoiceService: ZatcaInvoiceService,
    private httpClient: ZatcaHttpService,
    private printersService: PrintersService,
  ) {}

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Step 1: Generate keypair and return a CSR PEM.
   *
   * The private key is encrypted with ZATCA_SECRET and stored in settings.
   * The public key is stored as hex.
   */
  async generateCSR(): Promise<{ csr: string; publicKeyPem: string }> {
    const vatNumber = this.printersService.getSetting('vat_number', '');
    if (!vatNumber) {
      throw new BadRequestException('VAT number not configured. Set vat_number in settings first.');
    }

    const orgUnit = this.printersService.getSetting('zatca_org_unit', '');
    if (!orgUnit) {
      throw new BadRequestException(
        'Org Unit not configured. Set Org Unit in ZATCA settings first.',
      );
    }

    const sellerName = this.printersService.getSetting('seller_name', 'SpicyHome');
    const city = this.printersService.getSetting('seller_city', 'Riyadh').toUpperCase();

    const randomHex = () => randomBytes(4).toString('hex');
    const serialNumber = `1-TST|2-TST|3-${randomHex()}-${randomHex().substring(0, 4)}-${randomHex().substring(0, 4)}-${randomHex().substring(0, 4)}-${randomHex().substring(0, 12)}`;
    const commonName = `TST-${randomHex()}-${vatNumber}`;

    const keyPair = generateKeyPair();
    const publicKeyPem = getPublicKeyPem(keyPair.publicKeyHex);

    const invoiceType = this.printersService.getSetting('zatca_invoice_type', '1100');
    const businessCategory = this.printersService.getSetting('zatca_business_category', 'Retail');
    const env = this.printersService.getSetting(
      'zatca_environment',
      'simulation',
    ) as ZATCAEnvironment;

    const secret = process.env.ZATCA_SECRET || 'spicyhome-zatca-secret-change-me';
    this.invoiceService.storePrivateKey(keyPair.privateKeyHex, secret, env, orgUnit);

    this.printersService.setSetting(zatcaKey(env, orgUnit, 'public_key'), keyPair.publicKeyHex);

    const extensions: CsrExtensionParams = {
      zatcaEnv: env,
      serialNumber,
      vatNumber,
      invoiceType,
      locationAddress: city,
      businessCategory,
    };

    const csrDer = buildCSR(
      {
        commonName,
        organizationName: sellerName,
        organizationalUnit: orgUnit,
        country: 'SA',
      },
      keyPair.publicKeyHex,
      keyPair.privateKeyHex,
      extensions,
    );

    const csrPem = toPem(csrDer, 'CERTIFICATE REQUEST');

    // Store base64 of PEM bytes (matching ERPGulf's format for compliance API)
    const csrBase64 = Buffer.from(csrPem).toString('base64');
    this.printersService.setSetting(zatcaKey(env, orgUnit, 'csr_base64'), csrBase64);
    this.printersService.setSetting(zatcaKey(env, orgUnit, 'csr_pem'), csrPem);

    this.invoiceService.setOnboardingState('csr_generated', env, orgUnit);

    return { csr: csrPem, publicKeyPem };
  }

  /**
   * Step 2: Submit CSR with OTP to ZATCA compliance endpoint.
   *
   * POST to ZATCA compliance CSID API:
   *   Body:  { csr: "<CSR base64>" }
   *   Headers: OTP: <otp>, Accept-Version: V2
   *
   * On success, receives:
   *   { binarySecurityToken, secret, requestID, ... }
   */
  async onboardCompliance(otp: string): Promise<{ success: boolean; requestId: string }> {
    const env = this.printersService.getSetting(
      'zatca_environment',
      'simulation',
    ) as ZATCAEnvironment;
    const orgUnit = this.printersService.getSetting('zatca_org_unit', '');

    if (!slugifyOrgUnit(orgUnit)) {
      throw new BadRequestException(
        'Org Unit not configured. Set Org Unit in ZATCA settings first.',
      );
    }

    const csrBase64 = this.printersService.getSetting(zatcaKey(env, orgUnit, 'csr_base64'), '');
    if (!csrBase64) {
      throw new BadRequestException('CSR not generated. Run CSR generation first.');
    }

    const baseUrl = this.getApiBaseUrl();
    const url = `${baseUrl}/compliance`;

    const body = JSON.stringify({ csr: csrBase64 });

    this.logger.log(
      `Compliance POST ${url} csrBase64Len=${csrBase64.length} headers=${JSON.stringify({ OTP: otp, 'Accept-Version': 'V2' })}`,
    );

    const response = await this.httpClient.post(url, {
      body,
      headers: {
        OTP: otp,
        'Accept-Version': 'V2',
      },
      timeoutMs: 30000,
    });

    if (response.status !== 200) {
      this.logger.error(
        `Compliance onboarding failed: ${response.status}, headers=${JSON.stringify(response.headers)}, body=${response.body}`,
      );
      throw new Error(`ZATCA compliance onboarding failed (${response.status}): ${response.body}`);
    }

    const result = JSON.parse(response.body);

    // Store compliance credentials
    const certBase64 = result.binarySecurityToken || '';
    const secret = result.secret || '';

    if (!certBase64 || !secret) {
      throw new Error(`ZATCA compliance response missing certificate or secret: ${response.body}`);
    }

    const requestId = normalizeComplianceRequestId(result.requestID);

    this.printersService.setSetting(zatcaKey(env, orgUnit, 'compliance_cert'), certBase64);
    this.printersService.setSetting(zatcaKey(env, orgUnit, 'compliance_secret'), secret);
    this.printersService.setSetting(zatcaKey(env, orgUnit, 'compliance_request_id'), requestId);
    this.invoiceService.setOnboardingState('compliance', env, orgUnit);

    this.logger.log(`Compliance CSID obtained: requestID=${requestId}`);

    return { success: true, requestId };
  }

  /**
   * Step 3: Exchange compliance CSID for production CSID.
   *
   * POST to ZATCA production CSID endpoint with compliance cert auth.
   */
  async onboardProduction(): Promise<{ success: boolean; requestId: string }> {
    const env = this.printersService.getSetting(
      'zatca_environment',
      'simulation',
    ) as ZATCAEnvironment;
    const orgUnit = this.printersService.getSetting('zatca_org_unit', '');

    if (!slugifyOrgUnit(orgUnit)) {
      throw new BadRequestException(
        'Org Unit not configured. Set Org Unit in ZATCA settings first.',
      );
    }

    const complianceSecret = this.printersService.getSetting(
      zatcaKey(env, orgUnit, 'compliance_secret'),
      '',
    );
    const complianceCert = this.printersService.getSetting(
      zatcaKey(env, orgUnit, 'compliance_cert'),
      '',
    );

    if (!complianceSecret) {
      throw new BadRequestException(
        'Compliance CSID not completed. Run compliance onboarding first.',
      );
    }

    const complianceRequestIdRaw = this.printersService.getSetting(
      zatcaKey(env, orgUnit, 'compliance_request_id'),
      '',
    );
    if (!complianceRequestIdRaw) {
      throw new BadRequestException(
        'Compliance request ID not found. Run compliance onboarding first.',
      );
    }

    const complianceRequestId = normalizeComplianceRequestId(complianceRequestIdRaw);

    const baseUrl = this.getApiBaseUrl();
    const url = `${baseUrl}/production/csids`;

    // Send as a JSON number — ZATCA validates digit count on a numeric id and
    // a 13-digit number is well within Number.MAX_SAFE_INTEGER.
    const body = JSON.stringify({ compliance_request_id: Number(complianceRequestId) });

    this.logger.log(
      `Production POST ${url} requestId=${complianceRequestId} certLen=${complianceCert.length} secret=***`,
    );

    const response = await this.httpClient.post(url, {
      body,
      headers: {
        'Accept-Version': 'V2',
      },
      auth: {
        username: complianceCert,
        password: complianceSecret,
      },
      timeoutMs: 30000,
    });

    if (response.status !== 200) {
      this.logger.error(
        `Production onboarding failed: ${response.status}, headers=${JSON.stringify(response.headers)}, body=${response.body}`,
      );
      throw new Error(
        `ZATCA production CSID onboarding failed (${response.status}): ${response.body}`,
      );
    }

    const result = JSON.parse(response.body);

    const certBase64 = result.binarySecurityToken || '';
    const secret = result.secret || '';

    if (!certBase64 || !secret) {
      throw new Error(`ZATCA production response missing certificate or secret: ${response.body}`);
    }

    this.printersService.setSetting(zatcaKey(env, orgUnit, 'production_cert'), certBase64);
    this.printersService.setSetting(zatcaKey(env, orgUnit, 'production_secret'), secret);
    this.invoiceService.setOnboardingState('production', env, orgUnit);

    this.logger.log(`Production CSID obtained: requestID=${formatRequestId(result.requestID)}`);

    return { success: true, requestId: formatRequestId(result.requestID) };
  }

  /**
   * Get current onboarding state.
   */
  getState(): OnboardingState {
    const orgUnit = this.printersService.getSetting('zatca_org_unit', '');

    // Return safe default if org unit is missing or would slugify to empty
    // (e.g. whitespace-only or Arabic-only). This prevents zatcaKey from
    // throwing on GET /zatca/status before the admin has configured an OU.
    if (!slugifyOrgUnit(orgUnit)) {
      return {
        state: 'not_started',
        keyGenerated: false,
        complianceDone: false,
        productionDone: false,
        complianceCertExpiry: null,
        productionCertExpiry: null,
        publicKeyPem: null,
        complianceResults: [],
      };
    }

    const env = this.printersService.getSetting(
      'zatca_environment',
      'simulation',
    ) as ZATCAEnvironment;
    const state = this.invoiceService.getOnboardingState(env, orgUnit) as OnboardingState['state'];
    const publicKey = this.printersService.getSetting(zatcaKey(env, orgUnit, 'public_key'), '');
    const publicKeyPem = publicKey ? getPublicKeyPem(publicKey) : null;

    const complianceResultsJson = this.printersService.getSetting(
      zatcaKey(env, orgUnit, 'compliance_results'),
      '[]',
    );
    let complianceResults: ComplianceResultEntry[];
    try {
      complianceResults = JSON.parse(complianceResultsJson);
    } catch {
      complianceResults = [];
    }

    return {
      state,
      keyGenerated: state !== 'not_started',
      complianceDone: state === 'compliance' || state === 'production',
      productionDone: state === 'production',
      complianceCertExpiry: null,
      productionCertExpiry: null,
      publicKeyPem,
      complianceResults,
    };
  }

  /**
   * Compliance check: submit a signed invoice to ZATCA's compliance/invoices endpoint.
   *
   * Validates the invoice XML structure, business rules, QR code, and
   * cryptographic stamp. This must be completed before ZATCA will issue
   * a production CSID (though the sandbox may not enforce it strictly).
   *
   * Does NOT change the onboarding state — compliance checks can be run
   * multiple times for different invoices.
   */
  async runComplianceCheck(
    invoiceIdOrType: number | null,
    documentType?: ZATCAInvoiceDocumentType,
    debug = false,
  ): Promise<{
    success: boolean;
    status: number;
    warnings: string[];
    errors: string[];
    debug?: any;
  }> {
    const env = this.printersService.getSetting(
      'zatca_environment',
      'simulation',
    ) as ZATCAEnvironment;
    const orgUnit = this.printersService.getSetting('zatca_org_unit', '');

    if (!slugifyOrgUnit(orgUnit)) {
      throw new BadRequestException(
        'Org Unit not configured. Set Org Unit in ZATCA settings first.',
      );
    }

    const state = this.invoiceService.getOnboardingState(env, orgUnit);
    if (state !== 'compliance' && state !== 'production') {
      throw new BadRequestException(
        `Compliance checks require compliance onboarding to be completed. Current state: ${state}.`,
      );
    }

    const complianceCert = this.printersService.getSetting(
      zatcaKey(env, orgUnit, 'compliance_cert'),
      '',
    );
    const complianceSecret = this.printersService.getSetting(
      zatcaKey(env, orgUnit, 'compliance_secret'),
      '',
    );

    if (!complianceCert || !complianceSecret) {
      throw new BadRequestException(
        'Compliance credentials not found. Run compliance onboarding first.',
      );
    }

    let invoiceHash: string;
    let uuid: string;
    let invoiceBase64: string;
    let debugData: any = undefined;
    let resultKey: string;

    if (invoiceIdOrType !== null && typeof invoiceIdOrType === 'number') {
      // Existing invoice by ID
      const invoice = this.invoiceService.getById(invoiceIdOrType);
      if (!invoice) {
        throw new BadRequestException(`Invoice ${invoiceIdOrType} not found`);
      }
      invoiceHash = invoice.invoiceHash;
      uuid = invoice.uuid;
      invoiceBase64 = Buffer.from(invoice.xml).toString('base64');
      resultKey = `invoice_${invoiceIdOrType}`;

      this.logger.log(
        `Compliance check POST invoiceId=${invoiceIdOrType} hash=${invoiceHash?.slice(0, 20)}...`,
      );
    } else if (documentType) {
      // Dynamically generate invoice for the given document type
      const generated = await this.invoiceService.buildComplianceInvoice(documentType);
      invoiceHash = generated.invoiceHash;
      uuid = generated.uuid;
      invoiceBase64 = Buffer.from(generated.signedXml).toString('base64');
      resultKey = documentType;

      if (debug) {
        debugData = {
          signedXml: generated.signedXml,
          invoiceHash,
          uuid,
        };
      }

      this.logger.log(
        `Compliance check POST type=${documentType} hash=${invoiceHash?.slice(0, 20)}...`,
      );
    } else {
      throw new BadRequestException('Either invoiceId or documentType is required');
    }

    const body = JSON.stringify({
      invoiceHash,
      uuid,
      invoice: invoiceBase64,
    });

    const baseUrl = this.getApiBaseUrl();
    const url = `${baseUrl}/compliance/invoices`;

    this.logger.log(
      `Compliance check POST ${url} hash=${invoiceHash?.slice(0, 20)}... uuid=${uuid} invoiceB64Len=${invoiceBase64.length} bodyLen=${body.length}`,
    );

    const response = await this.httpClient.post(url, {
      body,
      headers: {
        'Accept-Version': 'V2',
        'Accept-Language': 'en',
      },
      auth: {
        username: complianceCert,
        password: complianceSecret,
      },
      timeoutMs: 30000,
    });

    if (response.status === 200) {
      const result = {
        success: true,
        status: 200,
        warnings: [] as string[],
        errors: [] as string[],
        ...(debug ? { debug: debugData } : {}),
      };
      this.persistComplianceResult(env, orgUnit, resultKey, result);
      return result;
    }

    if (response.status === 202) {
      let warnings: string[] = [];
      try {
        const result = JSON.parse(response.body);
        if (result.warnings && Array.isArray(result.warnings)) {
          warnings = result.warnings.map(extractMessage);
        } else if (result.validationResults?.warningMessages) {
          warnings = result.validationResults.warningMessages.map(extractMessage);
        }
      } catch {
        // Response body may not be parseable JSON
      }
      const result = {
        success: true,
        status: 202,
        warnings,
        errors: [] as string[],
        ...(debug ? { debug: debugData } : {}),
      };
      this.persistComplianceResult(env, orgUnit, resultKey, result);
      return result;
    }

    if (response.status === 406 && isSubmittedBefore(response.body)) {
      this.logger.log(`Compliance check already submitted for ${resultKey}: treating as success`);
      const result = {
        success: true,
        status: 200,
        warnings: [] as string[],
        errors: [] as string[],
        ...(debug ? { debug: debugData } : {}),
      };
      this.persistComplianceResult(env, orgUnit, resultKey, result);
      return result;
    }

    let errors: string[] = [];
    try {
      const result = JSON.parse(response.body);
      if (result.errors && Array.isArray(result.errors)) {
        errors = result.errors.map(extractMessage);
      } else if (result.validationResults?.errorMessages) {
        errors = result.validationResults.errorMessages.map(extractMessage);
      } else if (result.message) {
        errors = [result.message];
      } else if (result.errorMessage) {
        errors = [result.errorMessage];
      }
    } catch {
      errors = [response.body];
    }

    this.logger.error(`Compliance check failed: ${response.status}, body=${response.body}`);

    const result = {
      success: false,
      status: response.status,
      warnings: [] as string[],
      errors,
      ...(debug ? { debug: debugData } : {}),
    };
    this.persistComplianceResult(env, orgUnit, resultKey, result);
    return result;
  }

  /**
   * Persist a compliance check result to the settings table.
   *
   * Results are stored as a JSON array under the `zatca_compliance_results` key.
   * Each entry is keyed by document type ('invoice', 'credit_note', 'debit_note')
   * or by `invoice_<id>` for real invoice checks. Re-running a check for the
   * same key overwrites the previous entry.
   */
  private persistComplianceResult(
    env: ZATCAEnvironment,
    orgUnit: string,
    key: string,
    result: { success: boolean; status: number; warnings: string[]; errors: string[] },
  ): void {
    const json = this.printersService.getSetting(
      zatcaKey(env, orgUnit, 'compliance_results'),
      '[]',
    );
    let entries: ComplianceResultEntry[];
    try {
      entries = JSON.parse(json);
    } catch {
      entries = [];
    }

    const entry: ComplianceResultEntry = {
      key,
      success: result.success,
      status: result.status,
      warnings: result.warnings,
      errors: result.errors,
      checkedAt: Math.floor(Date.now() / 1000),
    };

    const idx = entries.findIndex((e) => e.key === key);
    if (idx >= 0) {
      entries[idx] = entry;
    } else {
      entries.push(entry);
    }

    this.printersService.setSetting(
      zatcaKey(env, orgUnit, 'compliance_results'),
      JSON.stringify(entries),
    );
  }

  /**
   * Return the ZATCA API base URL.
   *
   * Can be overridden via `zatca_api_base_url` setting for simulation.
   * Defaults to the ZATCA Fatoora Developer Portal.
   */
  private getApiBaseUrl(): string {
    return this.printersService.getSetting(
      'zatca_api_base_url',
      'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation',
    );
  }
}

/**
 * Returns true if the 406 response body indicates a duplicate compliance
 * submission — i.e. any error entry has `code === 'Submitted before'`.
 */
function isSubmittedBefore(body: string): boolean {
  try {
    const parsed = JSON.parse(body);
    const errors = parsed?.validationResults?.errorMessages;
    if (!Array.isArray(errors)) return false;
    return errors.some(
      (e: unknown) =>
        e && typeof e === 'object' && (e as Record<string, unknown>).code === 'Submitted before',
    );
  } catch {
    return false;
  }
}

function extractMessage(item: unknown): string {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object' && 'message' in item) {
    return String((item as { message: string }).message);
  }
  return JSON.stringify(item);
}
