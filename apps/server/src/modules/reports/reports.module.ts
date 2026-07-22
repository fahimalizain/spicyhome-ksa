import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { BusinessDayModule } from '../business-day/business-day.module';
import { PrintersModule } from '../printers/printers.module';

@Module({
  imports: [BusinessDayModule, PrintersModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
