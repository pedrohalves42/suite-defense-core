/**
 * Installer Template Version Tracker
 * 
 * Este arquivo rastreia as versoes do installer template para facilitar
 * debugging e validacao de deploys.
 * 
 * IMPORTANTE: Atualizar este arquivo sempre que modificar installer-template.ts
 */

export const INSTALLER_VERSION = 'v3.4.0-REPORT-SUPPORT';
export const LAST_UPDATED = '2025-11-24T02:55:00Z'; // FORCE REBUILD: Fix version header sync

export const CHANGES = [
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
