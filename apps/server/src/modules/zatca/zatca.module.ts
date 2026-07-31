import { Module, forwardRef } from '@nestjs/common';
import { ZatcaController } from './zatca.controller';
import { ZatcaInvoiceService } from './zatca-invoice.service';
import { ZatcaStandardInvoiceService } from './zatca-standard-invoice.service';
import { ZatcaOnboardingService } from './zatca-onboarding.service';
import { ZatcaReportingService } from './zatca-reporting.service';
import { ZatcaClearanceService } from './zatca-clearance.service';
import { ZatcaHttpService } from './zatca-http.service';
import { PrintersModule } from '../printers/printers.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [PrintersModule, forwardRef(() => OrdersModule)],
  controllers: [ZatcaController],
  providers: [
    ZatcaInvoiceService,
    ZatcaStandardInvoiceService,
    ZatcaOnboardingService,
    ZatcaReportingService,
    ZatcaClearanceService,
    ZatcaHttpService,
  ],
  exports: [
    ZatcaInvoiceService,
    ZatcaStandardInvoiceService,
    ZatcaHttpService,
    ZatcaClearanceService,
  ],
})
export class ZatcaModule {}
