import type { JwtModuleOptions } from '@nestjs/jwt';

export const jwtModuleOptions: JwtModuleOptions = {
  secret: process.env.JWT_SECRET || 'spicyhome-dev-secret',
  signOptions: { expiresIn: '12h' },
};
