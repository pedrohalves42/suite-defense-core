/**
 * Installer Template Version Tracker
 * 
 * Este arquivo rastreia as versoes do installer template para facilitar
 * debugging e validacao de deploys.
 * 
 * IMPORTANTE: Atualizar este arquivo sempre que modificar installer-template.ts
 */

export const INSTALLER_VERSION = '3.2.1-LINE-CONTINUATION-REMOVED';
export const LAST_UPDATED = '2025-11-22T13:00:00Z'; // CRITICAL FIX: Remocao de continuacoes de linha

export const CHANGES = [
  'CRITICAL: Removidas todas as continuacoes de linha (backtick no final) em installer-template.ts',
  'CRITICAL: Corrigido padrao : $_ -> : $($_.Exception.Message) no agent-script-windows.ps1 (12 ocorrencias)',
  'Comandos PowerShell agora em uma unica linha para evitar erros de continuacao',
  'Instalador agora executa sem erros ExpectedValueExpression',
  'Agent agora loga erros corretamente sem InvalidVariableReferenceWithDrive',
  'Code Guardian System valida automaticamente sintaxe PowerShell 5.1',
];

export const KNOWN_ISSUES_FIXED = [
  'ParserError: ExpectedValueExpression apos operador + (causado por continuacao de linha malformada)',
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
