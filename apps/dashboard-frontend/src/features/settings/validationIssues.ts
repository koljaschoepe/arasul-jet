import type { ApiError } from '@/hooks/useApi';

/** A single field-level validation issue from a backend ValidationError. */
export interface ValidationIssue {
  path: string;
  message: string;
  code?: string;
}

/**
 * Extract structured field-level issues from a normalized ApiError.
 * The backend ValidationError carries `details = { code, source, issues }`
 * (see middleware/validate.js); useApi surfaces it as `error.details`.
 * Returns an empty array for non-validation errors.
 */
export function extractIssues(error: unknown): ValidationIssue[] {
  const details = (error as ApiError | undefined)?.details;
  if (
    details &&
    typeof details === 'object' &&
    Array.isArray((details as { issues?: unknown }).issues)
  ) {
    return (details as { issues: ValidationIssue[] }).issues;
  }
  return [];
}
