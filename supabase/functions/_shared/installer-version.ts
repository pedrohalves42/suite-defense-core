/**
 * Installer Template Version Tracker
 * 
 * Este arquivo rastreia as versoes do installer template para facilitar
 * debugging e validacao de deploys.
 * 
 * IMPORTANTE: Atualizar este arquivo sempre que modificar installer-template.ts
 */

export const INSTALLER_VERSION = '3.1.2-CACHE-CLEANUP';
export const LAST_UPDATED = '2025-11-21T15:50:00Z'; // FORCE CACHE INVALIDATION - Fase 1 + 3 completa

export const CHANGES = [
  'FASE 1: Cache invalidation forcado via version bump',
  'FASE 3: Auditoria completa de padroes problematicos',
  'Scripts v2 obsoletos removidos (cybershield-agent-windows.ps1, cybershield-agent-linux.sh)',
  'CLEANUP_GUIDE.md criado com procedimentos de manutencao',
  'Validacao: Zero ocorrencias de padrao ": $_" em Edge Functions',
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
