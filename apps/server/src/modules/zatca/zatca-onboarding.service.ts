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

import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common';
import { DRIZZLE } from '../database/database.module';
import { ZatcaInvoiceService } from './zatca-invoice.service';
import { ZatcaHttpService, ZatcaHttpClient } from './zatca-http.service';
import {
  generateKeyPair,
  buildCSR,
  toPem,
  getPublicKeyPem,
  encryptAtRest,
  hexToBytes,
} from './zatca-crypto.service';
import { PrintersService } from '../printers/printers.service';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '@spicyhome/db';

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
    const orgUnit = this.printersService.getSetting('zatca_org_unit', 'SpicyHome POS');
    const orgIdentifier = `VAT-SA-${vatNumber}`;

    // Generate keypair
    const keyPair = generateKeyPair();
    const publicKeyPem = getPublicKeyPem(keyPair.publicKeyHex);

    // Encrypt and store private key
    const secret = process.env.ZATCA_SECRET || 'spicyhome-zatca-secret-change-me';
    this.invoiceService.storePrivateKey(keyPair.privateKeyHex, secret);

    // Store public key
    this.printersService.setSetting('zatca_public_key', keyPair.publicKeyHex);

    // Build CSR
    const csrDer = buildCSR(
      {
        commonName: vatNumber,
        organizationName: sellerName,
        organizationalUnit: orgUnit,
        country: 'SA',
        organizationIdentifier: orgIdentifier,
      },
      keyPair.publicKeyHex,
      keyPair.privateKeyHex,
    );

    const csrPem = toPem(csrDer, 'CERTIFICATE REQUEST');

    // Update state
    this.invoiceService.setOnboardingState('csr_generated');

    // Store CSR for reference
    this.printersService.setSetting('zatca_csr', csrPem);

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
    const csrPem = this.printersService.getSetting('zatca_csr', '');
    if (!csrPem) {
      throw new BadRequestException('CSR not generated. Run CSR generation first.');
    }

    const baseUrl = this.getApiBaseUrl();
    const url = `${baseUrl}/compliance`;

    // Strip PEM header/footer and newlines to get base64 DER
    const csrBase64 = csrPem
      .replace(/-----BEGIN CERTIFICATE REQUEST-----/, '')
      .replace(/-----END CERTIFICATE REQUEST-----/, '')
      .replace(/\s/g, '');

    const body = JSON.stringify({ csr: csrBase64 });

    const response = await this.httpClient.post(url, {
      body,
      headers: {
        OTP: otp,
        'Accept-Version': 'V2',
      },
      timeoutMs: 30000,
    });

    if (response.status !== 200) {
      this.logger.error(`Compliance onboarding failed: ${response.status} — ${response.body}`);
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

    const csrPem = this.printersService.getSetting('zatca_csr', '');
    const csrBase64 = csrPem
      .replace(/-----BEGIN CERTIFICATE REQUEST-----/, '')
      .replace(/-----END CERTIFICATE REQUEST-----/, '')
      .replace(/\s/g, '');

    const baseUrl = this.getApiBaseUrl();
    const url = `${baseUrl}/production/csids`;

    const body = JSON.stringify({ compliance_request_id: csrBase64 });

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
      this.logger.error(`Production onboarding failed: ${response.status} — ${response.body}`);
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
   * Return the ZATCA API base URL.
   *
   * Can be overridden via `zatca_api_base_url` setting for simulation.
   * Defaults to the ZATCA Fatoora Developer Portal.
   */
  private getApiBaseUrl(): string {
    return this.printersService.getSetting(
      'zatca_api_base_url',
      'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal',
    );
  }
}
