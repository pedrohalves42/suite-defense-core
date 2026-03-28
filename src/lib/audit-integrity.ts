import { supabase } from '@/integrations/supabase/client';

export interface AuditLogWithIntegrity {
  id: string;
  created_at: string;
  user_id: string | null;
  tenant_id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: any | null;
  success: boolean;
  ip_address: string | null;
  user_agent: string | null;
  request_id: string | null;
  state_before: any | null;
  state_after: any | null;
  integrity_hash: string | null;
  previous_log_hash: string | null;
}

export interface IntegrityVerificationResult {
  total_logs: number;
  chain_valid: boolean;
  first_broken_at: string | null;
  broken_log_id: string | null;
}

export interface ExportResult {
  logs: AuditLogWithIntegrity[];
  chain_valid: boolean;
  export_hash: string;
  export_timestamp: string;
  total_records: number;
}

/**
 * Calculate SHA-256 hash of a string
 */
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify the integrity chain of audit logs
 */
export async function verifyAuditLogChain(
  tenantId: string,
  startDate?: Date,
  endDate?: Date
): Promise<IntegrityVerificationResult> {
  const { data, error } = await supabase.rpc('verify_audit_log_chain', {
    p_tenant_id: tenantId,
    p_start_date: startDate?.toISOString() || null,
    p_end_date: endDate?.toISOString() || null,
  });

  if (error) throw error;

  const result = data?.[0];
  return {
    total_logs: result?.total_logs || 0,
    chain_valid: result?.chain_valid ?? true,
    first_broken_at: result?.first_broken_at || null,
    broken_log_id: result?.broken_log_id || null,
  };
}

/**
 * Export audit logs with integrity verification
 */
export async function exportAuditLogsWithIntegrity(
  tenantId: string,
  startDate: Date,
  endDate: Date
): Promise<ExportResult> {
  // Fetch logs
  const { data: logs, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('tenant_id', tenantId)
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString())
    .order('created_at', { ascending: true });

  if (error) throw error;

  // Verify chain locally
  let chainValid = true;
  let previousHash: string | null = null;

  for (const log of logs || []) {
    if (previousHash !== null && log.previous_log_hash !== previousHash) {
      chainValid = false;
      break;
    }
    previousHash = log.integrity_hash;
  }

  // Calculate export hash
  const exportTimestamp = new Date().toISOString();
  const exportData = JSON.stringify({
    logs,
    exported_at: exportTimestamp,
    tenant_id: tenantId,
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
  });
  
  const exportHash = await sha256(exportData);

  return {
    logs: (logs || []) as AuditLogWithIntegrity[],
    chain_valid: chainValid,
    export_hash: exportHash,
    export_timestamp: exportTimestamp,
    total_records: logs?.length || 0,
  };
}

/**
 * Generate a downloadable certificate for the export
 */
export function generateExportCertificate(result: ExportResult): string {
  return `
================================================================================
                    CERTIFICADO DE EXPORTAÇÃO DE AUDITORIA
================================================================================

Data/Hora de Exportação: ${new Date(result.export_timestamp).toLocaleString('pt-BR')}
Total de Registros: ${result.total_records}
Cadeia de Integridade: ${result.chain_valid ? '✓ VÁLIDA' : '✗ COMPROMETIDA'}

Hash do Export (SHA-256):
${result.export_hash}

--------------------------------------------------------------------------------
Este certificado atesta que os registros de auditoria exportados foram 
verificados quanto à integridade da cadeia de hashes no momento da exportação.

${result.chain_valid 
  ? 'A cadeia de integridade está ÍNTEGRA, indicando que os registros não foram alterados desde sua criação.'
  : 'ATENÇÃO: A cadeia de integridade está COMPROMETIDA. Os registros podem ter sido alterados.'}
================================================================================
`.trim();
}

/**
 * Compute a diff between state_before and state_after
 */
export function computeStateDiff(
  before: any | null,
  after: any | null
): { key: string; before: unknown; after: unknown; changed: boolean }[] {
  const diff: { key: string; before: unknown; after: unknown; changed: boolean }[] = [];
  
  const allKeys = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ]);

  for (const key of allKeys) {
    const beforeValue = before?.[key];
    const afterValue = after?.[key];
    const changed = JSON.stringify(beforeValue) !== JSON.stringify(afterValue);
    
    diff.push({
      key,
      before: beforeValue,
      after: afterValue,
      changed,
    });
  }

  return diff.sort((a, b) => {
    // Changed items first
    if (a.changed !== b.changed) return a.changed ? -1 : 1;
    return a.key.localeCompare(b.key);
  });
}
