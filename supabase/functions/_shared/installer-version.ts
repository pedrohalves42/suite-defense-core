/**
 * Installer Template Version Tracker
 * 
 * Este arquivo rastreia as versoes do installer template para facilitar
 * debugging e validacao de deploys.
 * 
 * IMPORTANTE: Atualizar este arquivo sempre que modificar installer-template.ts
 */

export const INSTALLER_VERSION = 'v3.8.0-REALTIME-OS-TYPE-FIX';
export const LAST_UPDATED = '2025-01-24T19:00:00Z'; // Realtime + os_type fix + multiple instances cleanup

export const CHANGES = [
  '[v3.8.0-REALTIME-OS-TYPE-FIX] CRITICAL FIX: Agente envia os_type ao inves de platform no heartbeat',
  '[v3.8.0-REALTIME-OS-TYPE-FIX] CRITICAL FIX: Heartbeat aceita tanto os_type quanto platform (retrocompatibilidade)',
  '[v3.8.0-REALTIME-OS-TYPE-FIX] CRITICAL FIX: Realtime habilitado para agent_system_metrics e system_alerts',
  '[v3.8.0-REALTIME-OS-TYPE-FIX] CRITICAL FIX: Agentes existentes com os_type NULL atualizados para "windows"',
  '[v3.8.0-REALTIME-OS-TYPE-FIX] MELHORIA: Dashboard agora atualiza metricas em tempo real',
  '[v3.7.0-METRICS-WMI-FALLBACK] CRITICAL FIX: Cleanup jobs agora deleta jobs de qualquer idade (older_than_days: 0)',
  '[v3.7.0-METRICS-WMI-FALLBACK] CRITICAL FIX: Metricas CPU/RAM/Disco com WMI fallback quando Get-Counter falhar',
  '[v3.7.0-METRICS-WMI-FALLBACK] FIX: CPU usa Get-Counter primeiro, fallback para Win32_Processor.LoadPercentage',
  '[v3.7.0-METRICS-WMI-FALLBACK] FIX: RAM sempre via WMI Win32_OperatingSystem (mais confiavel)',
  '[v3.7.0-METRICS-WMI-FALLBACK] FIX: Disco usa Get-PSDrive primeiro, fallback para Win32_LogicalDisk',
  '[v3.7.0-METRICS-WMI-FALLBACK] MELHORIA: Jobs tipo report agora funcionam em VMs sem Performance Counters',
  '[v3.6.1-TELEMETRY-HMAC-FIX] CRITICAL FIX: Telemetria agora usa HMAC (X-Agent-Token + X-HMAC-Signature)',
  '[v3.6.1-TELEMETRY-HMAC-FIX] NOVO: Funcoes Convert-HexToBytes e Get-HmacSignature copiadas do agent',
  '[v3.6.1-TELEMETRY-HMAC-FIX] FIX: Installer envia post_installation com credenciais do agente',
  '[v3.6.1-TELEMETRY-HMAC-FIX] FIX: track-installation-event aceita qualquer event_type com HMAC valido',
  '[v3.6.1-TELEMETRY-HMAC-FIX] FIX: Fallback para telemetria anonima se agent ja existir (compatibilidade)',
  '[v3.6.0-METRICS-FIX] CRITICAL FIX: Metricas agora sao REALMENTE enviadas via POST submit-system-metrics',
  '[v3.6.0-METRICS-FIX] NOVO: Funcao Send-SystemMetrics envia payload estruturado para backend',
  '[v3.6.0-METRICS-FIX] FIX: Loop principal parseia JSON de Invoke-ReportJob e envia via HTTP',
  '[v3.6.0-METRICS-FIX] FIX: Logs agora mostram "CPU=XX%, RAM=YY%, Disco=ZZ%" quando metricas sao enviadas',
  '[v3.5.0-METRICS-AUTO] NOVO: Envio automatico de metricas a cada 5min no loop principal',
  '[v3.5.0-METRICS-AUTO] FIX: Calculadora de preco dinamica baseada em tiers (Landing)',
  '[v3.5.0-METRICS-AUTO] FIX: Dashboard com validacao robusta de agents online',
  '[v3.5.0-METRICS-AUTO] FIX: Telemetria aceita X-Agent-Token para post_installation (nao apenas installation_failed)',
  '[v3.5.0-METRICS-AUTO] NOVO: Cleanup automatico de jobs stuck (delivered >1h)',
  'FIX: Corrige header de versao do script (v3.0.0 -> v3.4.0-REPORT-SUPPORT)',
  'FIX: Sincroniza version string entre source e embedded script',
  'NOVO: Adiciona suporte para jobs do tipo "report" com coleta de metricas do sistema',
  'NOVO: Funcao Invoke-ReportJob coleta CPU, memoria e disco (uso de percentual)',
  'NOVO: Logging de rede em todas as requisicoes HTTP (method + URL + status)',
  'MELHORIA: Switch de tipos de job agora suporta: integration_test, collect_info, report, scan, update_agent',
  'PREVIO: Corrige InvalidVariableReferenceWithDrive no payload HMAC (linha 199)',
  'PREVIO: Substitui "$timestamp:$nonce:$bodyJson" por formatacao explicita \'{0}:{1}:{2}\' -f',
  'PREVIO: Usa operador -f para garantir compatibilidade total com PowerShell 5.1',
  'PREVIO: Diagnostico avancado de restricoes de seguranca (GPO, AppLocker, LanguageMode, AV/EDR)',
  'PREVIO: Detecta GPO forcando ExecutionPolicy AllSigned/Restricted',
  'PREVIO: Detecta Constrained Language Mode (Device Guard/WDAC)',
  'PREVIO: Testa AppLocker com execucao basica de script',
  'PREVIO: Verifica eventos do Windows Defender relacionados a PowerShell',
  'PREVIO: Detecta Device Guard / WDAC Code Integrity enforcement',
  'PREVIO: Script standalone diagnose-security-restrictions.ps1',
  'PREVIO: Adiciona Unblock-File apos salvar script do agente',
  'PREVIO: Adiciona fallback para remover Zone.Identifier manualmente',
  'PREVIO: ExecutionPolicy alterado de Bypass para Unrestricted',
  'Adiciona validacao de Zone.Identifier antes e depois do desbloqueio',
  'Corrige PSSecurityException: UnauthorizedAccess em ambientes restritos',
  'PREVIO: Scheduled Task arguments com double-double quotes ("")',
  'Corrige erro 4294770688 (argumentos mal formatados) causado por escaping incorreto',
  'PREVIO: Write-InstallerLog movida para ANTES de qualquer uso (linha ~57)',
  'Criacao de pastas agora e silenciosa (FASE 0), logging inicia na FASE 1',
  'Corrige erro: The term Write-InstallerLog is not recognized',
  'Previo: LINE-CONTINUATION-REMOVED + InvalidVariableReferenceWithDrive fixes',
  'Code Guardian System valida automaticamente sintaxe PowerShell 5.1',
];

