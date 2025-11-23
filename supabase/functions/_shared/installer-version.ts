/**
 * Installer Template Version Tracker
 * 
 * Este arquivo rastreia as versoes do installer template para facilitar
 * debugging e validacao de deploys.
 * 
 * IMPORTANTE: Atualizar este arquivo sempre que modificar installer-template.ts
 */

export const INSTALLER_VERSION = '3.2.4-UNBLOCK-FIX';
export const LAST_UPDATED = '2025-11-23T02:45:00Z'; // CRITICAL FIX: Unblock-File + ExecutionPolicy Unrestricted

export const CHANGES = [
  'CRITICAL: Adiciona Unblock-File apos salvar script do agente',
  'CRITICAL: Adiciona fallback para remover Zone.Identifier manualmente',
  'CRITICAL: ExecutionPolicy alterado de Bypass para Unrestricted',
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
