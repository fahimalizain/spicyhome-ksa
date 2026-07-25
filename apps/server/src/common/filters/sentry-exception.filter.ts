import { ArgumentsHost, Catch, HttpException, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import * as Sentry from '@sentry/nestjs';
import type { Request, Response } from 'express';

/** Max body length we'll capture in the Sentry event context (bytes). */
const MAX_CONTEXT_BODY_LENGTH = 64000;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '…[truncated]';
}

/**
 * Global exception filter that captures ALL exceptions in Sentry,
 * including HttpExceptions (4xx and 5xx), while preserving correct
 * HTTP status responses.
 *
 * The default SentryGlobalFilter skips most HttpExceptions (anything
 * below 500), but for a POS system we want visibility into all
 * errors including 400/401/403/404/409/etc.
 *
 * Also enriches events with request body/query context so floor issues
 * are as debuggable as tablet crashes (same intent as Android's
 * beforeSend request body attachment).
 */
@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    // Always capture in Sentry when DSN is configured
    if (process.env.SENTRY_DSN) {
      this.enrichWithRequestContext(host);
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

  /**
   * Attach HTTP request metadata (method, URL, query, body) to the current
   * isolation scope so error events include full request context.
   *
   * sendDefaultPii is true, so Authorization headers are included.
   * Large bodies are truncated to avoid bloating Sentry envelopes.
   */
  private enrichWithRequestContext(host: ArgumentsHost): void {
    try {
      const ctx = host.switchToHttp();
      const req = ctx.getRequest<Request>();

      if (!req) return;

      const scope = Sentry.getIsolationScope();

      // Set basic HTTP context on the isolation scope
      scope.setContext('request', {
        method: req.method,
        url: req.originalUrl || req.url,
        query: req.query,
        body: req.body ? truncate(JSON.stringify(req.body), MAX_CONTEXT_BODY_LENGTH) : undefined,
      });
    } catch {
      // Never let the enrichment logic throw — observability must be non-disruptive.
    }
  }
}
