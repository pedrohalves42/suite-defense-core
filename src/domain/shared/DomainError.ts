/**
 * Base error class for domain-level errors.
 * Domain errors represent business rule violations.
 */
export class DomainError extends Error {
  public readonly code: string;

  constructor(message: string, code: string = 'DOMAIN_ERROR') {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

export class InvalidArgumentError extends DomainError {
  constructor(argument: string, reason: string) {
    super(`Invalid ${argument}: ${reason}`, 'INVALID_ARGUMENT');
    this.name = 'InvalidArgumentError';
  }
}

export class BusinessRuleViolationError extends DomainError {
  constructor(rule: string) {
    super(`Business rule violation: ${rule}`, 'BUSINESS_RULE_VIOLATION');
    this.name = 'BusinessRuleViolationError';
  }
}
