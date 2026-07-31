import { IsString, MinLength, MaxLength, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  @MinLength(1)
  username!: string;

  @ApiProperty({ example: '771133' })
  @IsString()
  @MinLength(1)
  @MaxLength(6)
  pin!: string;

  @ApiProperty({ enum: ['android', 'pos'], example: 'pos' })
  @IsIn(['android', 'pos'])
  clientType!: 'android' | 'pos';
}
