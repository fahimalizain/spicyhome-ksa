import { ZatcaOnboardingService } from './zatca-onboarding.service';
import type { ComplianceResultEntry } from './zatca-onboarding.service';

type MockPrintersService = ReturnType<typeof createMockPrintersService>;
type MockInvoiceService = ReturnType<typeof createMockInvoiceService>;
type MockHttpClient = ReturnType<typeof createMockHttpClient>;

function createSettingsStore() {
  return new Map<string, string>();
}

function createMockPrintersService(store: Map<string, string>) {
  return {
    getSetting: jest.fn((key: string, defaultValue = '') => {
      return store.has(key) ? store.get(key)! : defaultValue;
    }),
    setSetting: jest.fn((key: string, value: string) => {
      store.set(key, value);
    }),
  };
}

function createMockInvoiceService() {
  return {
    getOnboardingState: jest.fn().mockReturnValue('not_started'),
    getById: jest.fn(),
    buildComplianceInvoice: jest.fn(),
    setOnboardingState: jest.fn(),
    storePrivateKey: jest.fn(),
  };
}

function createMockHttpClient() {
  return {
    post: jest.fn(),
    get: jest.fn(),
  };
}

function setupComplianceState(invoiceService: MockInvoiceService, store: Map<string, string>) {
  invoiceService.getOnboardingState.mockReturnValue('compliance');
  store.set('zatca_simulation_compliance_cert', 'fake-compliance-cert');
  store.set('zatca_simulation_compliance_secret', 'fake-compliance-secret');
  invoiceService.buildComplianceInvoice.mockResolvedValue({
    signedXml:
      '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><cbc:ID>1</cbc:ID></Invoice>',
    invoiceHash: 'dGVzdEludm9pY2VIYXNoQmFzZTY0PT0=',
    uuid: '00000000-0000-0000-0000-000000000001',
  });
}

