import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Observable } from 'rxjs';

/**
 * Per-request interceptor that sets the authenticated user on the current
 * Sentry isolation scope.  Sentry's nestIntegration() creates an isolation
 * scope per HTTP request, so setUser here binds errors to the cashier who
 * initiated the request rather than the last user who logged in.
 *
 * This replaces the process-global SENTRY.setUser() call that was previously
 * inside AuthService.login().
 */
@Injectable()
export class SentryUserInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (process.env.SENTRY_DSN) {
      const request = context.switchToHttp().getRequest();
      const user = (request as Record<string, unknown>).user as
        { sub: number; username: string } | undefined;
      if (user) {
        Sentry.setUser({ id: String(user.sub), username: user.username });
      }
    }
    return next.handle();
  }
}
