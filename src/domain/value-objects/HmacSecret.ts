import { ValueObject } from '../shared/ValueObject';
import { Result } from '../shared/Result';
import { InvalidArgumentError } from '../shared/DomainError';

const HEX_REGEX = /^[0-9a-f]{64}$/i;

/**
 * HmacSecret Value Object.
 * Represents a 256-bit HMAC shared secret stored as hex string.
 */
export class HmacSecret extends ValueObject<string> {
  static create(value: string): Result<HmacSecret, InvalidArgumentError> {
    if (!value || !HEX_REGEX.test(value)) {
      return Result.failure(
        new InvalidArgumentError('HmacSecret', 'Must be a 64-character hex string')
      );
    }
    return Result.success(new HmacSecret(value.toLowerCase()));
  }

  static generate(): HmacSecret {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return new HmacSecret(hex);
  }
}
