import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { loggerWithContext } from '../_shared/logger.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';

/**
 * Auto-Renew Enrollment Keys
 * 
 * Scheduled function that runs every 30 minutes to check for tenants
 * without active enrollment keys and automatically generates new ones.
 */

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const log = loggerWithContext(requestId);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // V-1119: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req);
  if (authError) return authError;

  try {
    log.info('Starting auto-renew enrollment keys check');

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Find tenants without active enrollment keys using direct query
    log.info('Querying for tenants without active enrollment keys');
    
    // Get all tenants
    const { data: allTenants, error: tenantsError } = await supabaseAdmin
      .from('tenants')
      .select('id, name');

    if (tenantsError) {
      log.error('Failed to fetch tenants', tenantsError);
      throw new Error('Failed to fetch tenants');
    }

    // Get tenants with active keys (not expired and with available uses)
    const { data: tenantsWithActiveKeys, error: activeKeysError } = await supabaseAdmin
      .from('enrollment_keys')
      .select('tenant_id')
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString());

    if (activeKeysError) {
      log.error('Failed to fetch active keys', activeKeysError);
      throw new Error('Failed to fetch active keys');
    }

    const tenantsWithKeysSet = new Set(tenantsWithActiveKeys?.map(k => k.tenant_id) || []);
    const orphanTenants = (allTenants || []).filter(t => !tenantsWithKeysSet.has(t.id));

    log.info('Tenants without active keys', { count: orphanTenants.length });

    if (orphanTenants.length === 0) {
      log.success('All tenants have active enrollment keys');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'All tenants have active enrollment keys',
          tenantsChecked: 0,
          keysGenerated: 0,
          timestamp: new Date().toISOString(),
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Generate keys for orphan tenants
    const results: { tenantId: string; tenantName: string; success: boolean; error?: string }[] = [];

    for (const tenant of orphanTenants) {
      try {
        // Generate key in format XXXX-XXXX-XXXX-XXXX (cryptographically secure)
        const enrollmentKey = generateSecureKey();
        
        // Calculate SHA-256 hash - SEC-001: never store plaintext
        const keyHash = await hashKey(enrollmentKey);
        
        // Set expiration to 30 days from now
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        // Insert the new key
        const { data: keyData, error: insertError } = await supabaseAdmin
          .from('enrollment_keys')
          .insert({
            key_hash: keyHash,
            tenant_id: tenant.id,
            expires_at: expiresAt,
            max_uses: 100,
            current_uses: 0,
            is_active: true,
            description: `[AUTO] Chave gerada automaticamente - todas as chaves anteriores expiraram`,
            created_by: null, // System-generated
          })
          .select('id')
          .single();

        if (insertError) {
          log.error(`Failed to create key for tenant ${tenant.id}`, insertError);
          results.push({ 
            tenantId: tenant.id, 
            tenantName: tenant.name, 
            success: false, 
            error: insertError.message 
          });
          continue;
        }

        // Create audit log entry
        await supabaseAdmin.from('audit_logs').insert({
          user_id: null,
          action: 'auto_renew_enrollment_key',
          resource_type: 'enrollment_key',
          resource_id: keyData.id,
          tenant_id: tenant.id,
          details: {
            reason: 'all_keys_expired',
            expires_at: expiresAt,
            max_uses: 100,
            auto_generated: true,
          },
          success: true,
        });

        // Create security log for admin notification
        await supabaseAdmin.from('security_logs').insert({
          tenant_id: tenant.id,
          event_type: 'enrollment_key_auto_renewed',
          severity: 'info',
          description: `Nova chave de enrollment gerada automaticamente para tenant ${tenant.name}`,
          details: {
            tenant_name: tenant.name,
            new_key_expires_at: expiresAt,
            key_id: keyData.id,
            reason: 'Todas as chaves anteriores expiraram',
          },
          source_ip: '0.0.0.0',
        });

        log.success(`Auto-generated key for tenant ${tenant.name}`, { 
          tenantId: tenant.id, 
          keyId: keyData.id,
          expiresAt 
        });

        results.push({ 
          tenantId: tenant.id, 
          tenantName: tenant.name, 
          success: true 
        });

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        log.error(`Error processing tenant ${tenant.id}`, err);
        results.push({ 
          tenantId: tenant.id, 
          tenantName: tenant.name, 
          success: false, 
          error: errorMessage 
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    log.timed('Auto-renew enrollment keys completed', {
      tenantsChecked: orphanTenants.length,
      keysGenerated: successCount,
      failures: failCount,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Auto-renewal completed: ${successCount} keys generated, ${failCount} failures`,
        tenantsChecked: orphanTenants.length,
        keysGenerated: successCount,
        failures: failCount,
        details: results,
        timestamp: new Date().toISOString(),
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    log.error('Auto-renew enrollment keys failed', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

/**
 * Generate a cryptographically secure key in format XXXX-XXXX-XXXX-XXXX
 */
function generateSecureKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const segments: string[] = [];
  
  for (let i = 0; i < 4; i++) {
    const randomBytes = new Uint8Array(4);
    crypto.getRandomValues(randomBytes);
    
    let segment = '';
    for (let j = 0; j < 4; j++) {
      segment += chars[randomBytes[j] % chars.length];
    }
    segments.push(segment);
  }
  
  return segments.join('-');
}

/**
 * Calculate SHA-256 hash of the key
 * SEC-001: Never store plaintext keys
 */
async function hashKey(key: string): Promise<string> {
  const keyHashBuffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(key)
  );
  
  return Array.from(new Uint8Array(keyHashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
