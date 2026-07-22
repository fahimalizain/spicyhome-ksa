import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { jwtModuleOptions } from '../../common/jwt-options';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [JwtModule.register(jwtModuleOptions)],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
