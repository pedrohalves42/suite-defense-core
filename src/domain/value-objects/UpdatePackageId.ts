import { ValueObject } from '../shared/ValueObject';
import { Result } from '../shared/Result';
import { InvalidArgumentError } from '../shared/DomainError';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class UpdatePackageId extends ValueObject<string> {
  static create(value: string): Result<UpdatePackageId, InvalidArgumentError> {
    if (!value || !UUID_REGEX.test(value)) {
      return Result.failure(new InvalidArgumentError('UpdatePackageId', 'Must be a valid UUID'));
    }
    return Result.success(new UpdatePackageId(value.toLowerCase()));
  }

  static generate(): UpdatePackageId {
    return new UpdatePackageId(crypto.randomUUID());
  }
}
