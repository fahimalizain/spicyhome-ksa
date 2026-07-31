/**
 * ZATCA Clearance Classification — pure functions that interpret the ZATCA
 * clearance HTTP response and map it to a structured category.
 *
 * These functions are shared between the clearance service (which calls the API)
 * and the standard invoice service (which decides how to store the result).
 */

import type { ZatcaClearanceStatus } from './zatca-clearance.service';

// ── Public types ───────────────────────────────────────────────────────────────

export type ClearanceCategory = 'CLEARED' | 'REJECTED' | 'ERROR';

export interface ClearanceClassifyResult {
  category: ClearanceCategory;
  /** Clearance-specific status extracted from response body */
  clearanceStatus: string | undefined;
  warnings: string[];
  errors: string[];
  /** Decoded cleared XML (from clearedInvoice base64 field), null if absent */
  clearedXml: string | null;
  /** Raw clearedInvoice base64 field from response */
  clearedInvoiceBase64: string | null;
}

/**
 * Thrown when the ZATCA clearance response is an ambiguous 2xx that contains
 * neither a clearedInvoice, an explicit rejecting status, nor error messages.
 *
 * Callers MUST catch this error and treat the attempt as an ERROR (retryable).
 * Under no circumstances should ambiguous 2xx responses be treated as CLEARED.
 */
export class UnhandledClearanceResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnhandledClearanceResponseError';
  }
}

// ── extractMessage ────────────────────────────────────────────────────────────

/**
 * Extract a human-readable message from a ZATCA warning/error item.
 *
 * Items may be plain strings or structured objects with optional `type`,
 * `message`, and `code` fields. The canonical format is:
 *
 * - `"TYPE: message (CODE)"` when type and code are both present
 * - `"TYPE: message"` when only type is present
 * - `"message (CODE)"` when only code is present
 * - `"message"` when only a message field exists
 * - `JSON.stringify(item)` as fallback
 */
export function extractMessage(item: unknown): string {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object') {
    const o = item as Record<string, unknown>;
    const type = typeof o.type === 'string' ? o.type : '';
    const message = typeof o.message === 'string' ? o.message : JSON.stringify(item);
    const code = typeof o.code === 'string' ? o.code : '';
    if (type || code) {
      if (type && code) return `${type}: ${message} (${code})`;
      if (type) return `${type}: ${message}`;
      if (code) return `${message} (${code})`;
    }
    return message;
  }
  return JSON.stringify(item);
}

// ── categorizeClearanceResponse ───────────────────────────────────────────────

/**
 * Categorize a ZATCA clearance HTTP response into CLEARED, REJECTED, or ERROR.
 *
 * **Rules (authoritative):**
 *
 * | Condition | Category |
 * |---|---|
 * | `httpStatus >= 500` | `ERROR` |
 * | `httpStatus >= 400 && httpStatus < 500` | `REJECTED` |
 * | 200 or 202 + `clearedInvoice` present OR `clearanceStatus === 'CLEARED'` | `CLEARED` |
 * | 200/202 + `clearanceStatus` present and ≠ `CLEARED` | `REJECTED` |
 * | 200/202 + `validationResults.status` is `ERROR` or `REJECTED` (case-insensitive) | `REJECTED` |
 * | 200/202 + non-empty error messages (top-level `errors` or `validationResults.errorMessages`) | `REJECTED` |
 * | 200/202 + NO clearedInvoice AND no errors AND no rejecting status | **Unhandled** |
 *
 * For unhandled 2xx responses this function throws {@link UnhandledClearanceResponseError}.
 * Callers MUST catch it and treat the outcome as ERROR — never as CLEARED.
 *
 * @param httpStatus - HTTP status code from the ZATCA API (0 for network errors)
 * @param rawBody - Raw response body string (may be JSON or plain text)
 * @returns A structured classification result
 * @throws {UnhandledClearanceResponseError} for ambiguous 2xx that can't be classified
 */
export function categorizeClearanceResponse(
  httpStatus: number,
  rawBody: string,
): ClearanceClassifyResult {
  // ── 5xx → ERROR (retryable, same ICV) ──
  if (httpStatus >= 500) {
    const errors = tryParseErrors(rawBody);
    return {
      category: 'ERROR',
      clearanceStatus: undefined,
      warnings: [],
      errors: errors.length > 0 ? errors : [`HTTP ${httpStatus}`],
      clearedXml: null,
      clearedInvoiceBase64: null,
    };
  }

  // ── 4xx → REJECTED (ICV burned, must reissue) ──
  if (httpStatus >= 400 && httpStatus < 500) {
    const errors = tryParseErrors(rawBody);
    return {
      category: 'REJECTED',
      clearanceStatus: undefined,
      warnings: [],
      errors: errors.length > 0 ? errors : [`HTTP ${httpStatus}`],
      clearedXml: null,
      clearedInvoiceBase64: null,
    };
  }

  // ── 2xx (200/202) → detailed body inspection ──
  if (httpStatus === 200 || httpStatus === 202) {
    return classify2xxResponse(httpStatus, rawBody);
  }

  // ── Unexpected HTTP status (e.g. 3xx) → ERROR ──
  const errors = tryParseErrors(rawBody);
  return {
    category: 'ERROR',
    clearanceStatus: undefined,
    warnings: [],
    errors: errors.length > 0 ? errors : [`HTTP ${httpStatus}`],
    clearedXml: null,
    clearedInvoiceBase64: null,
  };
}

