/**
 * Classes de erro padronizadas para toda a plataforma
 * Usar em vez de throw new Error()
 */

export class CyberShieldError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number = 500,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'CyberShieldError';
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        status: this.status,
        ...(this.context && { context: this.context }),
      },
    };
  }
}

export class AuthenticationError extends CyberShieldError {
  constructor(message = 'Authentication required') {
    super(message, 'AUTH_REQUIRED', 401);
  }
}

export class AuthorizationError extends CyberShieldError {
  constructor(message = 'Insufficient permissions') {
    super(message, 'FORBIDDEN', 403);
  }
}

export class NotFoundError extends CyberShieldError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404);
  }
}

export class ValidationError extends CyberShieldError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, context);
  }
}

export class RateLimitError extends CyberShieldError {
  constructor(public retryAfter: number) {
    super('Rate limit exceeded', 'RATE_LIMIT_EXCEEDED', 429);
  }
}

export class ConflictError extends CyberShieldError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
  }
}

export class InternalError extends CyberShieldError {
  constructor(message = 'Internal server error') {
    super(message, 'INTERNAL_ERROR', 500);
  }
}
