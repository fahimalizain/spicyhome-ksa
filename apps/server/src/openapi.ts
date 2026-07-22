import 'reflect-metadata';

process.env.TZ = 'Asia/Riyadh';
process.env.SPICYHOME_DB = ':memory:';

import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from './app.module';

async function generate(): Promise<void> {
  const app = await NestFactory.create(AppModule);

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

  const document = SwaggerModule.createDocument(app, config);

  const outputPath = process.argv[2] || process.env.OPENAPI_OUTPUT;
  if (!outputPath) {
    console.error('Usage: node openapi.js <output-path>');
    console.error('  or set OPENAPI_OUTPUT env var');
    process.exit(1);
  }

  const resolved = path.resolve(outputPath);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(resolved, JSON.stringify(document, null, 2), 'utf-8');
  console.log(`OpenAPI spec written to ${resolved}`);

  await app.close();
}

generate().catch((err) => {
  console.error('Failed to generate OpenAPI spec:', err);
  process.exit(1);
});
