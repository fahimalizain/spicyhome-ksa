import type { components } from './generated/types';

type Schemas = components['schemas'];

export type LoginDto = Schemas['LoginDto'];
export type CreateUserDto = Schemas['CreateUserDto'];
export type UpdateUserDto = Schemas['UpdateUserDto'];
export type CreateRoleDto = Schemas['CreateRoleDto'];
export type UpdateRoleDto = Schemas['UpdateRoleDto'];
export type CreateCategoryDto = Schemas['CreateCategoryDto'];
export type UpdateCategoryDto = Schemas['UpdateCategoryDto'];
export type CreateItemDto = Schemas['CreateItemDto'];
export type UpdateItemDto = Schemas['UpdateItemDto'];
export type CreateTableDto = Schemas['CreateTableDto'];
export type UpdateTableDto = Schemas['UpdateTableDto'];
export type CreatePrinterDto = Schemas['CreatePrinterDto'];
export type UpdatePrinterDto = Schemas['UpdatePrinterDto'];
export type CreateOrderDto = Schemas['CreateOrderDto'];
export type PayOrderDto = Schemas['PayOrderDto'];
export type PaymentLineDto = Schemas['PaymentLineDto'];

export type SyncOrderItemsDto = Schemas['SyncOrderItemsDto'];
export type SyncOrderItemDto = Schemas['SyncOrderItemDto'];
export type UpdateOrderMetaDto = Schemas['UpdateOrderMetaDto'];

export type CreateRefundDto = Schemas['CreateRefundDto'];
export type RefundResponse = Schemas['RefundResponse'];
export type OrderRefundResponse = Schemas['OrderRefundResponse'];
export type RefundItemDto = Schemas['RefundItemDto'];
export type RefundItemResponse = Schemas['RefundItemResponse'];
export type OrderEventResponse = Schemas['OrderEventResponse'];
export type PrintResponse = Schemas['PrintResponse'];
export type ReprintOrderDto = Schemas['ReprintOrderDto'];

export type LoginResponse = Schemas['LoginResponse'];
export type MeResponse = Schemas['MeResponse'];
export type UserResponse = Schemas['UserResponse'];
export type UsernamesResponse = Schemas['UsernamesResponse'];
export type RoleResponse = Schemas['RoleResponse'];
export type CategoryResponse = Schemas['CategoryResponse'];
export type ItemResponse = Schemas['ItemResponse'];
export type OrderResponse = Schemas['OrderResponse'];
export type OrderSummaryResponse = Schemas['OrderSummaryResponse'];
export type CreateOrderResponse = Schemas['CreateOrderResponse'];
export type SuccessResponse = Schemas['SuccessResponse'];
export type StatusResponse = Schemas['StatusResponse'];
export type AuditVerifyResponse = Schemas['AuditVerifyResponse'];
export type TableResponse = Schemas['TableResponse'];
export type PrinterResponse = Schemas['PrinterResponse'];
export type PrinterStatusResponse = Schemas['PrinterStatusResponse'];
export type WindowsPrinterQueuesResponse = Schemas['WindowsPrinterQueuesResponse'];

export type ZatcaConfigDto = Schemas['ZatcaConfigDto'];

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

export interface ZatcaOnboardingState {
  state: 'not_started' | 'csr_generated' | 'compliance' | 'production';
  keyGenerated: boolean;
  complianceDone: boolean;
  productionDone: boolean;
  complianceCertExpiry: number | null;
  productionCertExpiry: number | null;
  publicKeyPem: string | null;
  complianceResults: ComplianceResultEntry[];
}

export interface ZatcaInvoice {
  id: number;
  orderId: number;
  icv: number;
  uuid: string;
  invoiceHash: string;
  prevInvoiceHash: string;
  xml: string;
  qrTlv: string;
  status: string;
  reportedAt: number | null;
  createdAt: number;
  updatedAt: number;
  /** Snapshot of orders.document_id at attempt time (zatca_invoices.document_id column) */
  documentId: string | null;
}

export interface ZatcaCreditNote {
  id: number;
  orderId: number;
  refundId: number;
  relatedInvoiceUuid: string;
  icv: number;
  uuid: string;
  invoiceHash: string;
  prevInvoiceHash: string;
  xml: string;
  qrTlv: string;
  status: string;
  reportedAt: number | null;
  totalHalalas: number;
  vatHalalas: number;
  reason: string | null;
  createdAt: number;
  updatedAt: number;
  /** Snapshot of order_refunds.document_id at attempt time (zatca_credit_notes.document_id column) */
  documentId: string | null;
}

export interface ZatcaReportingResult {
  processed: number;
  succeeded: number;
  failed: number;
}

