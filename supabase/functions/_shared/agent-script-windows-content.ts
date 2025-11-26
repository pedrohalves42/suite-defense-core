/**
 * CyberShield Agent Windows Script - AUTO-GERADO
 * NAO EDITAR MANUALMENTE.
 * Fonte: public/agent-scripts/cybershield-agent-windows-v3.ps1
 */

export const AGENT_SCRIPT_WINDOWS_CONTENT = `<#
    CyberShield Agent - Windows v3.10.6-JOB-TYPE-FIX
    
    Funcionalidades:
    - HMAC SHA256 com secret em HEX (64 chars -> 32 bytes)
    - Heartbeat periodico
    - Poll de jobs
    - Execucao de jobs (scan + report + security features)
    - Envio de resultado (submit-job-result)
    - Evento de post_installation
    - Suporte a jobs tipo REPORT (metricas do sistema)
    - Inventario de software (software_inventory_collect)
    - Scanner de vulnerabilidades leve (light_vuln_scan)
    - Coleta de status de antivirus (collect_antivirus_status)
    - Atividade web via DNS cache (collect_web_activity)
    - Auto-remediacao basica (fix_firewall, restart_service)
    
    Uso:
    powershell.exe -ExecutionPolicy Bypass -File .\\cybershield-agent-windows-v3.ps1 \`
        -ServerUrl "https://seu-projeto.supabase.co" \`
        -AgentToken "AGENT_TOKEN_AQUI" \`
        -HmacSecret "64_HEX_CHARS_AQUI" \`
        -AgentName "meu-servidor-01"
#>

param(
    [Parameter(Mandatory = \$true)]
    [string]\$ServerUrl,

    [Parameter(Mandatory = \$true)]
    [string]\$AgentToken,

    [Parameter(Mandatory = \$true)]
    [string]\$HmacSecret,

    [Parameter(Mandatory = \$false)]
    [string]\$AgentName = \$env:COMPUTERNAME.ToLower(),

    [Parameter(Mandatory = \$false)]
    [string]\$AgentVersion = "3.10.6-JOB-TYPE-FIX"
)`;

export function getAgentScriptWindows(): string {
  return AGENT_SCRIPT_WINDOWS_CONTENT;
}
