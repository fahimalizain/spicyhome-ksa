import { Module, forwardRef } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PrintersModule } from '../printers/printers.module';
import { OrderEventsService } from './order-events.service';
import { DocumentIdService } from './document-id.allocator';
import { ZatcaModule } from '../zatca/zatca.module';

@Module({
  imports: [PrintersModule, forwardRef(() => ZatcaModule)],
  controllers: [OrdersController],
  providers: [OrdersService, OrderEventsService, DocumentIdService],
  exports: [OrderEventsService, DocumentIdService],
})
export class OrdersModule {}
