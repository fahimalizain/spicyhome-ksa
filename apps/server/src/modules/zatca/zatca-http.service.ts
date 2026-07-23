/**
 * Injectable HTTP client for ZATCA API calls.
 *
 * Wraps Node's http/https modules for lightweight, dependency-free HTTP.
 * Supports injection of a fake for testing.
 */

import { Injectable, Logger } from '@nestjs/common';
import * as http from 'http';
import * as https from 'https';

export interface ZatcaHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface ZatcaHttpClient {
  post(
    url: string,
    options: {
      headers?: Record<string, string>;
      body?: string;
      auth?: { username: string; password: string };
      timeoutMs?: number;
    },
  ): Promise<ZatcaHttpResponse>;

  get(
    url: string,
    options: {
      headers?: Record<string, string>;
      auth?: { username: string; password: string };
      timeoutMs?: number;
    },
  ): Promise<ZatcaHttpResponse>;
}

@Injectable()
export class ZatcaHttpService implements ZatcaHttpClient {
  private readonly logger = new Logger(ZatcaHttpService.name);

  async post(
    url: string,
    options: {
      headers?: Record<string, string>;
      body?: string;
      auth?: { username: string; password: string };
      timeoutMs?: number;
    },
  ): Promise<ZatcaHttpResponse> {
    return this.request('POST', url, options);
  }

  async get(
    url: string,
    options: {
      headers?: Record<string, string>;
      auth?: { username: string; password: string };
      timeoutMs?: number;
    },
  ): Promise<ZatcaHttpResponse> {
    return this.request('GET', url, options);
  }

  private request(
    method: string,
    url: string,
    options: {
      headers?: Record<string, string>;
      body?: string;
      auth?: { username: string; password: string };
      timeoutMs?: number;
    },
  ): Promise<ZatcaHttpResponse> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const isHttps = parsed.protocol === 'https:';
      const httpModule = isHttps ? https : http;
      const timeoutMs = options.timeoutMs ?? 15000;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options.headers,
      };

      if (options.body && !headers['Content-Length']) {
        headers['Content-Length'] = String(Buffer.byteLength(options.body, 'utf8'));
      }

      // Basic auth
      if (options.auth) {
        const credentials = Buffer.from(
          `${options.auth.username}:${options.auth.password}`,
        ).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
      }

      const reqOptions: http.RequestOptions = {
        method,
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        headers,
        timeout: timeoutMs,
      };

      this.logger.log(
        `${method} ${url} headers=${JSON.stringify(headers)} body=${options.body ? `${options.body.substring(0, 200)}...` : '(none)'}`,
      );

      const req = httpModule.request(reqOptions, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          const resHeaders: Record<string, string> = {};
          if (res.headers) {
            for (const [k, v] of Object.entries(res.headers)) {
              if (v !== undefined) resHeaders[k] = Array.isArray(v) ? v.join(', ') : v;
            }
          }
          this.logger.log(
            `${method} ${url} → ${res.statusCode} headers=${JSON.stringify(resHeaders)} body=${body.substring(0, 500)}`,
          );
          resolve({ status: res.statusCode ?? 0, headers: resHeaders, body });
        });
      });

      req.on('error', (err: Error) => {
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`HTTP ${method} ${url} timed out after ${timeoutMs}ms`));
      });

      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  }
}

/**
 * Fake HTTP client for tests. Records requests and allows setting
 * canned responses based on URL matching.
 */
export class FakeZatcaHttpClient implements ZatcaHttpClient {
  requests: Array<{
    method: string;
    url: string;
    options: any;
  }> = [];

  /** Map URL (or URL prefix) → canned response. */
  responses: Map<string, ZatcaHttpResponse> = new Map();

  /** Global canned response for any unmatched URL. */
  defaultResponse: ZatcaHttpResponse = {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  };

  /** Error to throw on next request (consumed after one use). */
  nextError: Error | null = null;

  private matchResponse(url: string): ZatcaHttpResponse {
    for (const [pattern, resp] of this.responses.entries()) {
      if (url.includes(pattern)) return resp;
    }
    return this.defaultResponse;
  }

  async post(url: string, options: any): Promise<ZatcaHttpResponse> {
    this.requests.push({ method: 'POST', url, options });
    if (this.nextError) {
      const err = this.nextError;
      this.nextError = null;
      throw err;
    }
    return this.matchResponse(url);
  }

  async get(url: string, options: any): Promise<ZatcaHttpResponse> {
    this.requests.push({ method: 'GET', url, options });
    if (this.nextError) {
      const err = this.nextError;
      this.nextError = null;
      throw err;
    }
    return this.matchResponse(url);
  }
}
