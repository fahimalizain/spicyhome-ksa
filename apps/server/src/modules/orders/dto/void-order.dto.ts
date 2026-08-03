import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VoidOrderDto {
  @ApiProperty({
    type: String,
    example: 'Customer left',
    description: 'Required reason for voiding the order',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