function mockComplianceHttpSuccess(httpClient: MockHttpClient) {
  httpClient.post.mockResolvedValue({
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
}

function parseComplianceResults(store: Map<string, string>): ComplianceResultEntry[] {
  const json = store.get('zatca_simulation_compliance_results') ?? '[]';
  return JSON.parse(json);
}

function setupCsrSettings(store: Map<string, string>) {
  store.set('vat_number', '300123456789003');
  store.set('seller_name', 'SpicyHome Restaurant');
  store.set('seller_city', 'Riyadh');
  store.set('zatca_invoice_type', '1100');
  store.set('zatca_business_category', 'Retail');
}

// ── getState: complianceResults loading ─────────────────────────────────────

describe('getState', () => {
  let store: Map<string, string>;
  let service: ZatcaOnboardingService;

  beforeEach(() => {
    store = createSettingsStore();
    const printersService = createMockPrintersService(store);
    const invoiceService = createMockInvoiceService();
    const httpClient = createMockHttpClient();
    service = new ZatcaOnboardingService(
      invoiceService as any,
      httpClient as any,
      printersService as any,
    );
  });

  describe('complianceResults', () => {
    it('returns empty array when no compliance results are stored', () => {
      const state = service.getState();

      expect(state.complianceResults).toEqual([]);
    });

    it('returns stored compliance results', () => {
      store.set(
        'zatca_simulation_compliance_results',
        JSON.stringify([
          {
            key: 'invoice',
            success: true,
            status: 200,
            warnings: [],
            errors: [],
            checkedAt: 1712345678,
          },
          {
            key: 'credit_note',
            success: false,
            status: 400,
            warnings: [],
            errors: ['Bad request'],
            checkedAt: 1712345679,
          },
        ]),
      );

      const state = service.getState();

      expect(state.complianceResults).toHaveLength(2);
      expect(state.complianceResults[0]).toMatchObject({
        key: 'invoice',
        success: true,
        status: 200,
      });
      expect(state.complianceResults[1]).toMatchObject({
        key: 'credit_note',
        success: false,
        status: 400,
        errors: ['Bad request'],
      });
    });

    it('returns empty array for corrupted JSON', () => {
      store.set('zatca_simulation_compliance_results', '{corrupted-json!!!');

      const state = service.getState();

      expect(state.complianceResults).toEqual([]);
    });

    it('preserves full OnboardingState shape alongside complianceResults', () => {
      store.set(
        'zatca_simulation_compliance_results',
        JSON.stringify([
          {
            key: 'debit_note',
            success: true,
            status: 202,
            warnings: ['Minor warning'],
            errors: [],
            checkedAt: 1712345680,
          },
        ]),
      );

      const state = service.getState();

      expect(state.state).toBe('not_started');
      expect(state.keyGenerated).toBe(false);
      expect(state.complianceDone).toBe(false);
      expect(state.productionDone).toBe(false);
      expect(state.complianceCertExpiry).toBeNull();
      expect(state.productionCertExpiry).toBeNull();
      expect(state.publicKeyPem).toBeNull();
      expect(state.complianceResults).toHaveLength(1);
      expect(state.complianceResults[0].key).toBe('debit_note');
    });
  });
});

// ── runComplianceCheck: persistComplianceResult integration ────────────────

describe('runComplianceCheck → persistComplianceResult', () => {
  let store: Map<string, string>;
  let printersService: MockPrintersService;
  let invoiceService: MockInvoiceService;
  let httpClient: MockHttpClient;
  let service: ZatcaOnboardingService;

  beforeEach(() => {
    store = createSettingsStore();
    printersService = createMockPrintersService(store);
    invoiceService = createMockInvoiceService();
    httpClient = createMockHttpClient();
    service = new ZatcaOnboardingService(
      invoiceService as any,
      httpClient as any,
      printersService as any,
    );
  });

  it('adds a new entry when no previous compliance results exist', async () => {
    setupComplianceState(invoiceService, store);
    mockComplianceHttpSuccess(httpClient);

    await service.runComplianceCheck(null, 'invoice');

    const entries = parseComplianceResults(store);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      key: 'invoice',
      success: true,
      status: 200,
      warnings: [],
      errors: [],
    });
    expect(entries[0].checkedAt).toBeGreaterThan(0);
  });

  it('overwrites an existing entry with the same key (upsert)', async () => {
    setupComplianceState(invoiceService, store);
    mockComplianceHttpSuccess(httpClient);

    store.set(
      'zatca_simulation_compliance_results',
      JSON.stringify([
        {
          key: 'invoice',
          success: true,
          status: 200,
          warnings: ['old warning'],
          errors: [],
          checkedAt: 1000000,
        },
      ]),
    );

    await service.runComplianceCheck(null, 'invoice');

    const entries = parseComplianceResults(store);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      key: 'invoice',
      success: true,
      status: 200,
      warnings: [],
      errors: [],
    });
    expect(entries[0].checkedAt).not.toBe(1000000);
  });

  it('preserves other keys when overwriting one entry', async () => {
    setupComplianceState(invoiceService, store);
    mockComplianceHttpSuccess(httpClient);

    store.set(
      'zatca_simulation_compliance_results',
      JSON.stringify([
        {
          key: 'invoice',
          success: true,
          status: 200,
          warnings: [],
          errors: [],
          checkedAt: 1000000,
        },
        {
          key: 'credit_note',
          success: false,
          status: 400,
          warnings: [],
          errors: ['Bad request'],
          checkedAt: 2000000,
        },
      ]),
    );

    await service.runComplianceCheck(null, 'invoice');

    const entries = parseComplianceResults(store);
    expect(entries).toHaveLength(2);
    const invoiceEntry = entries.find((e) => e.key === 'invoice');
    expect(invoiceEntry).toBeTruthy();
    expect(invoiceEntry!.checkedAt).not.toBe(1000000);

    const creditNoteEntry = entries.find((e) => e.key === 'credit_note');
    expect(creditNoteEntry).toBeTruthy();
    expect(creditNoteEntry!.checkedAt).toBe(2000000);
  });

  it('adds a second entry for a different key', async () => {
    setupComplianceState(invoiceService, store);
    mockComplianceHttpSuccess(httpClient);

    store.set(
      'zatca_simulation_compliance_results',
      JSON.stringify([
        {
          key: 'invoice',
          success: true,
          status: 200,
          warnings: [],
          errors: [],
          checkedAt: 1000000,
        },
      ]),
    );

    await service.runComplianceCheck(null, 'credit_note');

    const entries = parseComplianceResults(store);
    expect(entries).toHaveLength(2);

    const keys = entries.map((e) => e.key).sort();
    expect(keys).toEqual(['credit_note', 'invoice']);
  });

  it('handles corrupted JSON gracefully and still persists the new entry', async () => {
    setupComplianceState(invoiceService, store);
    mockComplianceHttpSuccess(httpClient);

    store.set('zatca_simulation_compliance_results', '{corrupted-json');

    await service.runComplianceCheck(null, 'invoice');

    const entries = parseComplianceResults(store);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      key: 'invoice',
      success: true,
      status: 200,
    });
  });
});

