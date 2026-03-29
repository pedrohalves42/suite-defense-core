import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { corsHeaders, handleException } from '../_shared/error-handler.ts'
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

interface ReportGenerationPayload {
  tenant_id: string
  agent_id?: string
  agent_name?: string
  job_id?: string
  job_type?: string
  triggered_by: 'job_completion' | 'scheduled' | 'manual'
}

function calculateRiskScore(stats: Record<string, unknown>): { score: number; level: string } {
  let score = 0
  
  // Critical vulnerabilities add 30 points each (max 90)
  score += Math.min((stats.critical_vulnerabilities || 0) * 30, 90)
  
  // High vulnerabilities add 15 points each (max 45)
  score += Math.min((stats.high_vulnerabilities || 0) * 15, 45)
  
  // Medium vulnerabilities add 5 points each (max 25)
  score += Math.min((stats.medium_vulnerabilities || 0) * 5, 25)
  
  // Threats found add 20 points each (max 60)
  score += Math.min((stats.threats_found || 0) * 20, 60)
  
  // Malicious scans add 15 points each (max 45)
  score += Math.min((stats.malicious_scans || 0) * 15, 45)
  
  // Cap at 100
  score = Math.min(score, 100)
  
  // Determine level
  let level = 'BAIXO'
  if (score >= 70) level = 'CRITICO'
  else if (score >= 50) level = 'ALTO'
  else if (score >= 30) level = 'MEDIO'
  
  return { score, level }
}

// V4: Calculate commercial priority based on risk score
function getCommercialPriority(riskScore: number): 'high' | 'medium' | 'low' {
  if (riskScore >= 60) return 'high'    // Notify immediately
  if (riskScore >= 30) return 'medium'  // Notify in next batch
  return 'low'                          // Just store
}

// V4: Determine next action based on priority
function getNextAction(priority: 'high' | 'medium' | 'low'): string {
  if (priority === 'high') return 'send_whatsapp'
  if (priority === 'medium') return 'schedule_call'
  return 'await_client'
}

