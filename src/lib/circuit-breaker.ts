/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures by stopping requests to failing services
 */

import { logger } from './logger';

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Blocking requests due to failures
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

export interface CircuitBreakerOptions {
  failureThreshold: number;      // Number of failures before opening
  successThreshold: number;      // Number of successes to close from half-open
  timeout: number;               // Time in ms before attempting recovery
  name: string;                  // Circuit breaker identifier
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private nextAttempt: number = Date.now();
  private options: CircuitBreakerOptions;

  constructor(options: Partial<CircuitBreakerOptions> = {}) {
    this.options = {
      failureThreshold: options.failureThreshold ?? 5,
      successThreshold: options.successThreshold ?? 2,
      timeout: options.timeout ?? 60000, // 1 minute default
      name: options.name ?? 'default',
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        logger.warn('Circuit breaker is OPEN, rejecting request', {
          circuit: this.options.name,
          nextAttempt: new Date(this.nextAttempt).toISOString(),
        });
        throw new Error(`Circuit breaker ${this.options.name} is OPEN`);
      }
      // Transition to HALF_OPEN to test service
      this.state = CircuitState.HALF_OPEN;
      logger.info('Circuit breaker transitioning to HALF_OPEN', {
        circuit: this.options.name,
      });
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
        logger.info('Circuit breaker CLOSED after recovery', {
          circuit: this.options.name,
        });
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.options.timeout;
      this.successCount = 0;
      logger.warn('Circuit breaker opened from HALF_OPEN', {
        circuit: this.options.name,
        nextAttempt: new Date(this.nextAttempt).toISOString(),
      });
      return;
    }

    if (this.failureCount >= this.options.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.options.timeout;
      logger.error('Circuit breaker OPENED due to failures', {
        circuit: this.options.name,
        failures: this.failureCount,
        nextAttempt: new Date(this.nextAttempt).toISOString(),
      });
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    logger.info('Circuit breaker manually reset', {
      circuit: this.options.name,
    });
  }
}