// ── runComplianceCheck: success and failure scenarios ──────────────────────

describe('runComplianceCheck response and persistence', () => {
  let store: Map<string, string>;
  let invoiceService: MockInvoiceService;
  let httpClient: MockHttpClient;
  let service: ZatcaOnboardingService;

  beforeEach(() => {
    store = createSettingsStore();
    const printersService = createMockPrintersService(store);
    invoiceService = createMockInvoiceService();
    httpClient = createMockHttpClient();
    service = new ZatcaOnboardingService(
      invoiceService as any,
      httpClient as any,
      printersService as any,
    );
  });

  it('stores result with success=true on HTTP 200', async () => {
    setupComplianceState(invoiceService, store);
    mockComplianceHttpSuccess(httpClient);

    const result = await service.runComplianceCheck(null, 'invoice');

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);

    const entries = parseComplianceResults(store);
    expect(entries).toHaveLength(1);
    expect(entries[0].success).toBe(true);
    expect(entries[0].status).toBe(200);
    expect(entries[0].key).toBe('invoice');
  });

  it('stores result with success=true and warnings on HTTP 202', async () => {
    setupComplianceState(invoiceService, store);

    httpClient.post.mockResolvedValue({
      status: 202,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        warnings: [
          { message: 'QR code timestamp mismatch' },
          { message: 'Minor schema deviation' },
        ],
      }),
    });

    const result = await service.runComplianceCheck(null, 'invoice');

    expect(result.success).toBe(true);
    expect(result.status).toBe(202);
    expect(result.warnings).toEqual(['QR code timestamp mismatch', 'Minor schema deviation']);
    expect(result.errors).toEqual([]);

    const entries = parseComplianceResults(store);
    expect(entries).toHaveLength(1);
    expect(entries[0].success).toBe(true);
    expect(entries[0].status).toBe(202);
    expect(entries[0].warnings).toEqual(['QR code timestamp mismatch', 'Minor schema deviation']);
  });

  it('stores result with success=false on HTTP 400 with structured errors', async () => {
    setupComplianceState(invoiceService, store);

    httpClient.post.mockResolvedValue({
      status: 400,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        errors: [
          { message: 'Invalid invoice XML structure' },
          { message: 'Missing required field: ProfileID' },
        ],
      }),
    });

    const result = await service.runComplianceCheck(null, 'invoice');

    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
    expect(result.warnings).toEqual([]);
    expect(result.errors).toEqual([
      'Invalid invoice XML structure',
      'Missing required field: ProfileID',
    ]);

    const entries = parseComplianceResults(store);
    expect(entries).toHaveLength(1);
    expect(entries[0].success).toBe(false);
    expect(entries[0].status).toBe(400);
    expect(entries[0].errors).toEqual([
      'Invalid invoice XML structure',
      'Missing required field: ProfileID',
    ]);
  });

  it('stores result with error from validationResults.errorMessages', async () => {
    setupComplianceState(invoiceService, store);

    httpClient.post.mockResolvedValue({
      status: 400,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        validationResults: {
          errorMessages: [{ message: 'Schema validation failed' }],
        },
      }),
    });

    const result = await service.runComplianceCheck(null, 'invoice');

    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
    expect(result.errors).toEqual(['Schema validation failed']);
  });

  it('stores result with error from response.message fallback', async () => {
    setupComplianceState(invoiceService, store);

    httpClient.post.mockResolvedValue({
      status: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: 'Internal server error',
      }),
    });

    const result = await service.runComplianceCheck(null, 'invoice');

    expect(result.success).toBe(false);
    expect(result.status).toBe(500);
    expect(result.errors).toEqual(['Internal server error']);
  });

  it('stores result with raw body string when response is not parseable JSON', async () => {
    setupComplianceState(invoiceService, store);

    httpClient.post.mockResolvedValue({
      status: 500,
      headers: { 'content-type': 'text/plain' },
      body: 'Internal Server Error',
    });

    const result = await service.runComplianceCheck(null, 'invoice');

    expect(result.success).toBe(false);
    expect(result.status).toBe(500);
    expect(result.errors).toEqual(['Internal Server Error']);
  });

  it('treats HTTP 406 "Submitted before" as success, persists as 200', async () => {
    setupComplianceState(invoiceService, store);

    httpClient.post.mockResolvedValue({
      status: 406,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        validationResults: {
          infoMessages: [],
          warningMessages: [],
          errorMessages: [
            {
              type: 'ERROR',
              code: 'Submitted before',
              category: 'Compliance-Check',
              message: 'Compliance check already completed for SIMPLIFIED.',
            },
          ],
          status: 'ERROR',
        },
        reportingStatus: 'NOT_REPORTED',
        clearanceStatus: null,
        qrSellertStatus: null,
        qrBuyertStatus: null,
      }),
    });

    const result = await service.runComplianceCheck(null, 'invoice');

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);

    const entries = parseComplianceResults(store);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      key: 'invoice',
      success: true,
      status: 200,
      warnings: [],
      errors: [],
    });
  });

  it('treats HTTP 406 "Submitted before" for credit_note as success', async () => {
    setupComplianceState(invoiceService, store);

    httpClient.post.mockResolvedValue({
      status: 406,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        validationResults: {
          infoMessages: [],
          warningMessages: [],
          errorMessages: [
            {
              type: 'ERROR',
              code: 'Submitted before',
              category: 'Compliance-Check',
              message: 'Compliance check already completed for SIMPLIFIED_CREDIT_NOTE.',
            },
          ],
          status: 'ERROR',
        },
      }),
    });

    const result = await service.runComplianceCheck(null, 'credit_note');

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);

    const entries = parseComplianceResults(store);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      key: 'credit_note',
      success: true,
      status: 200,
    });
  });

  it('treats HTTP 406 "Submitted before" for debit_note as success', async () => {
    setupComplianceState(invoiceService, store);

    httpClient.post.mockResolvedValue({
      status: 406,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        validationResults: {
          infoMessages: [],
          warningMessages: [],
          errorMessages: [
            {
              type: 'ERROR',
              code: 'Submitted before',
              category: 'Compliance-Check',
              message: 'Compliance check already completed for SIMPLIFIED_DEBIT_NOTE.',
            },
          ],
          status: 'ERROR',
        },
      }),
    });

    const result = await service.runComplianceCheck(null, 'debit_note');

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
    expect(result.errors).toEqual([]);
  });

  it('treats HTTP 406 with a different error code as failure', async () => {
    setupComplianceState(invoiceService, store);

    httpClient.post.mockResolvedValue({
      status: 406,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        validationResults: {
          errorMessages: [
            {
              type: 'ERROR',
              code: 'Invalid-XML',
              category: 'Compliance-Check',
              message: 'Invoice XML is malformed.',
            },
          ],
          status: 'ERROR',
        },
      }),
    });

    const result = await service.runComplianceCheck(null, 'invoice');

    expect(result.success).toBe(false);
    expect(result.status).toBe(406);
    expect(result.errors).toContain('Invoice XML is malformed.');

    const entries = parseComplianceResults(store);
    expect(entries).toHaveLength(1);
    expect(entries[0].success).toBe(false);
    expect(entries[0].status).toBe(406);
  });

  it('throws when state is not compliance or production', async () => {
    await expect(service.runComplianceCheck(null, 'invoice')).rejects.toThrow(
      'Compliance checks require compliance onboarding to be completed',
    );
  });

  it('throws when compliance cert is missing', async () => {
    invoiceService.getOnboardingState.mockReturnValue('compliance');

    await expect(service.runComplianceCheck(null, 'invoice')).rejects.toThrow(
      'Compliance credentials not found',
    );
  });
});

