/**
 * Structured error classes for CyberShield
 * Replaces generic Error throws with typed, actionable errors.
 * Each error carries a code, HTTP status, and optional context for observability.
 */

/** Structured context attached to errors for observability and debugging. */
export type ErrorContext = Record<string, unknown>;

/** Serialized error shape returned by toJSON(). */
export interface SerializedError {
  name: string;
  code: string;
  message: string;
  status: number;
  timestamp: string;
  context?: ErrorContext;
}

export class CyberShieldError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly context?: ErrorContext;
  public readonly timestamp: string;

  constructor(
    message: string,
    code: string = 'CYBERSHIELD_ERROR',
    status: number = 500,
    context?: ErrorContext
  ) {
    super(message);
    this.name = 'CyberShieldError';
    this.code = code;
    this.status = status;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }

  toJSON(): SerializedError {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      status: this.status,
      timestamp: this.timestamp,
      context: this.context,
    };
  }
}

export class ValidationError extends CyberShieldError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'VALIDATION_ERROR', 400, context);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends CyberShieldError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTH_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends CyberShieldError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'FORBIDDEN', 403);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends CyberShieldError {
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} with id ${id} not found` : `${resource} not found`,
      'NOT_FOUND',
      404,
      { resource, id }
    );
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends CyberShieldError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'CONFLICT', 409, context);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends CyberShieldError {
  public readonly retryAfter: number;

  constructor(retryAfter: number = 60) {
    super('Rate limit exceeded. Please try again later.', 'RATE_LIMIT', 429, { retryAfter });
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class TenantIsolationError extends CyberShieldError {
  constructor(message: string = 'Tenant isolation violation detected') {
    super(message, 'TENANT_ISOLATION', 403);
    this.name = 'TenantIsolationError';
  }
}

/**
 * Type guard to check if an error is a CyberShieldError
 */
export function isCyberShieldError(error: unknown): error is CyberShieldError {
  return error instanceof CyberShieldError;
}

/**
 * Extract a user-friendly message from any error
 */
export function getUserFriendlyMessage(error: unknown): string {
  if (isCyberShieldError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred. Please try again.';
}
