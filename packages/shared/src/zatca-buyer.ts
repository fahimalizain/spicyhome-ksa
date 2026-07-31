import { z } from 'zod';

/**
 * Zod schema for ZATCA standard invoice buyer details.
 *
 * Validates the 8 buyer fields required for ZATCA B2B standard invoices.
 * Used by both the server (pay validation) and POS (form validation).
 */
export const zatcaBuyerDetailsSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(255),
  vatNumber: z
    .string()
    .trim()
    .regex(/^\d{15}$/, 'vatNumber must be exactly 15 digits'),
  street: z.string().trim().min(1, 'street is required').max(255),
  buildingNumber: z.string().trim().min(1, 'buildingNumber is required').max(50),
  citySubdivision: z.string().trim().min(1, 'citySubdivision is required').max(255),
  city: z.string().trim().min(1, 'city is required').max(255),
  postalCode: z.string().trim().min(1, 'postalCode is required').max(20),
  country: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, 'country must be a 2-letter ISO code')
    .transform((c) => c.toUpperCase())
    .default('SA'),
});

export type ZatcaBuyerDetails = z.infer<typeof zatcaBuyerDetailsSchema>;

/**
 * Parse unknown JSON (string or object) into ZatcaBuyerDetails.
 * Accepts a JSON string or a plain object.
 * Returns success/data or failure/error.
 */
export function parseZatcaBuyerDetails(
  input: unknown,
): { success: true; data: ZatcaBuyerDetails } | { success: false; error: z.ZodError } {
  let parsed = input;

  // If input is a string (JSON blob from DB), try to JSON.parse
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input);
    } catch {
      return {
        success: false,
        error: new z.ZodError([
          {
            code: z.ZodIssueCode.custom,
            message: 'Invalid JSON string',
            path: [],
          } as z.ZodIssue,
        ]),
      };
    }
  }

  const result = zatcaBuyerDetailsSchema.safeParse(parsed);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Strict parse; throws ZodError or Error with readable message.
 * Use this when you must have valid data (e.g. XML builder for ZATCA).
 */
export function requireZatcaBuyerDetails(input: unknown): ZatcaBuyerDetails {
  const result = parseZatcaBuyerDetails(input);
  if (result.success) {
    return result.data;
  }
  throw result.error;
}

/**
 * Format a ZodError into a field→message record for UI error display.
 * Uses the last path segment as the field key (e.g. "name", "vatNumber").
 */
export function formatZatcaBuyerDetailsErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path.length > 0 ? String(issue.path[issue.path.length - 1]) : '_root';
    if (!errors[field]) {
      errors[field] = issue.message;
    }
  }
  return errors;
}
