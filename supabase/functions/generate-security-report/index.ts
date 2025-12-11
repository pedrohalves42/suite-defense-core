import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

// Calculate risk score based on security metrics
function calculateRiskScore(stats: any, unprotectedPCs: any, failedLogins: any[]): number {
  let score = 100; // Start with perfect score
  
  // Deduct for vulnerabilities (max -40)
  score -= Math.min(40, (stats.critical_vulnerabilities || 0) * 10);
  score -= Math.min(20, (stats.high_vulnerabilities || 0) * 3);
  score -= Math.min(10, (stats.medium_vulnerabilities || 0) * 1);
  
  // Deduct for unprotected PCs (max -30)
  const totalAgents = stats.total_agents || 1;
  const unprotectedRatio = (unprotectedPCs.no_antivirus + unprotectedPCs.outdated_av) / totalAgents;
  score -= Math.min(30, unprotectedRatio * 50);
  
  // Deduct for offline agents (max -10)
  const offlineRatio = unprotectedPCs.offline_agents / totalAgents;
  score -= Math.min(10, offlineRatio * 20);
  
  // Deduct for threats found (max -15)
  score -= Math.min(15, (stats.threats_found || 0) * 5);
  
  // Deduct for failed logins (max -10)
  const recentFailedLogins = failedLogins.filter(
    f => new Date(f.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)
  ).length;
  score -= Math.min(10, recentFailedLogins * 0.5);
  
  return Math.max(0, Math.round(score));
}