// ── round-trip: runComplianceCheck → getState ─────────────────────────────

describe('compliance results round-trip', () => {
  let store: Map<string, string>;
  let invoiceService: MockInvoiceService;
  let httpClient: MockHttpClient;
  let service: ZatcaOnboardingService;

  beforeEach(() => {
    store = createSettingsStore();
    const printersService = createMockPrintersService(store);
    invoiceService = createMockInvoiceService();
    httpClient = createMockHttpClient();
    service = new ZatcaOnboardingService(
      invoiceService as any,
      httpClient as any,
      printersService as any,
    );
  });

  it('persists results via runComplianceCheck and returns them via getState', async () => {
    setupComplianceState(invoiceService, store);
    mockComplianceHttpSuccess(httpClient);

    await service.runComplianceCheck(null, 'invoice');
    await service.runComplianceCheck(null, 'credit_note');
    await service.runComplianceCheck(null, 'debit_note');

    const state = service.getState();

    expect(state.complianceResults).toHaveLength(3);

    const keys = state.complianceResults.map((e) => e.key).sort();
    expect(keys).toEqual(['credit_note', 'debit_note', 'invoice']);

    for (const entry of state.complianceResults) {
      expect(entry.success).toBe(true);
      expect(entry.status).toBe(200);
      expect(entry.checkedAt).toBeGreaterThan(0);
      expect(entry.errors).toEqual([]);
      expect(entry.warnings).toEqual([]);
    }
  });

  it('reflects a failure result in getState after runComplianceCheck fails', async () => {
    setupComplianceState(invoiceService, store);

    httpClient.post.mockResolvedValue({
      status: 400,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        errors: [{ message: 'Invoice XML validation failed' }],
      }),
    });

    await service.runComplianceCheck(null, 'invoice');

    const state = service.getState();

    expect(state.complianceResults).toHaveLength(1);
    expect(state.complianceResults[0].success).toBe(false);
    expect(state.complianceResults[0].status).toBe(400);
    expect(state.complianceResults[0].errors).toEqual(['Invoice XML validation failed']);
  });

  it('reflects a 406 "Submitted before" as success in getState', async () => {
    setupComplianceState(invoiceService, store);

    httpClient.post.mockResolvedValue({
      status: 406,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        validationResults: {
          infoMessages: [],
          warningMessages: [],
          errorMessages: [
            {
              type: 'ERROR',
              code: 'Submitted before',
              category: 'Compliance-Check',
              message: 'Compliance check already completed for SIMPLIFIED.',
            },
          ],
          status: 'ERROR',
        },
      }),
    });

    await service.runComplianceCheck(null, 'invoice');

    const state = service.getState();

    expect(state.complianceResults).toHaveLength(1);
    const entry = state.complianceResults[0];
    expect(entry.key).toBe('invoice');
    expect(entry.success).toBe(true);
    expect(entry.status).toBe(200);
    expect(entry.errors).toEqual([]);
    expect(entry.warnings).toEqual([]);
    expect(entry.checkedAt).toBeGreaterThan(0);
  });
});

