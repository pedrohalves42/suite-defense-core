/**
 * Installer Template Version Tracker
 * 
 * Este arquivo rastreia as versoes do installer template para facilitar
 * debugging e validacao de deploys.
 * 
 * IMPORTANTE: Atualizar este arquivo sempre que modificar installer-template.ts
 */

export const INSTALLER_VERSION = '3.2.3-SCHEDULED-TASK-ARGS-FIX';
export const LAST_UPDATED = '2025-11-23T01:15:00Z'; // CRITICAL FIX: Argumentos da Scheduled Task corrigidos

export const CHANGES = [
  'CRITICAL: Scheduled Task arguments agora usam "" (double-double quotes) ao inves de backtick-quotes',
  'Corrige erro 4294770688 (argumentos mal formatados) causado por escaping incorreto',
  'Argumentos agora sao interpretados corretamente pelo Task Scheduler',
  'PREVIO: Write-InstallerLog movida para ANTES de qualquer uso (linha ~57)',
  'Criacao de pastas agora e silenciosa (FASE 0), logging inicia na FASE 1',
  'Corrige erro: The term Write-InstallerLog is not recognized',
  'Previo: LINE-CONTINUATION-REMOVED + InvalidVariableReferenceWithDrive fixes',
  'Code Guardian System valida automaticamente sintaxe PowerShell 5.1',
];

export const KNOWN_ISSUES_FIXED = [
  'Task Scheduler Error 4294770688: argumentos mal formatados (CRITICAL)',
  'Backtick-quote escaping incompativel com New-ScheduledTaskAction',
  'Agente nao executava devido a formato incorreto de argumentos',
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
