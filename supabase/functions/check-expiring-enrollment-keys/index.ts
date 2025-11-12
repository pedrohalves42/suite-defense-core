import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Buscar keys expirando em 1 hora que não foram notificadas
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const { data: expiringKeys, error } = await supabaseClient
      .from('enrollment_keys')
      .select(`
        id,
        key,
        expires_at,
        created_at,
        description,
        tenants!inner(id, name, owner_user_id)
      `)
      .lt('expires_at', oneHourFromNow)
      .gt('expires_at', now)
      .is('expiration_notified_at', null)
      .eq('is_active', true);

    if (error) throw error;

    if (!expiringKeys || expiringKeys.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          keys_checked: 0,
          notifications_sent: 0,
          message: 'Nenhuma key expirando encontrada'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let notificationsSent = 0;

    // Agrupar keys por tenant
    const keysByTenant = expiringKeys.reduce((acc: any, key: any) => {
      const tenantId = key.tenants.id;
      if (!acc[tenantId]) {
        acc[tenantId] = {
          tenant: key.tenants,
          keys: []
        };
      }
      acc[tenantId].keys.push(key);
      return acc;
    }, {});

    // Para cada tenant, buscar admins e criar log de notificação
    for (const [tenantId, data] of Object.entries(keysByTenant) as [string, any][]) {
      const { tenant, keys } = data;

      // Buscar admins do tenant
      const { data: admins } = await supabaseClient
        .from('user_roles')
        .select('user_id, profiles!inner(user_id, full_name)')
        .eq('tenant_id', tenantId)
        .eq('role', 'admin');

      if (!admins || admins.length === 0) continue;

      // Log para tracking
      console.log(`[EXPIRATION ALERT] Tenant: ${tenant.name}, Keys expiring: ${keys.length}, Admins: ${admins.length}`);
      
      // Criar log de segurança para cada admin
      for (const admin of admins) {
        await supabaseClient
          .from('security_logs')
          .insert({
            tenant_id: tenantId,
            event_type: 'enrollment_key_expiring',
            severity: 'warning',
            user_id: admin.user_id,
            details: {
              keys_expiring: keys.length,
              keys: keys.map((k: any) => ({
                id: k.id,
                key: k.key.substring(0, 8) + '...',
                description: k.description,
                expires_at: k.expires_at
              }))
            }
          });
      }

      // Marcar keys como notificadas
      const keyIds = keys.map((k: any) => k.id);
      await supabaseClient
        .from('enrollment_keys')
        .update({ expiration_notified_at: new Date().toISOString() })
        .in('id', keyIds);

      notificationsSent += keys.length;
    }

    return new Response(
      JSON.stringify({
        success: true,
        keys_checked: expiringKeys.length,
        notifications_sent: notificationsSent,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Check expiring keys error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
