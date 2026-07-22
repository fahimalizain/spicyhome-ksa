import { Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE, APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { join } from 'path';
import { DatabaseModule } from './modules/database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { MenuModule } from './modules/menu/menu.module';
import { TablesModule } from './modules/tables/tables.module';
import { PrintersModule } from './modules/printers/printers.module';
import { OrdersModule } from './modules/orders/orders.module';
import { SettingsModule } from './modules/settings/settings.module';
import { ZatcaModule } from './modules/zatca/zatca.module';
import { BusinessDayModule } from './modules/business-day/business-day.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AuthGuard } from './common/guards/auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

const spaDist = process.env.SPA_DIST;
const imports: any[] = [
  EventEmitterModule.forRoot(),
  DatabaseModule,
  AuthModule,
  MenuModule,
  TablesModule,
  PrintersModule,
  OrdersModule,
  SettingsModule,
  ZatcaModule,
  BusinessDayModule,
  ReportsModule,
];

if (spaDist) {
  imports.push(
    ServeStaticModule.forRoot({
      rootPath: spaDist,
      exclude: [
        '/api/(.*)',
        '/auth/(.*)',
        '/menu/(.*)',
        '/orders/(.*)',
        '/tables/(.*)',
        '/printers/(.*)',
        '/settings/(.*)',
        '/zatca/(.*)',
        '/day/(.*)',
        '/reports/(.*)',
      ],
    }),
  );
}

@Module({
  imports,
  providers: [
    { provide: APP_PIPE, useClass: ValidationPipe },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