export const KNOWN_ISSUES_FIXED = [
  'CRITICAL: Cleanup jobs nao deletava nada (older_than_days: 7 bloqueava jobs recentes)',
  'CRITICAL: Metricas N/A em VMs sem Performance Counters habilitados',
  'CRITICAL: Get-Counter falhava silenciosamente, sem fallback para WMI',
  'CRITICAL: Jobs tipo report falhavam completamente em ambientes restritos',
  'InvalidVariableReferenceWithDrive: PowerShell 5.1 interpretava :$ como drive reference no payload HMAC (CRITICAL)',
  'PSSecurityException ao executar script como SYSTEM (CRITICAL)',
  'Zone.Identifier bloqueando execucao mesmo com -ExecutionPolicy Bypass',
  'UnauthorizedAccess em ambientes com ExecutionPolicy restritiva',
  'Script marcado como "da internet" impede execucao pela Scheduled Task',
  'Task Scheduler Error 4294770688: argumentos mal formatados (CRITICAL)',
  'Backtick-quote escaping incompativel com New-ScheduledTaskAction',
  'The term Write-InstallerLog is not recognized as the name of a cmdlet',
  'ParserError: ExpectedValueExpression apos operador + (continuacao de linha)',
  'InvalidVariableReferenceWithDrive: : $_ em mensagens de log',
  'Instalador falhava com erros de parse antes de executar',
  'Agent nao conseguia logar erros corretamente',
  'Continuacoes de linha do PowerShell causando problemas em String.raw',
];

/**
 * Retorna string formatada para logs
 */
export function getVersionInfo(): string {
  return `Installer v${INSTALLER_VERSION} (${LAST_UPDATED})`;
}