export interface ZatcaInvoiceAttempt {
  id: number;
  attemptNo: number;
  status: string;
  icv: number;
  uuid: string;
  errors: string[];
  warnings: string[];
  httpStatus: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ZatcaInvoiceStatusResponse {
  invoiceType: 'simplified' | 'standard' | 'none';
  current: ZatcaInvoiceAttempt | null;
  attempts: ZatcaInvoiceAttempt[];
  canRetryClearance: boolean;
  canReissue: boolean;
}

/** Info passed to onRequestComplete for observability (e.g. Sentry breadcrumbs). */
export interface RequestCompleteInfo {
  method: string;
  url: string;
  requestBody: string | undefined;
  responseStatus: number;
  responseBody: string | undefined;
}

export interface SpicyHomeClientConfig {
  baseUrl: string;
  getToken: () => string | null;
  onUnauthorized?: () => void;
  /** Called after every fetch (success or error) for observability. */
  onRequestComplete?: (info: RequestCompleteInfo) => void;
}

/**
 * Truncate a string to maxLength, adding a truncation marker.
 * Mirrors Android SentryHttpBodyInterceptor.MAX_BODY_CHARS (100KB limit for
 * server ↔ POS traffic; 32KB used here to keep Envelope sizes reasonable).
 */
function truncateBody(s: string, maxLength: number = 32000): string {
  if (s.length <= maxLength) return s;
  return s.slice(0, maxLength) + '…[truncated]';
}

async function request<T>(
  config: SpicyHomeClientConfig,
  method: string,
  path: string,
  body?: unknown,
  query?: Record<string, string | undefined>,
): Promise<T> {
  const url = new URL(config.baseUrl.replace(/\/+$/, '') + path);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const token = config.getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const requestBodyStr = body ? JSON.stringify(body) : undefined;

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: requestBodyStr,
  });

  // Notify observability hook (e.g. Sentry breadcrumbs) after every request.
  if (config.onRequestComplete) {
    const responseBodyStr = await response
      .clone()
      .text()
      .catch(() => undefined);
    // Fire-and-forget — don't let breadcrumb logic throw or block the caller.
    try {
      config.onRequestComplete({
        method,
        url: url.toString(),
        requestBody: requestBodyStr ? truncateBody(requestBodyStr) : undefined,
        responseStatus: response.status,
        responseBody: responseBodyStr ? truncateBody(responseBodyStr) : undefined,
      });
    } catch {
      // Silently swallow — observability must not break the app.
    }
  }

  if (!response.ok) {
    if (response.status === 401 && config.onUnauthorized) {
      // POST /auth/login 401 means bad credentials — not an expired session.
      if (!(method === 'POST' && path === '/auth/login')) {
        config.onUnauthorized();
      }
    }
    const errorBody = await response.text().catch(() => 'Unknown error');
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${errorBody}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

export class SpicyHomeClient {
  private config: SpicyHomeClientConfig;

  constructor(config: SpicyHomeClientConfig) {
    this.config = config;
  }

  auth = {
    login: (dto: LoginDto) => request<LoginResponse>(this.config, 'POST', '/auth/login', dto),

    me: () => request<MeResponse>(this.config, 'GET', '/auth/me'),

    listUsernames: (opts?: { platform?: 'android' }) =>
      request<UsernamesResponse>(
        this.config,
        'GET',
        '/auth/usernames',
        undefined,
        opts?.platform ? { platform: opts.platform } : undefined,
      ),

    listUsers: () => request<UserResponse[]>(this.config, 'GET', '/auth/users'),

    getUser: (id: number) => request<UserResponse>(this.config, 'GET', `/auth/users/${id}`),

    createUser: (dto: CreateUserDto) =>
      request<UserResponse>(this.config, 'POST', '/auth/users', dto),

    updateUser: (id: number, dto: UpdateUserDto) =>
      request<UserResponse>(this.config, 'PUT', `/auth/users/${id}`, dto),

    listRoles: () => request<RoleResponse[]>(this.config, 'GET', '/auth/roles'),

    createRole: (dto: CreateRoleDto) =>
      request<RoleResponse>(this.config, 'POST', '/auth/roles', dto),

    updateRole: (id: number, dto: UpdateRoleDto) =>
      request<RoleResponse>(this.config, 'PUT', `/auth/roles/${id}`, dto),
  };

  menu = {
    listCategories: () => request<CategoryResponse[]>(this.config, 'GET', '/menu/categories'),

    getCategory: (id: number) =>
      request<CategoryResponse>(this.config, 'GET', `/menu/categories/${id}`),

    createCategory: (dto: CreateCategoryDto) =>
      request<CategoryResponse>(this.config, 'POST', '/menu/categories', dto),

    updateCategory: (id: number, dto: UpdateCategoryDto) =>
      request<CategoryResponse>(this.config, 'PUT', `/menu/categories/${id}`, dto),

    listItems: (categoryId?: number) =>
      request<ItemResponse[]>(this.config, 'GET', '/menu/items', undefined, {
        categoryId: categoryId?.toString(),
      }),

    getItem: (id: number) => request<ItemResponse>(this.config, 'GET', `/menu/items/${id}`),

    createItem: (dto: CreateItemDto) =>
      request<ItemResponse>(this.config, 'POST', '/menu/items', dto),

    updateItem: (id: number, dto: UpdateItemDto) =>
      request<ItemResponse>(this.config, 'PUT', `/menu/items/${id}`, dto),
  };

  orders = {
    list: (status?: string, date?: string) =>
      request<OrderSummaryResponse[]>(this.config, 'GET', '/orders', undefined, { status, date }),

    get: (id: number) => request<OrderResponse>(this.config, 'GET', `/orders/${id}`),

    create: (dto: CreateOrderDto) =>
      request<CreateOrderResponse>(this.config, 'POST', '/orders', dto),

    syncItems: (orderId: number, dto: SyncOrderItemsDto) =>
      request<OrderResponse>(this.config, 'PUT', `/orders/${orderId}/items/sync`, dto),

    update: (orderId: number, dto: UpdateOrderMetaDto) =>
      request<OrderResponse>(this.config, 'PATCH', `/orders/${orderId}`, dto),

    pay: (orderId: number, dto: PayOrderDto) =>
      request<StatusResponse>(this.config, 'POST', `/orders/${orderId}/pay`, dto),

    void: (orderId: number) =>
      request<StatusResponse>(this.config, 'POST', `/orders/${orderId}/void`),

    refund: (orderId: number, dto: CreateRefundDto) =>
      request<RefundResponse>(this.config, 'POST', `/orders/${orderId}/refund`, dto),

    getRefunds: (orderId: number) =>
      request<OrderRefundResponse[]>(this.config, 'GET', `/orders/${orderId}/refunds`),

    reprintRefund: (orderId: number, refundId: number) =>
      request<PrintResponse>(this.config, 'POST', `/orders/${orderId}/refunds/${refundId}/print`),

    getEvents: (orderId: number) =>
      request<OrderEventResponse[]>(this.config, 'GET', `/orders/${orderId}/events`),

    verifyEvents: (orderId: number) =>
      request<AuditVerifyResponse>(this.config, 'GET', `/orders/${orderId}/events/verify`),

    reprint: (orderId: number, dto: ReprintOrderDto) =>
      request<PrintResponse>(this.config, 'POST', `/orders/${orderId}/print`, dto),

    getZatcaInvoice: (orderId: number) =>
      request<ZatcaInvoiceStatusResponse>(this.config, 'GET', `/orders/${orderId}/zatca-invoice`),

    retryZatcaClearance: (orderId: number) =>
      request<any>(this.config, 'POST', `/orders/${orderId}/zatca-invoice/retry-clearance`),

    reissueZatcaInvoice: (
      orderId: number,
      body?: { zatcaBuyerDetails?: Record<string, unknown> },
    ) => request<any>(this.config, 'POST', `/orders/${orderId}/zatca-invoice/reissue`, body),

    getZatcaCreditNote: (orderId: number, refundId: number) =>
      request<ZatcaInvoiceStatusResponse>(
        this.config,
        'GET',
        `/orders/${orderId}/refunds/${refundId}/zatca-credit-note`,
      ),

    retryZatcaCreditNoteClearance: (orderId: number, refundId: number) =>
      request<any>(
        this.config,
        'POST',
        `/orders/${orderId}/refunds/${refundId}/zatca-credit-note/retry-clearance`,
      ),

    reissueZatcaCreditNote: (orderId: number, refundId: number) =>
      request<any>(
        this.config,
        'POST',
        `/orders/${orderId}/refunds/${refundId}/zatca-credit-note/reissue`,
      ),
  };

  tables = {
    list: () => request<TableResponse[]>(this.config, 'GET', '/tables'),

    get: (id: number) => request<TableResponse>(this.config, 'GET', `/tables/${id}`),

    create: (dto: CreateTableDto) => request<TableResponse>(this.config, 'POST', '/tables', dto),

    update: (id: number, dto: UpdateTableDto) =>
      request<TableResponse>(this.config, 'PUT', `/tables/${id}`, dto),
  };

  printers = {
    list: () => request<PrinterResponse[]>(this.config, 'GET', '/printers'),

    get: (id: number) => request<PrinterResponse>(this.config, 'GET', `/printers/${id}`),

    create: (dto: CreatePrinterDto) =>
      request<PrinterResponse>(this.config, 'POST', '/printers', dto),

    update: (id: number, dto: UpdatePrinterDto) =>
      request<PrinterResponse>(this.config, 'PUT', `/printers/${id}`, dto),

    test: (id: number) => request<SuccessResponse>(this.config, 'POST', `/printers/${id}/test`),

    status: (id: number) =>
      request<PrinterStatusResponse>(this.config, 'GET', `/printers/${id}/status`),

    listWindowsQueues: () =>
      request<WindowsPrinterQueuesResponse>(this.config, 'GET', '/printers/windows-queues'),
  };

  day = {
    open: (dto: { openingCashHalalas: number }) =>
      request<any>(this.config, 'POST', '/day/open', dto),

    close: (dto: { closingCashHalalas: number }) =>
      request<any>(this.config, 'POST', '/day/close', dto),

    current: () => request<any>(this.config, 'GET', '/day/current'),

    list: (page = 1, limit = 20) =>
      request<any>(this.config, 'GET', '/day', undefined, {
        page: String(page),
        limit: String(limit),
      }),

    get: (id: number) => request<any>(this.config, 'GET', `/day/${id}`),
  };

  paymentMethods = {
    list: () => request<any[]>(this.config, 'GET', '/payment-methods'),

    listEnabled: () => request<any[]>(this.config, 'GET', '/payment-methods/enabled'),

    create: (dto: { title: string; zatcaPaymentMeansCode: string }) =>
      request<any>(this.config, 'POST', '/payment-methods', dto),

    update: (
      id: string,
      dto: {
        title?: string;
        enabled?: boolean;
        sortOrder?: number;
        zatcaPaymentMeansCode?: string;
      },
    ) => request<any>(this.config, 'PATCH', `/payment-methods/${id}`, dto),
  };

  reports = {
    x: () => request<any>(this.config, 'GET', '/reports/x'),

    z: (dayId: number) => request<any>(this.config, 'GET', `/reports/z/${dayId}`),

    sales: (from: string, to: string) =>
      request<any>(this.config, 'GET', '/reports/sales', undefined, { from, to }),

    vat: (from: string, to: string) =>
      request<any>(this.config, 'GET', '/reports/vat', undefined, { from, to }),

    printZ: (dayId: number) => request<any>(this.config, 'POST', `/reports/z/${dayId}/print`),

    printX: () => request<any>(this.config, 'POST', '/reports/x/print'),
  };

  zatca = {
    getConfig: () => request<ZatcaConfigDto>(this.config, 'GET', '/zatca/config'),

    updateConfig: (config: ZatcaConfigDto) =>
      request<ZatcaConfigDto>(this.config, 'PUT', '/zatca/config', config),

    getStatus: () => request<ZatcaOnboardingState>(this.config, 'GET', '/zatca/status'),

    generateCsr: () =>
      request<{ csr: string; publicKeyPem: string }>(this.config, 'POST', '/zatca/onboard/csr'),

    onboardCompliance: (otp: string) =>
      request<{ success: boolean; requestId: string }>(
        this.config,
        'POST',
        '/zatca/onboard/compliance',
        { otp },
      ),

    onboardProduction: () =>
      request<{ success: boolean; requestId: string }>(
        this.config,
        'POST',
        '/zatca/onboard/production',
      ),

    runComplianceCheck: (invoiceId?: number, documentType?: string) =>
      request<{ success: boolean; status: number; warnings: string[]; errors: string[] }>(
        this.config,
        'POST',
        '/zatca/onboard/compliance-check',
        { invoiceId, documentType },
      ),

    listInvoices: (limit?: number, offset?: number) =>
      request<ZatcaInvoice[]>(this.config, 'GET', '/zatca/invoices', undefined, {
        limit: limit?.toString(),
        offset: offset?.toString(),
      }),

    getInvoice: (id: number) => request<ZatcaInvoice>(this.config, 'GET', `/zatca/invoices/${id}`),

    listCreditNotes: (limit?: number, offset?: number) =>
      request<ZatcaCreditNote[]>(this.config, 'GET', '/zatca/credit-notes', undefined, {
        limit: limit?.toString(),
        offset: offset?.toString(),
      }),

    getCreditNote: (id: number) =>
      request<ZatcaCreditNote>(this.config, 'GET', `/zatca/credit-notes/${id}`),

    retryReporting: (invoiceId?: number, creditNoteId?: number) =>
      request<ZatcaReportingResult>(this.config, 'POST', '/zatca/reporting/retry', {
        invoiceId,
        creditNoteId,
      }),
  };
}
