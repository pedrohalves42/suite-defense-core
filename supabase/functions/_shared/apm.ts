/**
 * Application Performance Monitoring (APM) Utility
 * Records performance metrics for Edge Functions and operations
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from './logger.ts';

export interface APMMetric {
  function_name: string;
  operation_type: 'edge_function' | 'database_query' | 'external_api';
  duration_ms: number;
  status_code?: number;
  error_message?: string;
  metadata?: Record<string, any>;
  tenant_id?: string;
}

/**
 * Records a performance metric to the database
 */
export async function recordMetric(metric: APMMetric): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      logger.warn('APM disabled: missing Supabase credentials');
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error } = await supabase
      .from('performance_metrics')
      .insert({
        tenant_id: metric.tenant_id || null,
        function_name: metric.function_name,
        operation_type: metric.operation_type,
        duration_ms: metric.duration_ms,
        status_code: metric.status_code,
        error_message: metric.error_message,
        metadata: metric.metadata || {},
      });

    if (error) {
      logger.error('Failed to record APM metric', error);
    }
  } catch (err) {
    // Don't let APM failures break the main function
    logger.error('APM recording failed', err);
  }
}

/**
 * Wraps an async function with performance monitoring
 */
export async function withAPM<T>(
  functionName: string,
  operationType: APMMetric['operation_type'],
  fn: () => Promise<T>,
  options: { tenantId?: string; metadata?: Record<string, any> } = {}
): Promise<T> {
  const startTime = Date.now();
  let statusCode: number | undefined;
  let errorMessage: string | undefined;

  try {
    const result = await fn();
    statusCode = 200;
    return result;
  } catch (error) {
    statusCode = 500;
    errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw error;
  } finally {
    const duration = Date.now() - startTime;

    // Record metric asynchronously (don't block response)
    recordMetric({
      function_name: functionName,
      operation_type: operationType,
      duration_ms: duration,
      status_code: statusCode,
      error_message: errorMessage,
      tenant_id: options.tenantId,
      metadata: options.metadata,
    }).catch(() => {
      // Silent fail - APM should never break main logic
    });

    // Log warning for slow operations
    if (duration > 2000) {
      logger.warn(`Slow operation detected: ${functionName}`, {
        duration_ms: duration,
        operation_type: operationType,
      });
    }
  }
}
