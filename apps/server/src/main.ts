import 'reflect-metadata';

process.env.TZ = 'Asia/Riyadh';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  await app.listen(port);
  console.log(`SpicyHome server listening on port ${port}`);
}

bootstrap().catch((err) => {
  console.error('Failed to bootstrap:', err);
  process.exit(1);
});
