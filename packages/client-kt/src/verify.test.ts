import * as fs from 'fs';
import * as path from 'path';

function findGeneratedDir(): string {
  const candidates = [
    path.join(process.cwd(), 'packages', 'client-kt', 'src', 'generated'),
    path.join(__dirname, 'generated'),
    path.join(process.env.RUNFILES_DIR || '', '_main', 'packages', 'client-kt', 'src', 'generated'),
    path.join(
      process.env.BUILD_WORKSPACE_DIRECTORY || '',
      'packages',
      'client-kt',
      'src',
      'generated',
    ),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('Cannot find generated Kotlin sources');
}

const GENERATED_ROOT = path.join(
  findGeneratedDir(),
  'src',
  'main',
  'kotlin',
  'com',
  'spicyhome',
  'client',
);

describe('Kotlin client verification', () => {
  const requiredApis = ['AuthApi', 'MenuApi', 'OrdersApi', 'PrintersApi', 'TablesApi'];
  const requiredModels = [
    'LoginDto',
    'CreateUserDto',
    'UpdateUserDto',
    'CreateRoleDto',
    'UpdateRoleDto',
    'CreateCategoryDto',
    'UpdateCategoryDto',
    'CreateItemDto',
    'UpdateItemDto',
    'CreateOrderDto',
    'AddOrderItemDto',
    'UpdateOrderItemDto',
    'CreateTableDto',
    'UpdateTableDto',
    'CreatePrinterDto',
    'UpdatePrinterDto',
  ];
  const requiredInfrastructure = ['ApiClient', 'Serializer', 'CollectionFormats', 'HttpBearerAuth'];

  for (const api of requiredApis) {
    it(`generated API class exists: ${api}`, () => {
      const filePath = path.join(GENERATED_ROOT, 'apis', `${api}.kt`);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  }

  for (const model of requiredModels) {
    it(`generated model class exists: ${model}`, () => {
      const filePath = path.join(GENERATED_ROOT, 'models', `${model}.kt`);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  }

  for (const infra of requiredInfrastructure) {
    it(`generated infrastructure class exists: ${infra}`, () => {
      const infraDir = path.join(GENERATED_ROOT, 'infrastructure');
      const authDir = path.join(GENERATED_ROOT, 'auth');
      const possiblePaths = [path.join(infraDir, `${infra}.kt`), path.join(authDir, `${infra}.kt`)];
      const exists = possiblePaths.some((p) => fs.existsSync(p));
      expect(exists).toBe(true);
    });
  }

  it('AuthApi contains login method', () => {
    const content = fs.readFileSync(path.join(GENERATED_ROOT, 'apis', 'AuthApi.kt'), 'utf-8');
    expect(content).toContain('fun authControllerLogin');
    expect(content).toContain('loginDto: LoginDto');
    expect(content).toContain('Call<LoginResponse>');
  });

  it('OrdersApi contains createOrder method', () => {
    const content = fs.readFileSync(path.join(GENERATED_ROOT, 'apis', 'OrdersApi.kt'), 'utf-8');
    expect(content).toContain('fun ordersControllerCreateOrder');
    expect(content).toContain('createOrderDto: CreateOrderDto');
    expect(content).toContain('Call<CreateOrderResponse>');
  });

  it('OrdersApi getOrder returns typed OrderResponse', () => {
    const content = fs.readFileSync(path.join(GENERATED_ROOT, 'apis', 'OrdersApi.kt'), 'utf-8');
    expect(content).toContain('fun ordersControllerGetOrder');
    expect(content).toContain('Call<OrderResponse>');
  });

  it('no API method returns Call<Unit>', () => {
    const apiFiles = [
      path.join(GENERATED_ROOT, 'apis', 'AuthApi.kt'),
      path.join(GENERATED_ROOT, 'apis', 'MenuApi.kt'),
      path.join(GENERATED_ROOT, 'apis', 'OrdersApi.kt'),
      path.join(GENERATED_ROOT, 'apis', 'PrintersApi.kt'),
      path.join(GENERATED_ROOT, 'apis', 'TablesApi.kt'),
    ];
    for (const file of apiFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n').filter((l) => l.includes('fun '));
      for (const line of lines) {
        expect(line).not.toContain('Call<Unit>');
      }
    }
  });

  it('ApiClient contains baseUrl configuration', () => {
    const content = fs.readFileSync(
      path.join(GENERATED_ROOT, 'infrastructure', 'ApiClient.kt'),
      'utf-8',
    );
    expect(content).toContain('baseUrl');
  });

  it('generated source count is reasonable (> 30 files)', () => {
    const files = findAllKtFiles(GENERATED_ROOT);
    expect(files.length).toBeGreaterThanOrEqual(30);
  });
});

function findAllKtFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findAllKtFiles(full));
    } else if (entry.name.endsWith('.kt')) {
      results.push(full);
    }
  }
  return results;
}
