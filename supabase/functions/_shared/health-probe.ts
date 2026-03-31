import { logger } from "./logger.ts";
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

/**
 * Edge Function Health Probe
 * 
 * CSA-FH Phase 3 - Production Hardening
 */

// Current Edge Function version - updated on each deployment
export const EDGE_VERSION = '2026.01.14.1';

// Build timestamp for tracking
export const EDGE_BUILD_TIMESTAMP = new Date().toISOString();

// Critical tables that must exist for Edge Functions to operate
const CRITICAL_TABLES = ['audit_logs', 'system_alerts', 'agents', 'tenants'];

// Schema validation cache (5 minutes)
let schemaValidationCache: { valid: boolean; timestamp: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function isEmergencyMode(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('is_emergency_mode');
    if (error) {
      logger.error('[health-probe] Failed to check emergency mode:', error);
      return false;
    }
    return Boolean(data);
  } catch (err) {
    logger.error('[health-probe] Emergency mode check exception:', err);
    return false;
  }
}

export async function getSystemMode(supabase: SupabaseClient): Promise<string> {
  try {
    const { data, error } = await supabase.rpc('get_system_mode_safe');
    if (error) {
      logger.error('[health-probe] Failed to get system mode:', error);
      return 'unknown';
    }
    return data as string || 'unknown';
  } catch (err) {
    logger.error('[health-probe] System mode check exception:', err);
    return 'unknown';
  }
}

export async function validateSchema(supabase: SupabaseClient): Promise<{
  valid: boolean;
  missingTables: string[];
}> {
  if (schemaValidationCache && (Date.now() - schemaValidationCache.timestamp) < CACHE_TTL_MS) {
    return { valid: schemaValidationCache.valid, missingTables: [] };
  }
  
  const missingTables: string[] = [];
  
  for (const table of CRITICAL_TABLES) {
    try {
      const { error } = await supabase.from(table).select('id').limit(1);
      if (error && error.message.includes('does not exist')) {
        missingTables.push(table);
      }
    } catch (err) {
      logger.warn('[health-probe] Table check failed', { table, err });
      missingTables.push(table);
    }
  }
  
  const valid = missingTables.length === 0;
  schemaValidationCache = { valid, timestamp: Date.now() };
  
  return { valid, missingTables };
}

export async function validateSystemReady(supabase: SupabaseClient): Promise<void> {
  const emergency = await isEmergencyMode(supabase);
  if (emergency) {
    throw new Error('EMERGENCY_MODE_ACTIVE');
  }
  const schema = await validateSchema(supabase);
  if (!schema.valid) {
    throw new Error(`SCHEMA_DRIFT: ${schema.missingTables.join(', ')}`);
  }
}

export function emergencyModeResponse(headers: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({
      error: 'SYSTEM_EMERGENCY_MODE',
      message: 'System is in emergency mode. Please try again later.',
      retry_after: 300,
    }),
    {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': '300',
        'X-Edge-Version': EDGE_VERSION,
        ...headers,
      },
    }
  );
}

export function schemaDriftResponse(missingTables: string[], headers: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({
      error: 'SCHEMA_DRIFT',
      message: 'System configuration error. Please contact support.',
      details: { missing_tables: missingTables },
    }),
    {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': '60',
        'X-Edge-Version': EDGE_VERSION,
        ...headers,
      },
    }
  );
}

export function addHealthHeaders(headers: Record<string, string>): Record<string, string> {
  return {
    ...headers,
    'X-Edge-Version': EDGE_VERSION,
    'X-Build-Timestamp': EDGE_BUILD_TIMESTAMP,
  };
}

export async function healthProbeMiddleware(
  supabase: SupabaseClient,
  corsHeaders: Record<string, string>
): Promise<Response | null> {
  const emergency = await isEmergencyMode(supabase);
  if (emergency) {
    logger.warn('[health-probe] System in emergency mode, returning 503');
    return emergencyModeResponse(corsHeaders);
  }
  const schema = await validateSchema(supabase);
  if (!schema.valid) {
    logger.error('[health-probe] Schema drift detected:', schema.missingTables);
    return schemaDriftResponse(schema.missingTables, corsHeaders);
  }
  return null;
}

export async function updateJobHeartbeat(
  supabase: SupabaseClient,
  jobKey: string,
  expectedInterval: string = '5 minutes'
): Promise<void> {
  try {
    await supabase.rpc('update_job_heartbeat', {
      p_job_key: jobKey,
      p_expected_interval: expectedInterval,
    });
  } catch (err) {
    logger.error('[health-probe] Failed to update job heartbeat:', err);
  }
}
