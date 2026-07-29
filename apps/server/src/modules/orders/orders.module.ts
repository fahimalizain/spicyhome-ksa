import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PrintersModule } from '../printers/printers.module';
import { OrderEventsService } from './order-events.service';
import { ZatcaModule } from '../zatca/zatca.module';

@Module({
  imports: [PrintersModule, ZatcaModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderEventsService],
  exports: [OrderEventsService],
})
export class OrdersModule {}
