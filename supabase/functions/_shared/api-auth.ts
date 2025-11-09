import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

export interface ApiAuthResult {
  success: boolean;
  tenantId?: string;
  apiKeyId?: string;
  scopes?: string[];
  error?: string;
}

/**
 * Authenticates API requests using API key
 * Returns tenant_id if authentication is successful
 */
export async function authenticateApiKey(
  apiKey: string,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<ApiAuthResult> {
  if (!apiKey || !apiKey.startsWith('sk_')) {
    return { success: false, error: 'Invalid API key format' };
  }

  const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Hash the API key (in production, use proper hashing)
    // For MVP, we're using simple hash
    const encoder = new TextEncoder();
    const data = encoder.encode(apiKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Look up API key
    const { data: apiKeyData, error: keyError } = await supabase
      .from('api_keys')
      .select('id, tenant_id, scopes, is_active, expires_at')
      .eq('key_hash', keyHash)
      .maybeSingle();

    if (keyError) {
      console.error('Error looking up API key:', keyError);
      return { success: false, error: 'Invalid API key' };
    }

    if (!apiKeyData) {
      return { success: false, error: 'Invalid API key' };
    }

    if (!apiKeyData.is_active) {
      return { success: false, error: 'API key is inactive' };
    }

    if (apiKeyData.expires_at && new Date(apiKeyData.expires_at) < new Date()) {
      return { success: false, error: 'API key has expired' };
    }

    // Update last_used_at
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', apiKeyData.id);

    return {
      success: true,
      tenantId: apiKeyData.tenant_id,
      apiKeyId: apiKeyData.id,
      scopes: apiKeyData.scopes,
    };
  } catch (error) {
    console.error('Error authenticating API key:', error);
    return { success: false, error: 'Authentication failed' };
  }
}

/**
 * Checks if the API key has the required scope
 */
export function hasScope(scopes: string[], requiredScope: string): boolean {
  return scopes.includes('admin') || scopes.includes(requiredScope);
}

/**
 * Logs API request for analytics and monitoring
 */
export async function logApiRequest(
  supabase: SupabaseClient,
  {
    apiKeyId,
    tenantId,
    endpoint,
    method,
    statusCode,
    responseTimeMs,
    ipAddress,
    userAgent,
  }: {
    apiKeyId: string;
    tenantId: string;
    endpoint: string;
    method: string;
    statusCode: number;
    responseTimeMs: number;
    ipAddress?: string;
    userAgent?: string;
  }
) {
  try {
    await supabase.from('api_request_logs').insert({
      api_key_id: apiKeyId,
      tenant_id: tenantId,
      endpoint,
      method,
      status_code: statusCode,
      response_time_ms: responseTimeMs,
      ip_address: ipAddress,
      user_agent: userAgent,
    });
  } catch (error) {
    console.error('Error logging API request:', error);
  }
}
