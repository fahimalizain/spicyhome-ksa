import { Module } from '@nestjs/common';
import { PrintersController } from './printers.controller';
import { PrintersService } from './printers.service';
import { PrintJobService } from './print-job.service';

@Module({
  controllers: [PrintersController],
  providers: [PrintersService, PrintJobService],
  exports: [PrintersService, PrintJobService],
})
export class PrintersModule {}
