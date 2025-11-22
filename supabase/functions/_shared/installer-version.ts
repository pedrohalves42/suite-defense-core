/**
 * Installer Template Version Tracker
 * 
 * Este arquivo rastreia as versoes do installer template para facilitar
 * debugging e validacao de deploys.
 * 
 * IMPORTANTE: Atualizar este arquivo sempre que modificar installer-template.ts
 */

export const INSTALLER_VERSION = '3.2.0-CRITICAL-SYNTAX-FIX';
export const LAST_UPDATED = '2025-11-22T12:30:00Z'; // CRITICAL FIX: Sintaxe invalida PowerShell corrigida

export const CHANGES = [
  'CRITICAL: Corrigido sintaxe invalida \\` -> ` no installer-template.ts (35 ocorrencias)',
  'CRITICAL: Corrigido padrao : $_ -> : $($_.Exception.Message) no agent-script-windows.ps1 (12 ocorrencias)',
  'Instalador agora executa sem erros de parse do PowerShell',
  'Agent agora loga erros corretamente sem InvalidVariableReferenceWithDrive',
  'Code Guardian System valida automaticamente sintaxe PowerShell 5.1',
];

export const KNOWN_ISSUES_FIXED = [
  'ParserError: Invalid PowerShell syntax \\` (barra invertida + backtick)',
  'InvalidVariableReferenceWithDrive: : $_ em mensagens de log',
  'Instalador falhava com erros de parse antes de executar',
  'Agent nao conseguia logar erros corretamente',
];

/**
 * Retorna string formatada para logs
 */
export function getVersionInfo(): string {
  return `Installer v${INSTALLER_VERSION} (${LAST_UPDATED})`;
}
