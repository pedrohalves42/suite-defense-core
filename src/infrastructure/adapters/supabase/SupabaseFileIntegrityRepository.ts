import { supabase } from '@/integrations/supabase/client';
import type { FileIntegrityRepository } from '@/application/ports/output/FileIntegrityRepository';
import type { FileIntegrityCheck } from '@/domain/entities/FileIntegrityCheck';
import type { AgentId } from '@/domain/value-objects/AgentId';
import type { TenantId } from '@/domain/value-objects/TenantId';
import { FileIntegrityMapper } from './mappers/FileIntegrityMapper';

export class SupabaseFileIntegrityRepository implements FileIntegrityRepository {
  async save(check: FileIntegrityCheck): Promise<void> {
    const row = FileIntegrityMapper.toPersistence(check);
    const { error } = await supabase.from('agent_file_integrity').upsert(row);
    if (error) throw new Error(`Failed to save file integrity check: ${error.message}`);
  }

  async saveBatch(checks: FileIntegrityCheck[]): Promise<void> {
    if (checks.length === 0) return;
    const rows = checks.map(c => FileIntegrityMapper.toPersistence(c));
    const { error } = await supabase.from('agent_file_integrity').insert(rows);
    if (error) throw new Error(`Failed to save file integrity batch: ${error.message}`);
  }

  async findByAgent(agentId: AgentId): Promise<FileIntegrityCheck[]> {
    const { data, error } = await supabase
      .from('agent_file_integrity')
      .select('id, agent_id, tenant_id, file_path, expected_hash, actual_hash, integrity_status, scan_type, severity, file_size, modified_at, collected_at, created_at')
      .eq('agent_id', agentId.toString())
      .order('collected_at', { ascending: false })
      .limit(100);

    if (error) throw new Error(`Failed to find file integrity: ${error.message}`);
    return (data ?? []).map(FileIntegrityMapper.toDomain);
  }

  async findViolationsByTenant(tenantId: TenantId): Promise<FileIntegrityCheck[]> {
    const { data, error } = await supabase
      .from('agent_file_integrity')
      .select('id, agent_id, tenant_id, file_path, expected_hash, actual_hash, integrity_status, scan_type, severity, file_size, modified_at, collected_at, created_at')
      .eq('tenant_id', tenantId.toString())
      .neq('integrity_status', 'valid')
      .order('collected_at', { ascending: false })
      .limit(100);

    if (error) throw new Error(`Failed to find violations: ${error.message}`);
    return (data ?? []).map(FileIntegrityMapper.toDomain);
  }
}