// V4: Generate commercial summary text ready for WhatsApp/Email
function generateCommercialSummary(
  stats: Record<string, unknown>, 
  riskLevel: string, 
  agentName: string,
  tenantName?: string
): string {
  const issues: string[] = []
  
  if ((stats.critical_vulnerabilities || 0) > 0) {
    issues.push(`${stats.critical_vulnerabilities} vulnerabilidade(s) critica(s)`)
  }
  if ((stats.high_vulnerabilities || 0) > 0) {
    issues.push(`${stats.high_vulnerabilities} vulnerabilidade(s) de alto risco`)
  }
  if ((stats.threats_found || 0) > 0) {
    issues.push(`${stats.threats_found} ameaca(s) detectada(s) pelo antivirus`)
  }
  if ((stats.malicious_scans || 0) > 0) {
    issues.push(`${stats.malicious_scans} acesso(s) suspeito(s) a sites maliciosos`)
  }
  if ((stats.blocked_sites || 0) > 0) {
    issues.push(`${stats.blocked_sites} site(s) bloqueado(s) por politica de seguranca`)
  }
  if ((stats.outdated_software || 0) > 0) {
    issues.push(`${stats.outdated_software} software(s) desatualizado(s)`)
  }
  
  // No issues - positive message
  if (issues.length === 0) {
    return `[OK]  *Diagnostico de Seguranca Concluido*

Computador: ${agentName}
${tenantName ? `Empresa: ${tenantName}\n` : ''}
Status: [OK]  Ambiente Seguro

Nenhum risco critico identificado. Seu ambiente esta protegido.

_Relatorio gerado automaticamente por CyberShield_`
  }
  
  // Has issues - urgency-based message
  const urgency = riskLevel === 'CRITICO' ? 'imediata' : 
                  riskLevel === 'ALTO' ? 'em ate 48 horas' : 'em ate 7 dias'
  
  const emoji = riskLevel === 'CRITICO' ? '?' : 
                riskLevel === 'ALTO' ? '?' : '?'
  
  return `${emoji} *Diagnostico de Seguranca - Atencao Necessaria*

Computador: ${agentName}
${tenantName ? `Empresa: ${tenantName}\n` : ''}
*Classificacao: Risco ${riskLevel}*

Identificamos:
${issues.map(i => `? ${i}`).join('\n')}

? *Acao recomendada:* Correcao ${urgency}

Posso explicar em 10 minutos o que significa e como resolver?

_Relatorio gerado automaticamente por CyberShield_`
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const payload: ReportGenerationPayload = await req.json()
    
    logger.info('[auto-generate-report] Starting report generation:', payload)
    
    const { tenant_id, agent_id, agent_name, job_id, job_type, triggered_by } = payload
    
    if (!tenant_id) {
      return new Response(
        JSON.stringify({ error: 'tenant_id is required' }),
        { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      )
    }

    // Get tenant name for commercial summary
    const { data: tenantData } = await supabase
      .from('tenants')
      .select('name')
      .eq('id', tenant_id)
      .single()
    
    const tenantName = tenantData?.name

    // Determine report type based on job_type
    let reportType = 'full_security'
    if (job_type === 'software_inventory_collect') reportType = 'software_inventory'
    else if (job_type === 'light_vuln_scan') reportType = 'vulnerabilities'
    else if (job_type === 'collect_antivirus_status') reportType = 'antivirus'
    else if (job_type === 'collect_web_activity') reportType = 'web_activity'

    // Build query filters
    const agentFilter = agent_id ? { agent_id } : {}

    // Fetch data based on report type
    let statistics: Record<string, unknown> = {}
    let reportData: Record<string, unknown> = {}

    // Get agents count
    const { count: agentCount } = await supabase
      .from('agents')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant_id)
      .eq('status', 'active')

    statistics.total_agents = agentCount || 0

    // Get software inventory
    if (reportType === 'full_security' || reportType === 'software_inventory') {
      const softwareQuery = supabase
        .from('software_inventory')
        .select('*')
        .eq('tenant_id', tenant_id)
        .order('last_seen_at', { ascending: false })
        .limit(100)
      
      if (agent_id) softwareQuery.eq('agent_id', agent_id)
      
      const { data: software, count: softwareCount } = await softwareQuery
      statistics.total_software = software?.length || 0
      reportData.software_inventory = software || []
    }

    // Get vulnerabilities
    if (reportType === 'full_security' || reportType === 'vulnerabilities') {
      const vulnQuery = supabase
        .from('vulnerability_findings')
        .select('*')
        .eq('tenant_id', tenant_id)
        .order('detected_at', { ascending: false })
        .limit(100)
      
      if (agent_id) vulnQuery.eq('agent_id', agent_id)
      
      const { data: vulns } = await vulnQuery
      statistics.total_vulnerabilities = vulns?.length || 0
      statistics.critical_vulnerabilities = vulns?.filter((v: Record<string, unknown>) => v.severity === 'critical').length || 0
      statistics.high_vulnerabilities = vulns?.filter((v: Record<string, unknown>) => v.severity === 'high').length || 0
      statistics.medium_vulnerabilities = vulns?.filter((v: Record<string, unknown>) => v.severity === 'medium').length || 0
      reportData.vulnerabilities = vulns || []
    }

    // Get antivirus status
    if (reportType === 'full_security' || reportType === 'antivirus') {
      const avQuery = supabase
        .from('antivirus_status')
        .select('*')
        .eq('tenant_id', tenant_id)
        .order('collected_at', { ascending: false })
        .limit(50)
      
      if (agent_id) avQuery.eq('agent_id', agent_id)
      
      const { data: antivirus } = await avQuery
      statistics.antivirus_engines = antivirus?.length || 0
      statistics.threats_found = antivirus?.reduce((sum: number, av: any) => sum + (av.threats_found || 0), 0) || 0
      reportData.antivirus_status = antivirus || []
    }

    // Get web activity
    if (reportType === 'full_security' || reportType === 'web_activity') {
      const webQuery = supabase
        .from('agent_web_activity')
        .select('*')
        .eq('tenant_id', tenant_id)
        .order('visited_at', { ascending: false })
        .limit(100)
      
      if (agent_id) webQuery.eq('agent_id', agent_id)
      
      const { data: webActivity } = await webQuery
      
      // Count unique domains
      const uniqueDomains = new Set(webActivity?.map((w: Record<string, unknown>) => w.domain) || [])
      statistics.unique_domains = uniqueDomains.size
      statistics.malicious_scans = webActivity?.filter((w: Record<string, unknown>) => w.is_blocked).length || 0
      statistics.blocked_sites = webActivity?.filter((w: Record<string, unknown>) => w.is_blocked).length || 0
      reportData.web_activity = webActivity || []
    }

    // Calculate risk score
    const { score: riskScore, level: riskLevel } = calculateRiskScore(statistics)
    
    // V4: Calculate commercial priority and next action
    const commercialPriority = getCommercialPriority(riskScore)
    const nextAction = getNextAction(commercialPriority)
    
    // V4: Generate commercial summary
    const agentLabel = agent_name || 'Todos os Agentes'
    const commercialSummary = generateCommercialSummary(statistics, riskLevel, agentLabel, tenantName)

    // Generate title
    const reportTypeLabels: Record<string, string> = {
      'full_security': 'Relatorio de Seguranca Completo',
      'software_inventory': 'Inventario de Software',
      'vulnerabilities': 'Analise de Vulnerabilidades',
      'antivirus': 'Status do Antivirus',
      'web_activity': 'Atividade Web'
    }
    const title = `${reportTypeLabels[reportType]} - ${agentLabel}`

    // Insert report with V4 commercial fields
    const { data: report, error: insertError } = await supabase
      .from('generated_reports')
      .insert({
        tenant_id,
        agent_id,
        agent_name,
        report_type: reportType,
        title,
        risk_score: riskScore,
        risk_level: riskLevel,
        statistics,
        report_data: reportData,
        status: 'generated',
        triggered_by,
        job_id,
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        // V4 Commercial fields
        sales_status: 'open',
        commercial_priority: commercialPriority,
        next_action: nextAction,
        commercial_summary: commercialSummary
      })
      .select()
      .single()

    if (insertError) {
      logger.error('[auto-generate-report] Failed to insert report:', insertError)
      throw insertError
    }

    logger.info('[auto-generate-report] Report generated successfully:', {
      report_id: report.id,
      report_type: reportType,
      risk_score: riskScore,
      risk_level: riskLevel,
      commercial_priority: commercialPriority,
      next_action: nextAction
    })

    return new Response(
      JSON.stringify({
        success: true,
        report_id: report.id,
        report_type: reportType,
        risk_score: riskScore,
        risk_level: riskLevel,
        commercial_priority: commercialPriority,
        next_action: nextAction,
        has_commercial_summary: !!commercialSummary
      }),
      { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return handleException(error, crypto.randomUUID(), 'auto-generate-report')
  }
})