// ── generateCSR: environment → OID label ─────────────────────────────────

describe('generateCSR OID label', () => {
  let store: Map<string, string>;
  let invoiceService: MockInvoiceService;
  let httpClient: MockHttpClient;
  let service: ZatcaOnboardingService;

  beforeEach(() => {
    store = createSettingsStore();
    const printersService = createMockPrintersService(store);
    invoiceService = createMockInvoiceService();
    httpClient = createMockHttpClient();
    service = new ZatcaOnboardingService(
      invoiceService as any,
      httpClient as any,
      printersService as any,
    );
  });

  function extractCsrPayload(csrPem: string): Buffer {
    const lines = csrPem
      .split('\n')
      .filter((l) => !l.startsWith('-----'))
      .join('');
    return Buffer.from(lines, 'base64');
  }

  it('uses ZATCA-Code-Signing OID label for production environment', async () => {
    setupCsrSettings(store);
    store.set('zatca_environment', 'production');

    const { csr } = await service.generateCSR();
    const payload = extractCsrPayload(csr);

    expect(payload.indexOf('ZATCA-Code-Signing')).toBeGreaterThan(-1);
    expect(payload.indexOf('TESTZATCA-Code-Signing')).toBe(-1);
    expect(payload.indexOf('PREZATCA-Code-Signing')).toBe(-1);
  });

  it('uses TESTZATCA-Code-Signing OID label for sandbox environment', async () => {
    setupCsrSettings(store);
    store.set('zatca_environment', 'sandbox');

    const { csr } = await service.generateCSR();
    const payload = extractCsrPayload(csr);

    expect(payload.indexOf('TESTZATCA-Code-Signing')).toBeGreaterThan(-1);
    expect(payload.indexOf('PREZATCA-Code-Signing')).toBe(-1);
  });

  it('uses PREZATCA-Code-Signing OID label for simulation environment', async () => {
    setupCsrSettings(store);
    store.set('zatca_environment', 'simulation');

    const { csr } = await service.generateCSR();
    const payload = extractCsrPayload(csr);

    expect(payload.indexOf('PREZATCA-Code-Signing')).toBeGreaterThan(-1);
    expect(payload.indexOf('TESTZATCA-Code-Signing')).toBe(-1);
  });

  it('defaults to simulation OID label when environment is not set', async () => {
    setupCsrSettings(store);

    const { csr } = await service.generateCSR();
    const payload = extractCsrPayload(csr);

    expect(payload.indexOf('PREZATCA-Code-Signing')).toBeGreaterThan(-1);
    expect(payload.indexOf('TESTZATCA-Code-Signing')).toBe(-1);
  });
});
