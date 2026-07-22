import { Test } from '@nestjs/testing';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@spicyhome/db';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from './app.module';
import { DRIZZLE } from './modules/database/database.module';

function findCheckedInSpec(): string {
  const candidates = [
    path.join(process.cwd(), 'packages', 'api-spec', 'openapi.json'),
    path.join(
      process.env.BUILD_WORKSPACE_DIRECTORY || '',
      'packages',
      'api-spec',
      'openapi.json',
    ),
    path.join(
      process.env.RUNFILES_DIR || '',
      '_main',
      'packages',
      'api-spec',
      'openapi.json',
    ),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('Cannot find checked-in openapi.json');
}

describe('OpenAPI spec drift check', () => {
  it('regenerated spec matches checked-in spec', async () => {
    const sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    const db = drizzle(sqlite, { schema });

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DRIZZLE)
      .useValue(db)
      .compile();

    const app = moduleFixture.createNestApplication();
    await app.init();

    const config = new DocumentBuilder()
      .setTitle('SpicyHome POS API')
      .setDescription('REST API for the SpicyHome restaurant POS system')
      .setVersion('0.0.0')
      .addBearerAuth()
      .addTag('auth', 'Authentication & user management')
      .addTag('menu', 'Menu items & categories')
      .addTag('orders', 'Order management')
      .addTag('tables', 'Table management')
      .addTag('printers', 'Printer configuration')
      .addTag('settings', 'Application settings')
      .addTag('day', 'Business day open/close')
      .addTag('reports', 'X/Z reports and sales summaries')
      .build();

    const generated = SwaggerModule.createDocument(app, config);
    const generatedJson = JSON.stringify(generated, null, 2);

    const checkedInPath = findCheckedInSpec();
    const checkedInJson = fs.readFileSync(checkedInPath, 'utf-8');

    const generatedParsed = JSON.parse(generatedJson);
    const checkedInParsed = JSON.parse(checkedInJson);

    // Normalize: strip operations that nestjs/swagger auto-generates with
    // variable data like operationId suffixes
    function normalizePaths(obj: any) {
      if (obj.openapi) obj.openapi = '3.0.0';
      delete obj.info;
      for (const pathKey of Object.keys(obj.paths || {})) {
        for (const methodKey of Object.keys(obj.paths[pathKey] || {})) {
          delete obj.paths[pathKey][methodKey].operationId;
        }
      }
    }

    normalizePaths(generatedParsed);
    normalizePaths(checkedInParsed);

    // Use deep comparison
    expect(generatedParsed).toEqual(checkedInParsed);

    await app.close();
    sqlite.close();
  });
});
