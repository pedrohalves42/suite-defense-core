import { supabase } from '@/integrations/supabase/client';
import type { CertificateRepository } from '@/application/ports/output/CertificateRepository';
import type { Certificate } from '@/domain/entities/Certificate';
import type { AgentId } from '@/domain/value-objects/AgentId';
import type { TenantId } from '@/domain/value-objects/TenantId';
import { CertificateMapper } from './mappers/CertificateMapper';

export class SupabaseCertificateRepository implements CertificateRepository {
  async save(cert: Certificate): Promise<void> {
    const row = CertificateMapper.toPersistence(cert);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from('agent_certificates').upsert(row as any);
    if (error) throw new Error(`Failed to save certificate: ${error.message}`);
  }

  async saveBatch(certs: Certificate[]): Promise<void> {
    if (certs.length === 0) return;
    const rows = certs.map(c => CertificateMapper.toPersistence(c));
    const { error } = await supabase.from('agent_certificates').insert(rows as never);
    if (error) throw new Error(`Failed to save certificate batch: ${error.message}`);
  }

  async findByAgent(agentId: AgentId): Promise<Certificate[]> {
    const { data, error } = await supabase
      .from('agent_certificates')
      .select('*')
      .eq('agent_id', agentId.toString())
      .order('valid_until', { ascending: true });

    if (error) throw new Error(`Failed to find certificates: ${error.message}`);
    return (data ?? []).map(CertificateMapper.toDomain);
  }

  async findExpiringByTenant(tenantId: TenantId, withinDays: number): Promise<Certificate[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + withinDays);

    const { data, error } = await supabase
      .from('agent_certificates')
      .select('*')
      .eq('tenant_id', tenantId.toString())
      .lte('valid_until', cutoff.toISOString())
      .gte('valid_until', new Date().toISOString())
      .order('valid_until', { ascending: true });

    if (error) throw new Error(`Failed to find expiring certificates: ${error.message}`);
    return (data ?? []).map(CertificateMapper.toDomain);
  }
}