// ── Convert category to ZatcaClearanceStatus ──────────────────────────────────

export function categoryToClearanceStatus(category: ClearanceCategory): ZatcaClearanceStatus {
  switch (category) {
    case 'CLEARED':
      return 'CLEARED';
    case 'REJECTED':
      return 'REJECTED';
    case 'ERROR':
      return 'ERROR';
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

function classify2xxResponse(httpStatus: number, rawBody: string): ClearanceClassifyResult {
  let warnings: string[] = [];
  let errors: string[] = [];
  let clearanceStatus: string | undefined;
  let clearedInvoiceBase64: string | null = null;
  let clearedXml: string | null = null;
  let validationStatus: string | undefined;

  try {
    const json = JSON.parse(rawBody);

    // Extract explicit clearance status if present
    if (typeof json.clearanceStatus === 'string') {
      clearanceStatus = json.clearanceStatus;
    }

    // Extract warnings from multiple possible paths
    if (Array.isArray(json.warnings)) {
      warnings = json.warnings.map(extractMessage);
    } else if (json.validationResults?.warningMessages) {
      warnings = json.validationResults.warningMessages.map(extractMessage);
    }

    // Extract errors from multiple possible paths
    if (Array.isArray(json.errors)) {
      errors = json.errors.map(extractMessage);
    } else if (json.validationResults?.errorMessages) {
      errors = json.validationResults.errorMessages.map(extractMessage);
    }

    // Extract validation results status
    if (typeof json.validationResults?.status === 'string') {
      validationStatus = json.validationResults.status;
    }

    // Extract clearedInvoice (base64) if present
    if (json.clearedInvoice && typeof json.clearedInvoice === 'string') {
      clearedInvoiceBase64 = json.clearedInvoice;
      try {
        clearedXml = Buffer.from(json.clearedInvoice, 'base64').toString('utf8');
      } catch {
        // Decode failure — clearedXml stays null
      }
    }
  } catch {
    // Body is not valid JSON — can't classify; throw Unhandled
    throw new UnhandledClearanceResponseError(
      `Unhandled 2xx with non-JSON body: HTTP ${httpStatus}`,
    );
  }

  // ── Rule 1: clearedInvoice present → CLEARED ──
  if (clearedXml !== null) {
    return {
      category: 'CLEARED',
      clearanceStatus,
      warnings,
      errors,
      clearedXml,
      clearedInvoiceBase64,
    };
  }

  // ── Rule 2: clearanceStatus === 'CLEARED' → CLEARED ──
  if (clearanceStatus === 'CLEARED') {
    return {
      category: 'CLEARED',
      clearanceStatus,
      warnings,
      errors,
      clearedXml,
      clearedInvoiceBase64,
    };
  }

  // ── Rule 3: clearanceStatus present and ≠ CLEARED → REJECTED ──
  if (clearanceStatus !== undefined && clearanceStatus !== 'CLEARED') {
    return {
      category: 'REJECTED',
      clearanceStatus,
      warnings,
      errors,
      clearedXml: null,
      clearedInvoiceBase64: null,
    };
  }

  // ── Rule 4: validationResults.status is ERROR or REJECTED → REJECTED ──
  if (validationStatus) {
    const s = validationStatus.toUpperCase();
    if (s === 'ERROR' || s === 'REJECTED') {
      return {
        category: 'REJECTED',
        clearanceStatus,
        warnings,
        errors,
        clearedXml: null,
        clearedInvoiceBase64: null,
      };
    }
  }

  // ── Rule 5: non-empty error messages → REJECTED ──
  if (errors.length > 0) {
    return {
      category: 'REJECTED',
      clearanceStatus,
      warnings,
      errors,
      clearedXml: null,
      clearedInvoiceBase64: null,
    };
  }

  // ── Rule 6: NO clearedInvoice AND no errors AND no rejecting status → Unhandled ──
  throw new UnhandledClearanceResponseError(
    `Unhandled 2xx clearance response (HTTP ${httpStatus}): no clearedInvoice, no errors, no rejecting status`,
  );
}

/**
 * Try to extract error messages from a raw response body (JSON or plain text).
 */
function tryParseErrors(rawBody: string): string[] {
  try {
    const json = JSON.parse(rawBody);
    if (Array.isArray(json.errors)) {
      return json.errors.map(extractMessage);
    }
    if (json.validationResults?.errorMessages) {
      return json.validationResults.errorMessages.map(extractMessage);
    }
    if (typeof json.message === 'string') {
      return [json.message];
    }
    if (typeof json.errorMessage === 'string') {
      return [json.errorMessage];
    }
    return [];
  } catch {
    return [rawBody];
  }
}
