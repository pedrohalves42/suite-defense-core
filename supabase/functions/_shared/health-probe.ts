import { logger } from "./logger.ts";
/**
 * Edge Function Health Probe
 * 
 * CSA-FH Phase 3 - Production Hardening
 * 
 * Provides:
 * - Edge version tracking
 * - Emergency mode detection
 * - Schema drift validation
 * - Unified health check
 */

// Use 'any' to avoid version conflicts between different edge functions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

// Current Edge Function version - updated on each deployment
export const EDGE_VERSION = '2026.01.14.1';

// Build timestamp for tracking
export const EDGE_BUILD_TIMESTAMP = new Date().toISOString();

// Critical tables that must exist for Edge Functions to operate
const CRITICAL_TABLES = ['audit_logs', 'system_alerts', 'agents', 'tenants'];

// Schema validation cache (5 minutes)
let schemaValidationCache: { valid: boolean; timestamp: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Check if system is in emergency mode via RPC
 * Returns true if emergency mode is active
 */
export async function isEmergencyMode(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('is_emergency_mode');
    
    if (error) {
      logger.error('[health-probe] Failed to check emergency mode:', error);
      // Fail open - don't block if we can't check
      return false;
    }
    
    return Boolean(data);
  } catch (err) {
    logger.error('[health-probe] Emergency mode check exception:', err);
    return false;
  }
}

/**
 * Get current system mode
 */
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

/**
 * Validate critical schema tables exist
 * Uses caching to avoid repeated queries
 */
export async function validateSchema(supabase: SupabaseClient): Promise<{
  valid: boolean;
  missingTables: string[];
}> {
  // Check cache
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
    } catch {
      missingTables.push(table);
    }
  }
  
  const valid = missingTables.length === 0;
  schemaValidationCache = { valid, timestamp: Date.now() };
  
  return { valid, missingTables };
}

/**
 * Full system readiness check
 * Throws if system is not ready to handle requests
 */
export async function validateSystemReady(supabase: SupabaseClient): Promise<void> {
  // Check emergency mode
  const emergency = await isEmergencyMode(supabase);
  if (emergency) {
    throw new Error('EMERGENCY_MODE_ACTIVE');
  }
  
  // Validate schema
  const schema = await validateSchema(supabase);
  if (!schema.valid) {
    throw new Error(`SCHEMA_DRIFT: ${schema.missingTables.join(', ')}`);
  }
}

/**
 * Create emergency mode response (503)
 */
export function emergencyModeResponse(headers: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({
      error: 'SYSTEM_EMERGENCY_MODE',
      message: 'System is in emergency mode. Please try again later.',
      retry_after: 300, // 5 minutes
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

/**
 * Create schema drift response (503)
 */
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

/**
 * Add health headers to response
 */
export function addHealthHeaders(headers: Record<string, string>): Record<string, string> {
  return {
    ...headers,
    'X-Edge-Version': EDGE_VERSION,
    'X-Build-Timestamp': EDGE_BUILD_TIMESTAMP,
  };
}

/**
 * Health probe middleware
 * Use at the start of Edge Functions to validate system state
 */
export async function healthProbeMiddleware(
  supabase: SupabaseClient,
  corsHeaders: Record<string, string>
): Promise<Response | null> {
  // Check emergency mode
  const emergency = await isEmergencyMode(supabase);
  if (emergency) {
    logger.warn('[health-probe] System in emergency mode, returning 503');
    return emergencyModeResponse(corsHeaders);
  }
  
  // Validate schema
  const schema = await validateSchema(supabase);
  if (!schema.valid) {
    logger.error('[health-probe] Schema drift detected:', schema.missingTables);
    return schemaDriftResponse(schema.missingTables, corsHeaders);
  }
  
  // System ready
  return null;
}

/**
 * Update job heartbeat for cron silence detection
 */
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
