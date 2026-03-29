#!/usr/bin/env -S deno run --allow-net --allow-env
/**
 * Canary simulation script for heartbeat validation.
 *
 * Usage:
 *   deno run --allow-net --allow-env scripts/simulate_agents.ts \
 *     <heartbeat_url> <agent_count> <interval_ms> [apikey]
 *
 * Example:
 *   deno run --allow-net --allow-env scripts/simulate_agents.ts \
 *     https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/heartbeat 50 60000
 *
 * Each simulated agent sends periodic heartbeats with realistic payloads.
 * Useful for validating the modular heartbeat under load before canary rollout.
 */

if (import.meta.main) {
  const args = Deno.args
  if (args.length < 3) {
    console.log(
      'Usage: deno run --allow-net --allow-env scripts/simulate_agents.ts ' +
      '<heartbeat_url> <agent_count> <interval_ms> [apikey]',
    )
    Deno.exit(1)
  }

  const [endpoint, agentCountStr, intervalStr, apikey] = args
  const agentCount = Number(agentCountStr) || 50
  const interval = Number(intervalStr) || 60000
  const anonKey = apikey || Deno.env.get('VITE_SUPABASE_PUBLISHABLE_KEY') || ''

  console.log(`🚀 Simulating ${agentCount} agents → ${endpoint} every ${interval}ms`)

  const results = { total: 0, ok: 0, errors: 0, rateLimit: 0 }

  const promises = Array.from({ length: agentCount }, (_, i) =>
    simulateAgent(endpoint, `sim-agent-${String(i).padStart(4, '0')}`, interval, anonKey, results),
  )

  // Print stats every 30 seconds
  setInterval(() => {
    console.log(
      `📊 Stats: total=${results.total} ok=${results.ok} ` +
      `errors=${results.errors} rateLimited=${results.rateLimit}`,
    )
  }, 30000)

  await Promise.allSettled(promises)
}

interface Stats {
  total: number
  ok: number
  errors: number
  rateLimit: number
}

async function simulateAgent(
  endpoint: string,
  agentName: string,
  intervalMs: number,
  apikey: string,
  stats: Stats,
) {
  // Stagger start to avoid thundering herd
  const jitter = Math.random() * Math.min(intervalMs, 5000)
  await new Promise(r => setTimeout(r, jitter))

  while (true) {
    try {
      const body = JSON.stringify({
        os_type: Math.random() > 0.3 ? 'windows' : 'linux',
        os_version: '10.0.19045',
        hostname: `HOST-${agentName}`,
        agent_version: '5.0.15',
        system_metrics: {
          cpu_percent: +(Math.random() * 100).toFixed(1),
          memory_total_gb: 16,
          memory_used_gb: +(Math.random() * 16).toFixed(1),
          memory_used_percent: +(Math.random() * 100).toFixed(1),
          disk_total_gb: 500,
          disk_free_gb: +(Math.random() * 500).toFixed(1),
          disk_used_percent: +(Math.random() * 100).toFixed(1),
          uptime_seconds: Math.floor(Math.random() * 86400 * 7),
        },
        processes: {
          total_processes: Math.floor(Math.random() * 200) + 10,
          top_by_cpu: [
            { pid: 1234, name: 'chrome.exe', cpu_seconds: 120, memory_mb: 512 },
          ],
          top_by_memory: [
            { pid: 5678, name: 'node.exe', cpu_seconds: 30, memory_mb: 1024 },
          ],
        },
      })

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Agent-Name': agentName,
      }
      if (apikey) headers['apikey'] = apikey

      const resp = await fetch(endpoint, { method: 'POST', body, headers })
      stats.total++

      if (resp.status === 200) {
        stats.ok++
      } else if (resp.status === 429) {
        stats.rateLimit++
      } else {
        stats.errors++
        const text = await resp.text()
        console.warn(`⚠️ [${agentName}] ${resp.status}: ${text.substring(0, 150)}`)
      }
    } catch (err) {
      stats.total++
      stats.errors++
      console.error(`❌ [${agentName}] fetch error:`, (err as Error).message)
    }

    await new Promise(r => setTimeout(r, intervalMs))
  }
}
