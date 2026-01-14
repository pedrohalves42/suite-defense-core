import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseUrl, getAnonKey } from './supabase';

/**
 * Check if the system is in emergency mode using the RPC
 */
export async function isEmergencyMode(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_emergency_mode');
  
  if (error) {
    console.error('Failed to check emergency mode:', error);
    return false;
  }
  
  return Boolean(data);
}

/**
 * Get the current system mode
 */
export async function getSystemMode(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc('get_system_mode_safe');
  
  if (error) {
    console.error('Failed to get system mode:', error);
    return 'unknown';
  }
  
  return data as string;
}

/**
 * Call an edge function and check if it respects emergency mode
 * Returns true if the function correctly returns 503 in emergency mode
 */
export async function edgeFunctionRespectsEmergency(
  functionName: string,
  payload: Record<string, unknown> = {}
): Promise<{ status: number; respectsEmergency: boolean }> {
  const url = `${getSupabaseUrl()}/functions/v1/${functionName}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAnonKey()}`,
        'apikey': getAnonKey()
      },
      body: JSON.stringify(payload)
    });

    const status = response.status;
    
    // In emergency mode, functions should return 503
    // This function just returns the status - the test decides what's expected
    return {
      status,
      respectsEmergency: status === 503
    };
  } catch (error) {
    console.error(`Failed to call ${functionName}:`, error);
    return {
      status: 0,
      respectsEmergency: false
    };
  }
}

/**
 * Test multiple edge functions for emergency mode compliance
 */
export async function testEmergencyCompliance(
  functions: string[]
): Promise<{ function: string; status: number; compliant: boolean }[]> {
  const results = await Promise.all(
    functions.map(async (fn) => {
      const result = await edgeFunctionRespectsEmergency(fn);
      return {
        function: fn,
        status: result.status,
        compliant: result.respectsEmergency
      };
    })
  );
  
  return results;
}
