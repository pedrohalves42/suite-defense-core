import { ValueObject } from '../shared/ValueObject';
import { Result } from '../shared/Result';
import { InvalidArgumentError } from '../shared/DomainError';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class TenantId extends ValueObject<string> {
  static create(value: string): Result<TenantId, InvalidArgumentError> {
    if (!value || !UUID_REGEX.test(value)) {
      return Result.failure(new InvalidArgumentError('TenantId', 'Must be a valid UUID'));
    }
    return Result.success(new TenantId(value.toLowerCase()));
  }
}