// Get risk classification based on score
function getRiskClassification(score: number): { level: string; color: string; description: string } {
  if (score >= 80) return { level: 'BAIXO', color: 'green', description: 'Ambiente seguro com boas práticas implementadas' };
  if (score >= 60) return { level: 'MÉDIO', color: 'yellow', description: 'Algumas vulnerabilidades requerem atenção' };
  if (score >= 40) return { level: 'ALTO', color: 'orange', description: 'Múltiplas vulnerabilidades críticas identificadas' };
  return { level: 'CRÍTICO', color: 'red', description: 'Ambiente em risco iminente - ação imediata necessária' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        },
      }
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { data: userRoles, error: roleError } = await supabase
      .from('user_roles')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (roleError) {
      console.error('Error fetching user roles:', roleError);
      throw new Error('Error fetching user roles');
    }

    if (!userRoles) {
      console.warn('No user_roles found for user:', user.id);
      throw new Error('No tenant found for user. Please ensure you have a role assigned.');
    }

    const tenantId = userRoles.tenant_id;
    console.log('Generating security report for tenant:', tenantId);

    const url = new URL(req.url);
    const agentId = url.searchParams.get('agent_id');
    const format = url.searchParams.get('format') || 'json';

    let agentFilter = {};
    if (agentId) {
      agentFilter = { agent_id: agentId };
    }

    // Fetch all security data in parallel
    const [
      { data: agents, error: agentsError },
      { data: software, error: softwareError },
      { data: vulnerabilities, error: vulnError },
      { data: antivirus, error: avError },
      { data: webActivity, error: webError },
      { data: virusScans, error: scanError },
      { data: securityEvents, error: eventsError },
      { data: failedLogins, error: loginsError },
    ] = await Promise.all([
      supabase
        .from('agents')
        .select('id, agent_name, hostname, os_type, os_version, status, last_heartbeat, agent_version')
        .eq('tenant_id', tenantId)
        .eq('status', 'active'),
      
      supabase
        .from('software_inventory')
        .select('*')
        .eq('tenant_id', tenantId)
        .match(agentFilter),
      
      supabase
        .from('vuln_findings')
        .select('*')
        .eq('tenant_id', tenantId)
        .match(agentFilter),
      
      supabase
        .from('antivirus_status')
        .select('*')
        .eq('tenant_id', tenantId)
        .match(agentFilter),
      
      supabase
        .from('agent_web_activity')
        .select('*')
        .eq('tenant_id', tenantId)
        .match(agentFilter)
        .order('visited_at', { ascending: false })
        .limit(100),
      
      supabase
        .from('virus_scans')
        .select('*')
        .eq('tenant_id', tenantId)
        .match(agentId ? { agent_name: agentId } : {})
        .order('scanned_at', { ascending: false })
        .limit(50),
      
      supabase
        .from('security_events')
        .select('*')
        .eq('tenant_id', tenantId)
        .match(agentFilter)
        .order('created_at', { ascending: false })
        .limit(50),
      
      // NEW: Fetch failed login attempts
      supabase
        .from('failed_login_attempts')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    // Log errors but don't fail
    if (agentsError) console.error('Error fetching agents:', agentsError);
    if (softwareError) console.error('Error fetching software:', softwareError);
    if (vulnError) console.error('Error fetching vulnerabilities:', vulnError);
    if (avError) console.error('Error fetching antivirus:', avError);
    if (webError) console.error('Error fetching web activity:', webError);
    if (scanError) console.error('Error fetching virus scans:', scanError);
    if (eventsError) console.error('Error fetching security events:', eventsError);
    if (loginsError) console.error('Error fetching failed logins:', loginsError);

    // Calculate unprotected PCs
    const agentIds = new Set((agents || []).map(a => a.id));
    const agentsWithAV = new Set((antivirus || []).map(av => av.agent_id));
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const unprotectedPCs = {
      no_antivirus: (agents || []).filter(a => !agentsWithAV.has(a.id)).length,
      outdated_av: (antivirus || []).filter(av => {
        if (!av.last_update_at) return true;
        return new Date(av.last_update_at) < sevenDaysAgo;
      }).length,
      offline_agents: (agents || []).filter(a => {
        if (!a.last_heartbeat) return true;
        return new Date(a.last_heartbeat) < fiveMinutesAgo;
      }).length,
      agents_without_av: (agents || []).filter(a => !agentsWithAV.has(a.id)).map(a => ({
        agent_name: a.agent_name,
        hostname: a.hostname,
        last_heartbeat: a.last_heartbeat
      })),
    };

    // Calculate base statistics
    const stats = {
      total_agents: agents?.length || 0,
      total_software: software?.length || 0,
      total_vulnerabilities: vulnerabilities?.length || 0,
      critical_vulnerabilities: vulnerabilities?.filter(v => v.severity === 'critical').length || 0,
      high_vulnerabilities: vulnerabilities?.filter(v => v.severity === 'high').length || 0,
      medium_vulnerabilities: vulnerabilities?.filter(v => v.severity === 'medium').length || 0,
      low_vulnerabilities: vulnerabilities?.filter(v => v.severity === 'low').length || 0,
      antivirus_engines: antivirus?.length || 0,
      threats_found: antivirus?.reduce((sum, av) => sum + (av.threats_found || 0), 0) || 0,
      unique_domains: new Set(webActivity?.map(w => w.domain)).size || 0,
      malicious_scans: virusScans?.filter(s => s.is_malicious).length || 0,
      total_scans: virusScans?.length || 0,
      security_events: securityEvents?.length || 0,
      failed_login_attempts_24h: (failedLogins || []).filter(
        f => new Date(f.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)
      ).length,
      report_generated_at: new Date().toISOString(),
    };

    // Calculate risk score
    const riskScore = calculateRiskScore(stats, unprotectedPCs, failedLogins || []);
    const riskClassification = getRiskClassification(riskScore);

    // Generate prioritized recommendations
    const recommendations: Array<{ priority: number; category: string; title: string; description: string }> = [];
    
    if (stats.critical_vulnerabilities > 0) {
      recommendations.push({
        priority: 1,
        category: 'Vulnerabilidades',
        title: 'Corrigir vulnerabilidades críticas',
        description: `${stats.critical_vulnerabilities} vulnerabilidade(s) crítica(s) detectada(s). Aplicar patches de segurança imediatamente.`
      });
    }
    
    if (unprotectedPCs.no_antivirus > 0) {
      recommendations.push({
        priority: 2,
        category: 'Antivírus',
        title: 'Instalar antivírus em computadores desprotegidos',
        description: `${unprotectedPCs.no_antivirus} computador(es) sem proteção antivírus detectada.`
      });
    }
    
    if (unprotectedPCs.outdated_av > 0) {
      recommendations.push({
        priority: 3,
        category: 'Antivírus',
        title: 'Atualizar definições de antivírus',
        description: `${unprotectedPCs.outdated_av} computador(es) com antivírus desatualizado (>7 dias).`
      });
    }
    
    if (stats.high_vulnerabilities > 0) {
      recommendations.push({
        priority: 4,
        category: 'Vulnerabilidades',
        title: 'Corrigir vulnerabilidades de alta severidade',
        description: `${stats.high_vulnerabilities} vulnerabilidade(s) de alta severidade requerem atenção.`
      });
    }
    
    if (unprotectedPCs.offline_agents > 0) {
      recommendations.push({
        priority: 5,
        category: 'Monitoramento',
        title: 'Verificar agentes offline',
        description: `${unprotectedPCs.offline_agents} agente(s) offline. Verificar conectividade e status dos serviços.`
      });
    }
    
    if (stats.failed_login_attempts_24h > 10) {
      recommendations.push({
        priority: 6,
        category: 'Acesso',
        title: 'Investigar tentativas de login suspeitas',
        description: `${stats.failed_login_attempts_24h} tentativa(s) de login falha(s) nas últimas 24 horas.`
      });
    }
    
    if (stats.threats_found > 0) {
      recommendations.push({
        priority: 7,
        category: 'Malware',
        title: 'Investigar ameaças detectadas',
        description: `${stats.threats_found} ameaça(s) detectada(s) pelo antivírus. Executar varredura completa e remover.`
      });
    }

    // Sort recommendations by priority
    recommendations.sort((a, b) => a.priority - b.priority);

    if (format === 'summary') {
      return new Response(
        JSON.stringify({
          success: true,
          generated_at: new Date().toISOString(),
          tenant_id: tenantId,
          agent_filter: agentId || 'all',
          statistics: stats,
          risk_score: riskScore,
          risk_classification: riskClassification,
          unprotected_pcs: unprotectedPCs,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Full detailed report (for Laudo PDF)
    const report = {
      success: true,
      generated_at: new Date().toISOString(),
      tenant_id: tenantId,
      agent_filter: agentId || 'all',
      statistics: stats,
      risk_score: riskScore,
      risk_classification: riskClassification,
      unprotected_pcs: unprotectedPCs,
      recommendations: recommendations,
      data: {
        agents: agents || [],
        software_inventory: software || [],
        vulnerabilities: vulnerabilities || [],
        antivirus_status: antivirus || [],
        web_activity: webActivity || [],
        virus_scans: virusScans || [],
        security_events: securityEvents || [],
        failed_login_attempts: failedLogins || [],
      },
    };

    console.log('Security report generated successfully:', {
      tenant_id: tenantId,
      agents_count: agents?.length || 0,
      software_count: software?.length || 0,
      vulnerabilities_count: vulnerabilities?.length || 0,
      risk_score: riskScore,
      risk_level: riskClassification.level,
    });

    return new Response(JSON.stringify(report), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error generating security report:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage,
        hint: errorMessage.includes('tenant') 
          ? 'Ensure you have a valid role assigned in the system.' 
          : undefined
      }),
      {
        status: errorMessage === 'Unauthorized' ? 401 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});