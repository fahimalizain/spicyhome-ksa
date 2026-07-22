import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PrintersModule } from '../printers/printers.module';
import { AuditLogService } from './audit-log.service';

@Module({
  imports: [PrintersModule],
  controllers: [OrdersController],
  providers: [OrdersService, AuditLogService],
  exports: [AuditLogService],
})
export class OrdersModule {}
