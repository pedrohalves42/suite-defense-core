import { ValueObject } from '../shared/ValueObject';
import { Result } from '../shared/Result';
import { InvalidArgumentError } from '../shared/DomainError';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class JobId extends ValueObject<string> {
  static create(value: string): Result<JobId, InvalidArgumentError> {
    if (!value || !UUID_REGEX.test(value)) {
      return Result.failure(new InvalidArgumentError('JobId', 'Must be a valid UUID'));
    }
    return Result.success(new JobId(value.toLowerCase()));
  }

  static generate(): JobId {
    return new JobId(crypto.randomUUID());
  }
}
