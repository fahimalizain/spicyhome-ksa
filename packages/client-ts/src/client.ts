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
export type AddOrderItemDto = Schemas['AddOrderItemDto'];
export type UpdateOrderItemDto = Schemas['UpdateOrderItemDto'];

export type LoginResponse = Schemas['LoginResponse'];
export type MeResponse = Schemas['MeResponse'];
export type UserResponse = Schemas['UserResponse'];
export type RoleResponse = Schemas['RoleResponse'];
export type CategoryResponse = Schemas['CategoryResponse'];
export type ItemResponse = Schemas['ItemResponse'];
export type OrderResponse = Schemas['OrderResponse'];
export type CreateOrderResponse = Schemas['CreateOrderResponse'];
export type SuccessResponse = Schemas['SuccessResponse'];
export type StatusResponse = Schemas['StatusResponse'];
export type AuditVerifyResponse = Schemas['AuditVerifyResponse'];
export type TableResponse = Schemas['TableResponse'];
export type PrinterResponse = Schemas['PrinterResponse'];

export interface SpicyHomeClientConfig {
  baseUrl: string;
  getToken: () => string | null;
}

async function request<T>(
  config: SpicyHomeClientConfig,
  method: string,
  path: string,
  body?: unknown,
  query?: Record<string, string | undefined>,
): Promise<T> {
  const url = new URL(path, config.baseUrl);
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

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
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
    login: (dto: LoginDto) =>
      request<LoginResponse>(this.config, 'POST', '/auth/login', dto),

    me: () =>
      request<MeResponse>(this.config, 'GET', '/auth/me'),

    listUsers: () =>
      request<UserResponse[]>(this.config, 'GET', '/auth/users'),

    getUser: (id: number) =>
      request<UserResponse>(this.config, 'GET', `/auth/users/${id}`),

    createUser: (dto: CreateUserDto) =>
      request<UserResponse>(this.config, 'POST', '/auth/users', dto),

    updateUser: (id: number, dto: UpdateUserDto) =>
      request<UserResponse>(this.config, 'PUT', `/auth/users/${id}`, dto),

    listRoles: () =>
      request<RoleResponse[]>(this.config, 'GET', '/auth/roles'),

    createRole: (dto: CreateRoleDto) =>
      request<RoleResponse>(this.config, 'POST', '/auth/roles', dto),

    updateRole: (id: number, dto: UpdateRoleDto) =>
      request<RoleResponse>(this.config, 'PUT', `/auth/roles/${id}`, dto),
  };

  menu = {
    listCategories: () =>
      request<CategoryResponse[]>(this.config, 'GET', '/menu/categories'),

    getCategory: (id: number) =>
      request<CategoryResponse>(this.config, 'GET', `/menu/categories/${id}`),

    createCategory: (dto: CreateCategoryDto) =>
      request<CategoryResponse>(this.config, 'POST', '/menu/categories', dto),

    updateCategory: (id: number, dto: UpdateCategoryDto) =>
      request<CategoryResponse>(this.config, 'PUT', `/menu/categories/${id}`, dto),

    listItems: (categoryId?: number) =>
      request<ItemResponse[]>(
        this.config, 'GET', '/menu/items',
        undefined,
        { categoryId: categoryId?.toString() },
      ),

    getItem: (id: number) =>
      request<ItemResponse>(this.config, 'GET', `/menu/items/${id}`),

    createItem: (dto: CreateItemDto) =>
      request<ItemResponse>(this.config, 'POST', '/menu/items', dto),

    updateItem: (id: number, dto: UpdateItemDto) =>
      request<ItemResponse>(this.config, 'PUT', `/menu/items/${id}`, dto),
  };

  orders = {
    list: (status?: string, date?: string) =>
      request<OrderResponse[]>(
        this.config, 'GET', '/orders',
        undefined,
        { status, date },
      ),

    get: (id: number) =>
      request<OrderResponse>(this.config, 'GET', `/orders/${id}`),

    verifyAuditChain: (id: number) =>
      request<AuditVerifyResponse>(this.config, 'GET', `/orders/${id}/audit/verify`),

    create: (dto: CreateOrderDto) =>
      request<CreateOrderResponse>(this.config, 'POST', '/orders', dto),

    addItem: (orderId: number, dto: AddOrderItemDto) =>
      request<SuccessResponse>(this.config, 'POST', `/orders/${orderId}/items`, dto),

    updateItem: (orderId: number, itemId: number, dto: UpdateOrderItemDto) =>
      request<SuccessResponse>(
        this.config, 'PATCH', `/orders/${orderId}/items/${itemId}`, dto,
      ),

    removeItem: (orderId: number, itemId: number) =>
      request<SuccessResponse>(this.config, 'DELETE', `/orders/${orderId}/items/${itemId}`),

    send: (orderId: number) =>
      request<StatusResponse>(this.config, 'POST', `/orders/${orderId}/send`),

    pay: (orderId: number) =>
      request<StatusResponse>(this.config, 'POST', `/orders/${orderId}/pay`),

    void: (orderId: number) =>
      request<StatusResponse>(this.config, 'POST', `/orders/${orderId}/void`),
  };

  tables = {
    list: () =>
      request<TableResponse[]>(this.config, 'GET', '/tables'),

    get: (id: number) =>
      request<TableResponse>(this.config, 'GET', `/tables/${id}`),

    create: (dto: CreateTableDto) =>
      request<TableResponse>(this.config, 'POST', '/tables', dto),

    update: (id: number, dto: UpdateTableDto) =>
      request<TableResponse>(this.config, 'PUT', `/tables/${id}`, dto),
  };

  printers = {
    list: () =>
      request<PrinterResponse[]>(this.config, 'GET', '/printers'),

    get: (id: number) =>
      request<PrinterResponse>(this.config, 'GET', `/printers/${id}`),

    create: (dto: CreatePrinterDto) =>
      request<PrinterResponse>(this.config, 'POST', '/printers', dto),

    update: (id: number, dto: UpdatePrinterDto) =>
      request<PrinterResponse>(this.config, 'PUT', `/printers/${id}`, dto),
  };
}
