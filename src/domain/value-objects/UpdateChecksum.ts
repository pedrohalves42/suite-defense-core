import { ValueObject } from '../shared/ValueObject';
import { Result } from '../shared/Result';
import { InvalidArgumentError } from '../shared/DomainError';

const SHA256_REGEX = /^[a-f0-9]{64}$/i;

export class UpdateChecksum extends ValueObject<string> {
  static create(checksum: string): Result<UpdateChecksum, InvalidArgumentError> {
    if (!checksum || !SHA256_REGEX.test(checksum)) {
      return Result.failure(new InvalidArgumentError('UpdateChecksum', 'Must be a valid SHA-256 hex string (64 chars)'));
    }
    return Result.success(new UpdateChecksum(checksum.toLowerCase()));
  }

  matches(other: UpdateChecksum): boolean {
    return this._value === other._value;
  }
}
