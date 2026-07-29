import { ApiProperty } from '@nestjs/swagger';

export class WindowsPrinterQueuesResponse {
  @ApiProperty({
    type: [String],
    example: ['XP-80C', 'Receipt Printer', 'Kitchen Printer'],
    description: 'List of available Windows printer queue names.',
  })
  queues!: string[];
}
