import { ArgumentsHost, Catch, HttpException, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import * as Sentry from '@sentry/nestjs';
import type { Response } from 'express';

/**
 * Global exception filter that captures ALL exceptions in Sentry,
 * including HttpExceptions (4xx and 5xx), while preserving correct
 * HTTP status responses.
 *
 * The default SentryGlobalFilter skips most HttpExceptions (anything
 * below 500), but for a POS system we want visibility into all
 * errors including 400/401/403/404/409/etc.
 */
@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    // Always capture in Sentry when DSN is configured
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(exception);
    }

    const type = host.getType();

    // HTTP context: preserve correct HTTP status and JSON response body
    if (type === 'http') {
      const ctx = host.switchToHttp();
      const response = ctx.getResponse<Response>();

      if (exception instanceof HttpException) {
        const status = exception.getStatus();
        const message = exception.getResponse();

        if (typeof message === 'object' && message !== null) {
          const body = message as Record<string, unknown>;
          response.status(status).json({
            ...body,
            statusCode: status,
          });
        } else {
          response.status(status).json({
            statusCode: status,
            message: String(message),
          });
        }
        return;
      }

      // Unknown/unhandled exceptions
      const status = HttpStatus.INTERNAL_SERVER_ERROR;
      response.status(status).json({
        statusCode: status,
        message:
          process.env.NODE_ENV === 'production' ? 'Internal server error' : String(exception),
      });
      return;
    }

    // WebSocket / RPC context: capture was already done above; rethrow so
    // the gateway or microservice handler can close/respond appropriately.
    // Do not assume an Express res object is available.
    if (type === 'ws') {
      throw exception;
    }

    // Fallback: delegate to Nest's default handling (e.g. for rpc)
    super.catch(exception, host);
  }
}
