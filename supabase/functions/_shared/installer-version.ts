/**
 * Installer Template Version Tracker
 * 
 * Este arquivo rastreia as versoes do installer template para facilitar
 * debugging e validacao de deploys.
 * 
 * IMPORTANTE: Atualizar este arquivo sempre que modificar installer-template.ts
 */

export const INSTALLER_VERSION = '3.1.3-DRIVE-BUG-FIX';
export const LAST_UPDATED = '2025-01-21T17:45:00Z'; // CRITICAL FIX: InvalidVariableReferenceWithDrive resolved

export const CHANGES = [
  'CRITICAL: Corrigido InvalidVariableReferenceWithDrive em mensagens de log',
  'Linha 61: ACL warning agora usa concatenacao segura (+) ao inves de interpolacao com ":"',
  'Linha 279: Scheduled Task warning agora usa concatenacao segura (+) ao inves de interpolacao com ":"',
  'Code Guardian System implementado para prevenir regressoes futuras',
  'Validacao automatica de sintaxe PowerShell 5.1 em CI/CD',
];

export const KNOWN_ISSUES_FIXED = [
  'ParserError: A drive name cannot be used as the name for a variable',
  'Scheduled Task LastTaskResult = 4294770688 (malformed arguments)',
  'Instalador terminava sem criar agent script valido',
];

/**
 * Retorna string formatada para logs
 */
export function getVersionInfo(): string {
  return `Installer v${INSTALLER_VERSION} (${LAST_UPDATED})`;
}
