/**
 * Application-level error for use cases.
 * Distinct from DomainError to separate domain invariant violations
 * from application orchestration failures.
 */
export class ApplicationError extends Error {
  public readonly code: string;

  constructor(message: string, code: string = 'APPLICATION_ERROR') {
    super(message);
    this.name = 'ApplicationError';
    this.code = code;
  }
}
