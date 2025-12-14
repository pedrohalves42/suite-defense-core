import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { corsHeaders, handleException } from '../_shared/error-handler.ts'

interface ReportGenerationPayload {
  tenant_id: string
  agent_id?: string
  agent_name?: string
  job_id?: string
  job_type?: string
  triggered_by: 'job_completion' | 'scheduled' | 'manual'
}

function calculateRiskScore(stats: any): { score: number; level: string } {
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
  if (score >= 70) level = 'CRÍTICO'
  else if (score >= 50) level = 'ALTO'
  else if (score >= 30) level = 'MÉDIO'
  
  return { score, level }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const payload: ReportGenerationPayload = await req.json()
    
    console.log('[auto-generate-report] Starting report generation:', payload)
    
    const { tenant_id, agent_id, agent_name, job_id, job_type, triggered_by } = payload
    
    if (!tenant_id) {
      return new Response(
        JSON.stringify({ error: 'tenant_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Determine report type based on job_type
    let reportType = 'full_security'
    if (job_type === 'software_inventory_collect') reportType = 'software_inventory'
    else if (job_type === 'light_vuln_scan') reportType = 'vulnerabilities'
    else if (job_type === 'collect_antivirus_status') reportType = 'antivirus'
    else if (job_type === 'collect_web_activity') reportType = 'web_activity'

    // Build query filters
    const agentFilter = agent_id ? { agent_id } : {}

    // Fetch data based on report type
    let statistics: any = {}
    let reportData: any = {}

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
        .order('collected_at', { ascending: false })
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
      statistics.critical_vulnerabilities = vulns?.filter((v: any) => v.severity === 'critical').length || 0
      statistics.high_vulnerabilities = vulns?.filter((v: any) => v.severity === 'high').length || 0
      statistics.medium_vulnerabilities = vulns?.filter((v: any) => v.severity === 'medium').length || 0
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
      const uniqueDomains = new Set(webActivity?.map((w: any) => w.domain) || [])
      statistics.unique_domains = uniqueDomains.size
      statistics.malicious_scans = webActivity?.filter((w: any) => w.is_blocked).length || 0
      reportData.web_activity = webActivity || []
    }

    // Calculate risk score
    const { score: riskScore, level: riskLevel } = calculateRiskScore(statistics)

    // Generate title
    const agentLabel = agent_name || 'Todos os Agentes'
    const reportTypeLabels: Record<string, string> = {
      'full_security': 'Relatório de Segurança Completo',
      'software_inventory': 'Inventário de Software',
      'vulnerabilities': 'Análise de Vulnerabilidades',
      'antivirus': 'Status do Antivírus',
      'web_activity': 'Atividade Web'
    }
    const title = `${reportTypeLabels[reportType]} - ${agentLabel}`

    // Insert report
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
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
      })
      .select()
      .single()

    if (insertError) {
      console.error('[auto-generate-report] Failed to insert report:', insertError)
      throw insertError
    }

    console.log('[auto-generate-report] Report generated successfully:', {
      report_id: report.id,
      report_type: reportType,
      risk_score: riskScore,
      risk_level: riskLevel
    })

    return new Response(
      JSON.stringify({
        success: true,
        report_id: report.id,
        report_type: reportType,
        risk_score: riskScore,
        risk_level: riskLevel
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return handleException(error, crypto.randomUUID(), 'auto-generate-report')
  }
})
