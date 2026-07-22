import 'reflect-metadata';

process.env.TZ = 'Asia/Riyadh';

import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new WsAdapter(app));
  app.enableCors();

  const swaggerConfig = new DocumentBuilder()
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
    .addTag('zatca', 'ZATCA e-invoicing')
    .addTag('day', 'Business day open/close')
    .addTag('reports', 'X/Z reports and sales summaries')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3742;
  await app.listen(port);
  console.log(`SpicyHome server listening on port ${port}`);
  console.log(`Swagger UI: http://localhost:${port}/api/docs`);
}

bootstrap().catch((err) => {
  console.error('Failed to bootstrap:', err);
  process.exit(1);
});
