/**
 * 📊 Build Telemetry Tracker
 * Monitora performance e eventos de cada build em tempo real
 */

export interface BuildTelemetryEvent {
  build_id: string;
  step: string;
  status: 'started' | 'completed' | 'failed';
  duration_ms?: number;
  metadata?: Record<string, any>;
  error?: string;
}

export class BuildTelemetry {
  private buildId: string;
  private requestId: string;
  private startTime: number;
  private stepTimers: Map<string, number> = new Map();

  constructor(buildId: string, requestId: string) {
    this.buildId = buildId;
    this.requestId = requestId;
    this.startTime = Date.now();
  }

  /**
   * Inicia o timer de uma etapa
   */
  startStep(step: string, metadata?: Record<string, any>): void {
    const timestamp = Date.now();
    this.stepTimers.set(step, timestamp);
    
    console.log(JSON.stringify({
      type: 'telemetry',
      event: 'step_started',
      build_id: this.buildId,
      request_id: this.requestId,
      step,
      timestamp: new Date(timestamp).toISOString(),
      elapsed_ms: timestamp - this.startTime,
      metadata
    }));
  }

  /**
   * Finaliza o timer de uma etapa com sucesso
   */
  completeStep(step: string, metadata?: Record<string, any>): void {
    const endTime = Date.now();
    const startTime = this.stepTimers.get(step) || endTime;
    const duration = endTime - startTime;
    
    console.log(JSON.stringify({
      type: 'telemetry',
      event: 'step_completed',
      build_id: this.buildId,
      request_id: this.requestId,
      step,
      timestamp: new Date(endTime).toISOString(),
      duration_ms: duration,
      elapsed_ms: endTime - this.startTime,
      metadata
    }));
    
    this.stepTimers.delete(step);
  }

  /**
   * Marca uma etapa como falha
   */
  failStep(step: string, error: Error | string, metadata?: Record<string, any>): void {
    const endTime = Date.now();
    const startTime = this.stepTimers.get(step) || endTime;
    const duration = endTime - startTime;
    
    console.error(JSON.stringify({
      type: 'telemetry',
      event: 'step_failed',
      build_id: this.buildId,
      request_id: this.requestId,
      step,
      timestamp: new Date(endTime).toISOString(),
      duration_ms: duration,
      elapsed_ms: endTime - this.startTime,
      error: error instanceof Error ? error.message : error,
      error_stack: error instanceof Error ? error.stack : undefined,
      metadata
    }));
    
    this.stepTimers.delete(step);
  }

  /**
   * Log genérico de informação
   */
  info(message: string, metadata?: Record<string, any>): void {
    console.log(JSON.stringify({
      type: 'telemetry',
      event: 'info',
      build_id: this.buildId,
      request_id: this.requestId,
      message,
      timestamp: new Date().toISOString(),
      elapsed_ms: Date.now() - this.startTime,
      metadata
    }));
  }

  /**
   * Log de warning
   */
  warn(message: string, metadata?: Record<string, any>): void {
    console.warn(JSON.stringify({
      type: 'telemetry',
      event: 'warning',
      build_id: this.buildId,
      request_id: this.requestId,
      message,
      timestamp: new Date().toISOString(),
      elapsed_ms: Date.now() - this.startTime,
      metadata
    }));
  }

  /**
   * Log de erro
   */
  error(message: string, error?: Error | string, metadata?: Record<string, any>): void {
    console.error(JSON.stringify({
      type: 'telemetry',
      event: 'error',
      build_id: this.buildId,
      request_id: this.requestId,
      message,
      timestamp: new Date().toISOString(),
      elapsed_ms: Date.now() - this.startTime,
      error: error instanceof Error ? error.message : error,
      error_stack: error instanceof Error ? error.stack : undefined,
      metadata
    }));
  }

  /**
   * Finaliza o build com sucesso
   */
  completeBuild(metadata?: Record<string, any>): void {
    const totalDuration = Date.now() - this.startTime;
    
    console.log(JSON.stringify({
      type: 'telemetry',
      event: 'build_completed',
      build_id: this.buildId,
      request_id: this.requestId,
      timestamp: new Date().toISOString(),
      total_duration_ms: totalDuration,
      total_duration_sec: (totalDuration / 1000).toFixed(2),
      metadata
    }));
  }

  /**
   * Finaliza o build com falha
   */
  failBuild(error: Error | string, metadata?: Record<string, any>): void {
    const totalDuration = Date.now() - this.startTime;
    
    console.error(JSON.stringify({
      type: 'telemetry',
      event: 'build_failed',
      build_id: this.buildId,
      request_id: this.requestId,
      timestamp: new Date().toISOString(),
      total_duration_ms: totalDuration,
      total_duration_sec: (totalDuration / 1000).toFixed(2),
      error: error instanceof Error ? error.message : error,
      error_stack: error instanceof Error ? error.stack : undefined,
      metadata
    }));
  }
}
