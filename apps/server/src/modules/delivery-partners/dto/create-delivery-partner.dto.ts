import { IsString, MinLength, IsOptional, IsBoolean, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiInt32 } from '../../../common/api-property-helpers';

export class CreateDeliveryPartnerDto {
  @ApiProperty({ example: 'HungerStation' })
  @IsString()
  @MinLength(1)
  title!: string;
}

export class UpdateDeliveryPartnerDto {
  /**
   * Slug is immutable (ADR 0007): the id is the shared slug with the owned
   * payment method, so a rename is only possible via `title` (which keeps the
   * slug). Sending a different id is rejected with 400.
   */
  @ApiPropertyOptional({
    type: String,
    description: 'Immutable slug — sending a different value is rejected',
  })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({ type: String, example: 'HungerStation' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ ...ApiInt32, default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
