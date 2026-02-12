import { ValueObject } from '../shared/ValueObject';
import { Result } from '../shared/Result';
import { InvalidArgumentError } from '../shared/DomainError';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class JobExecutionId extends ValueObject<string> {
  static create(value: string): Result<JobExecutionId, InvalidArgumentError> {
    if (!value || !UUID_REGEX.test(value)) {
      return Result.failure(new InvalidArgumentError('JobExecutionId', 'Must be a valid UUID'));
    }
    return Result.success(new JobExecutionId(value.toLowerCase()));
  }

  static generate(): JobExecutionId {
    return new JobExecutionId(crypto.randomUUID());
  }
}
