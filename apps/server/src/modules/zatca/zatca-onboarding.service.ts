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
import type { ZATCAInvoiceDocumentType } from '@spicyhome/shared';
import { PrintersService } from '../printers/printers.service';

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

    const sellerName = this.printersService.getSetting('seller_name', 'SpicyHome');
    const city = this.printersService.getSetting('seller_city', 'Riyadh').toUpperCase();

    const randomHex = () => randomBytes(4).toString('hex');
    const serialNumber = `1-TST|2-TST|3-${randomHex()}-${randomHex().substring(0, 4)}-${randomHex().substring(0, 4)}-${randomHex().substring(0, 4)}-${randomHex().substring(0, 12)}`;
    const commonName = `TST-${randomHex()}-${vatNumber}`;

    const keyPair = generateKeyPair();
    const publicKeyPem = getPublicKeyPem(keyPair.publicKeyHex);

    const secret = process.env.ZATCA_SECRET || 'spicyhome-zatca-secret-change-me';
    this.invoiceService.storePrivateKey(keyPair.privateKeyHex, secret);

    this.printersService.setSetting('zatca_public_key', keyPair.publicKeyHex);

    const invoiceType = this.printersService.getSetting('zatca_invoice_type', '1100');
    const businessCategory = this.printersService.getSetting('zatca_business_category', 'Retail');

    const extensions: CsrExtensionParams = {
      zatcaEnv: 'sandbox',
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
        organizationalUnit: vatNumber,
        country: 'SA',
      },
      keyPair.publicKeyHex,
      keyPair.privateKeyHex,
      extensions,
    );

    const csrPem = toPem(csrDer, 'CERTIFICATE REQUEST');

    // Store base64 of PEM bytes (matching ERPGulf's format for compliance API)
    const csrBase64 = Buffer.from(csrPem).toString('base64');
    this.printersService.setSetting('zatca_csr_base64', csrBase64);
    this.printersService.setSetting('zatca_csr_pem', csrPem);

    this.invoiceService.setOnboardingState('csr_generated');

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
    const csrBase64 = this.printersService.getSetting('zatca_csr_base64', '');
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

    this.printersService.setSetting('zatca_compliance_cert', certBase64);
    this.printersService.setSetting('zatca_compliance_secret', secret);
    this.printersService.setSetting('zatca_compliance_request_id', result.requestID || '');
    this.invoiceService.setOnboardingState('compliance');

    this.logger.log(`Compliance CSID obtained: requestID=${result.requestID || 'unknown'}`);

    return { success: true, requestId: result.requestID || 'unknown' };
  }

  /**
   * Step 3: Exchange compliance CSID for production CSID.
   *
   * POST to ZATCA production CSID endpoint with compliance cert auth.
   */
  async onboardProduction(): Promise<{ success: boolean; requestId: string }> {
    const complianceSecret = this.printersService.getSetting('zatca_compliance_secret', '');
    const complianceCert = this.printersService.getSetting('zatca_compliance_cert', '');

    if (!complianceSecret) {
      throw new BadRequestException(
        'Compliance CSID not completed. Run compliance onboarding first.',
      );
    }

    const complianceRequestId = this.printersService.getSetting('zatca_compliance_request_id', '');
    if (!complianceRequestId) {
      throw new BadRequestException(
        'Compliance request ID not found. Run compliance onboarding first.',
      );
    }

    const baseUrl = this.getApiBaseUrl();
    const url = `${baseUrl}/production/csids`;

    const body = JSON.stringify({ compliance_request_id: complianceRequestId });

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

    this.printersService.setSetting('zatca_production_cert', certBase64);
    this.printersService.setSetting('zatca_production_secret', secret);
    this.invoiceService.setOnboardingState('production');

    this.logger.log(`Production CSID obtained: requestID=${result.requestID || 'unknown'}`);

    return { success: true, requestId: result.requestID || 'unknown' };
  }

  /**
   * Get current onboarding state.
   */
  getState(): OnboardingState {
    const state = this.invoiceService.getOnboardingState() as OnboardingState['state'];
    const publicKey = this.printersService.getSetting('zatca_public_key', '');
    const publicKeyPem = publicKey ? getPublicKeyPem(publicKey) : null;

    return {
      state,
      keyGenerated: state !== 'not_started',
      complianceDone: state === 'compliance' || state === 'production',
      productionDone: state === 'production',
      complianceCertExpiry: null, // we don't parse expiry from cert here
      productionCertExpiry: null, // we don't parse expiry from cert here
      publicKeyPem,
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
  ): Promise<{
    success: boolean;
    status: number;
    warnings: string[];
    errors: string[];
  }> {
    const state = this.invoiceService.getOnboardingState();
    if (state !== 'compliance' && state !== 'production') {
      throw new BadRequestException(
        `Compliance checks require compliance onboarding to be completed. Current state: ${state}.`,
      );
    }

    const complianceCert = this.printersService.getSetting('zatca_compliance_cert', '');
    const complianceSecret = this.printersService.getSetting('zatca_compliance_secret', '');

    if (!complianceCert || !complianceSecret) {
      throw new BadRequestException(
        'Compliance credentials not found. Run compliance onboarding first.',
      );
    }

    let invoiceHash: string;
    let uuid: string;
    let invoiceBase64: string;

    if (invoiceIdOrType !== null && typeof invoiceIdOrType === 'number') {
      // Existing invoice by ID
      const invoice = this.invoiceService.getById(invoiceIdOrType);
      if (!invoice) {
        throw new BadRequestException(`Invoice ${invoiceIdOrType} not found`);
      }
      invoiceHash = invoice.invoiceHash;
      uuid = invoice.uuid;
      invoiceBase64 = Buffer.from(invoice.xml).toString('base64');

      this.logger.log(
        `Compliance check POST invoiceId=${invoiceIdOrType} hash=${invoiceHash?.slice(0, 20)}...`,
      );
    } else if (documentType) {
      // Dynamically generate invoice for the given document type
      const generated = await this.invoiceService.buildComplianceInvoice(documentType);
      invoiceHash = generated.invoiceHash;
      uuid = generated.uuid;
      invoiceBase64 = Buffer.from(generated.signedXml).toString('base64');

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
      return { success: true, status: 200, warnings: [], errors: [] };
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
      return { success: true, status: 202, warnings, errors: [] };
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

    return { success: false, status: response.status, warnings: [], errors };
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

function extractMessage(item: unknown): string {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object' && 'message' in item) {
    return String((item as { message: string }).message);
  }
  return JSON.stringify(item);
}
