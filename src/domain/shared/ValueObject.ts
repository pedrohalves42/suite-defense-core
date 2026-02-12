/**
 * Base class for Value Objects in the domain layer.
 * Value Objects are immutable and compared by their value, not identity.
 */
export abstract class ValueObject<T> {
  protected readonly _value: T;

  protected constructor(value: T) {
    this._value = Object.freeze(value) as T;
  }

  get value(): T {
    return this._value;
  }

  equals(other: ValueObject<T>): boolean {
    if (other === null || other === undefined) return false;
    return JSON.stringify(this._value) === JSON.stringify(other._value);
  }

  toString(): string {
    return String(this._value);
  }
}
