import { Module } from '@nestjs/common';
import { ZatcaController } from './zatca.controller';
import { ZatcaInvoiceService } from './zatca-invoice.service';
import { ZatcaOnboardingService } from './zatca-onboarding.service';
import { ZatcaReportingService } from './zatca-reporting.service';
import { ZatcaHttpService } from './zatca-http.service';
import { PrintersModule } from '../printers/printers.module';

@Module({
  imports: [PrintersModule],
  controllers: [ZatcaController],
  providers: [
    ZatcaInvoiceService,
    ZatcaOnboardingService,
    ZatcaReportingService,
    ZatcaHttpService,
  ],
  exports: [
    ZatcaInvoiceService,
    ZatcaHttpService,
  ],
})
export class ZatcaModule {}
