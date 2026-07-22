import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { jwtModuleOptions } from '../../common/jwt-options';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [JwtModule.register(jwtModuleOptions)],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [JwtModule],
})
export class AuthModule {}
