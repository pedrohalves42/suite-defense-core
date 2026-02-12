import { describe, it, expect } from 'vitest';
import { Result } from '../shared/Result';
import { DomainError, InvalidArgumentError, BusinessRuleViolationError } from '../shared/DomainError';
import { DomainEventPublisher } from '../shared/DomainEvent';

describe('Result', () => {
  it('success holds value', () => {
    const r = Result.success(42);
    expect(r.isSuccess).toBe(true);
    expect(r.value).toBe(42);
  });

  it('failure holds error', () => {
    const r = Result.failure(new Error('fail'));
    expect(r.isFailure).toBe(true);
    expect(r.error.message).toBe('fail');
  });

  it('throws on invalid access', () => {
    expect(() => Result.success(1).error).toThrow();
    expect(() => Result.failure(new Error('x')).value).toThrow();
  });

  it('map transforms success', () => {
    const r = Result.success(2).map(v => v * 3);
    expect(r.value).toBe(6);
  });

  it('map passes through failure', () => {
    const r = Result.failure<number>(new Error('e')).map(v => v * 3);
    expect(r.isFailure).toBe(true);
  });

  it('flatMap chains results', () => {
    const r = Result.success(5).flatMap(v => Result.success(v + 1));
    expect(r.value).toBe(6);
  });

  it('getOrElse returns default on failure', () => {
    expect(Result.failure<number>(new Error('e')).getOrElse(99)).toBe(99);
    expect(Result.success(1).getOrElse(99)).toBe(1);
  });
});

describe('DomainError', () => {
  it('creates base error', () => {
    const e = new DomainError('msg', 'CODE');
    expect(e.code).toBe('CODE');
    expect(e.message).toBe('msg');
  });

  it('InvalidArgumentError', () => {
    const e = new InvalidArgumentError('field', 'reason');
    expect(e.code).toBe('INVALID_ARGUMENT');
    expect(e.message).toContain('field');
  });

  it('BusinessRuleViolationError', () => {
    const e = new BusinessRuleViolationError('rule');
    expect(e.code).toBe('BUSINESS_RULE_VIOLATION');
  });
});

describe('DomainEventPublisher', () => {
  it('publishes to subscribers', () => {
    DomainEventPublisher.clear();
    const received: string[] = [];
    DomainEventPublisher.subscribe('test', (e) => received.push(e.aggregateId));
    DomainEventPublisher.publish({ eventType: 'test', occurredOn: new Date(), aggregateId: 'abc' });
    expect(received).toEqual(['abc']);
  });

  it('clear removes all handlers', () => {
    DomainEventPublisher.clear();
    const received: string[] = [];
    DomainEventPublisher.subscribe('test', (e) => received.push(e.aggregateId));
    DomainEventPublisher.clear();
    DomainEventPublisher.publish({ eventType: 'test', occurredOn: new Date(), aggregateId: 'abc' });
    expect(received).toEqual([]);
  });
});
