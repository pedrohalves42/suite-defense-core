/**
 * Installer Template Version Tracker
 * 
 * Este arquivo rastreia as versoes do installer template para facilitar
 * debugging e validacao de deploys.
 * 
 * IMPORTANTE: Atualizar este arquivo sempre que modificar installer-template.ts
 */

export const INSTALLER_VERSION = '3.2.2-FUNCTION-ORDER-FIX';
export const LAST_UPDATED = '2025-11-22T14:00:00Z'; // CRITICAL FIX: Write-InstallerLog definida antes do uso

export const CHANGES = [
  'CRITICAL: Write-InstallerLog movida para ANTES de qualquer uso (linha ~57)',
  'Criacao de pastas agora e silenciosa (FASE 0), logging inicia na FASE 1',
  'Corrige erro: The term Write-InstallerLog is not recognized',
  'Previo: LINE-CONTINUATION-REMOVED + InvalidVariableReferenceWithDrive fixes',
  'Code Guardian System valida automaticamente sintaxe PowerShell 5.1',
];

export const KNOWN_ISSUES_FIXED = [
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
