import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetSettingDto {
  @ApiProperty({ example: 'restaurant_name' })
  @IsString()
  key!: string;

  @ApiProperty({ example: 'SpicyHome' })
  @IsString()
  value!: string;
}

export class SettingResponse {
  @ApiProperty({ example: 'restaurant_name' })
  key!: string;

  @ApiProperty({ example: 'SpicyHome' })
  value!: string;
}
