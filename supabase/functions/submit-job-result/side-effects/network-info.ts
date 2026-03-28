/**
 * Side-effect: collect_network_info processing
 */

import { logger } from '../../_shared/logger.ts'
import type { SubmitContext } from '../types.ts'

export async function processNetworkInfo(ctx: SubmitContext): Promise<void> {
  const { supabase, agent, job, outputData, sideEffects } = ctx
  
  if (job.type !== 'collect_network_info') return
  if (!outputData.adapters && !outputData.ip_addresses && !outputData.network_adapters) return
  
  try {
    logger.debug('[submit-job-result] [ZERO_TRUST] Processing network info BEFORE marking completed...')
    
    const adapters = (outputData.adapters || []) as Array<Record<string, unknown>>
    const ipAddresses = (outputData.ip_addresses || []) as Array<Record<string, unknown>>
    const collectedAt = outputData.collected_at
      ? new Date(String(outputData.collected_at)).toISOString()
      : new Date().toISOString()

    const classifyIp = (addr: string): 'private' | 'public' | 'link_local' => {
      if (addr.startsWith('192.168.') || addr.startsWith('10.') || addr.startsWith('172.16.') || addr.startsWith('172.17.') || addr.startsWith('172.18.') || addr.startsWith('172.19.') || addr.startsWith('172.2') || addr.startsWith('172.30.') || addr.startsWith('172.31.')) return 'private'
      if (addr.startsWith('169.254.') || addr.startsWith('127.')) return 'link_local'
      return 'public'
    }

    const privateIps = ipAddresses.filter((ip: any) => classifyIp(String(ip.ip || '')) === 'private')
    const publicIps = ipAddresses.filter((ip: any) => classifyIp(String(ip.ip || '')) === 'public')

    const networkAdapters = adapters.length > 0
      ? adapters.map((a, idx) => ({
          name: String(a.Name || a.name || ''),
          mac_address: String(a.MacAddress || a.mac_address || ''),
          speed: String(a.LinkSpeed || a.link_speed || ''),
          status: String(a.Status || a.status || 'up').toLowerCase(),
          ip_address: idx < privateIps.length ? String((privateIps[idx] as Record<string, unknown>).ip) : '',
        }))
      : (outputData.network_adapters || []) as Array<Record<string, unknown>>

    const derivedPublicIp = outputData.public_ip 
      || (publicIps.length > 0 ? String((publicIps[0] as Record<string, unknown>).ip) : null)
    const derivedGateway = outputData.gateway_ip 
      || (privateIps.length > 0 ? String((privateIps[0] as Record<string, unknown>).ip) : null)

    const networkRecord = {
      agent_id: job.agent_id,
      tenant_id: agent.tenant_id,
      firewall_domain: outputData.firewall_domain ?? outputData.FirewallDomain ?? null,
      firewall_private: outputData.firewall_private ?? outputData.FirewallPrivate ?? null,
      firewall_public: outputData.firewall_public ?? outputData.FirewallPublic ?? null,
      open_ports: outputData.open_ports || outputData.OpenPorts || [],
      active_connections: (outputData.active_connections || outputData.ActiveConnections || []).slice(0, 100),
      network_adapters: networkAdapters,
      dns_servers: outputData.dns_servers || outputData.DnsServers || [],
      gateway_ip: derivedGateway,
      public_ip: derivedPublicIp,
      dns_test_success: outputData.dns_test_success ?? outputData.DnsTestSuccess ?? null,
      https_test_success: outputData.https_test_success ?? outputData.HttpsTestSuccess ?? null,
      collected_at: collectedAt,
    }

    const { error: insertError } = await supabase
      .from('agent_network_info')
      .insert(networkRecord)
    
    if (insertError) {
      logger.error('[submit-job-result] Error inserting network info:', insertError)
    } else {
      logger.debug('[submit-job-result] [ZERO_TRUST] Inserted network info record')
      sideEffects.inserted = true
      sideEffects.recordCount += 1
    }

    // Cleanup old records (keep last 7 days)
    await supabase
      .from('agent_network_info')
      .delete()
      .eq('agent_id', job.agent_id)
      .lt('collected_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

  } catch (netErr) {
    logger.error('[submit-job-result] Error processing network info:', netErr)
  }
}
