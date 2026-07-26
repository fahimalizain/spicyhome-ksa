// Sentry must be initialized before any other imports
import './instrument';

import 'reflect-metadata';

process.env.TZ = 'Asia/Riyadh';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/nestjs';
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

  const logger = new Logger('HTTP');
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const { method, originalUrl } = req;
    const start = Date.now();
    _res.on('finish', () => {
      const { statusCode } = _res;
      const ms = Date.now() - start;
      logger.log(`${method} ${originalUrl} → ${statusCode} (${ms}ms)`);
    });
    next();
  });

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3742;
  await app.listen(port);
  logger.log(`SpicyHome server listening on port ${port}`);
  logger.log(`Swagger UI: http://localhost:${port}/api/docs`);
}

bootstrap().catch(async (err) => {
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err);
    // Give Sentry time to flush before exiting
    await Sentry.close(2000);
  }
  Logger.error('Failed to bootstrap', err instanceof Error ? err.stack : err);
  process.exit(1);
});
