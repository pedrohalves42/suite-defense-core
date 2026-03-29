import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: buildCorsHeaders(origin) });

  // V-MIG: Add missing authentication guard - was completely unauthenticated!
  const authError = await assertInternalCaller(req);
  if (authError) return authError;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { tenant_id } = await req.json();
    if (!tenant_id) throw new Error("tenant_id required");

    const nodes: Array<Record<string, unknown>> = [];
    const edges: Array<Record<string, unknown>> = [];
    const nodeMap = new Map<string, string>(); // value -> id

    function addNode(type: string, value: string, label: string, risk: number, meta: any = {}) {
      const key = `${type}:${value}`;
      if (nodeMap.has(key)) return nodeMap.get(key)!;
      const id = crypto.randomUUID();
      nodeMap.set(key, id);
      nodes.push({
        id, tenant_id, node_type: type, node_value: value,
        label: label || value, risk_score: Math.min(risk, 100),
        metadata: meta, first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      });
      return id;
    }

    function addEdge(sourceId: string, targetId: string, rel: string, conf: number = 0.8) {
      edges.push({
        id: crypto.randomUUID(), tenant_id,
        source_node_id: sourceId, target_node_id: targetId,
        relationship: rel, confidence: conf, metadata: {},
      });
    }

    // 1. Agents as nodes
    const { data: agents } = await supabase
      .from("agents")
      .select("id, hostname, agent_state, os_type, agent_version, is_isolated")
      .eq("tenant_id", tenant_id);

    const agentNodeIds: Record<string, string> = {};
    for (const a of agents || []) {
      const risk = a.is_isolated ? 90 : a.agent_state === 'offline' ? 40 : a.agent_state === 'degraded' ? 60 : 10;
      const nid = addNode("agent", a.id, a.hostname || a.id.slice(0, 8), risk, {
        os: a.os_type, version: a.agent_version, state: a.agent_state
      });
      agentNodeIds[a.id] = nid;
    }

    // 2. Threat indicators as nodes  
    const { data: threats } = await supabase
      .from("threat_indicators")
      .select("id, indicator_type, indicator_value, severity, source, confidence_score")
      .eq("tenant_id", tenant_id)
      .eq("is_active", true)
      .limit(300);

    for (const t of threats || []) {
      const typeMap: Record<string, string> = {
        file_hash_sha256: "hash", url: "domain", ip_address: "ip",
        domain: "domain", c2_ip: "ip", file_hash_md5: "hash",
      };
      const nodeType = typeMap[t.indicator_type] || "hash";
      const risk = t.severity === 'critical' ? 95 : t.severity === 'high' ? 80 : t.severity === 'medium' ? 50 : 30;
      addNode(nodeType, t.indicator_value, t.indicator_value.slice(0, 20), risk, {
        severity: t.severity, source: t.source, confidence: t.confidence_score,
      });
    }

    // 3. Evidence logs ? extract events and connect to agents
    const { data: evidenceLogs } = await supabase
      .from("agent_evidence_logs")
      .select("agent_id, agent_name, event_type, event_data, severity")
      .eq("tenant_id", tenant_id)
      .order("created_at", { ascending: false })
      .limit(500);

    for (const ev of evidenceLogs || []) {
      if (!ev.agent_id || !agentNodeIds[ev.agent_id]) continue;
      const agentNid = agentNodeIds[ev.agent_id];

      // Extract IPs, domains, hashes from event_data
      const data = ev.event_data as Record<string, unknown>;
      if (!data) continue;

      const jsonStr = JSON.stringify(data);

      // Extract IPs
      const ipMatch = jsonStr.match(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g);
      if (ipMatch) {
        for (const ip of [...new Set(ipMatch)].slice(0, 5)) {
          if (ip === '127.0.0.1' || ip === '0.0.0.0') continue;
          const ipRisk = ev.severity === 'critical' ? 85 : ev.severity === 'high' ? 70 : 30;
          const ipNid = addNode("ip", ip, ip, ipRisk, { from_event: ev.event_type });
          addEdge(agentNid, ipNid, `evidence:${ev.event_type}`, 0.7);
        }
      }

      // Extract hashes (SHA256)
      const hashMatch = jsonStr.match(/\b[a-f0-9]{64}\b/gi);
      if (hashMatch) {
        for (const hash of [...new Set(hashMatch)].slice(0, 3)) {
          const hNid = addNode("hash", hash, hash.slice(0, 16) + "?", 60, { from_event: ev.event_type });
          addEdge(agentNid, hNid, "detected_hash", 0.9);
        }
      }

      // Extract process names if present
      if (data.process_name || data.processName) {
        const pName = data.process_name || data.processName;
        const pNid = addNode("process", `${ev.agent_id}:${pName}`, pName, 
          ev.severity === 'critical' ? 80 : 40, { agent: ev.agent_name });
        addEdge(agentNid, pNid, "ran_process", 0.9);
      }
    }

    // 4. Threat matches ? connect agents to IoCs
    const { data: matches } = await supabase
      .from("threat_matches")
      .select("agent_id, indicator_id, match_type, detected_value")
      .eq("tenant_id", tenant_id)
      .limit(200);

    for (const m of matches || []) {
      if (!m.agent_id || !agentNodeIds[m.agent_id]) continue;
      const key = `hash:${m.detected_value}`;
      if (nodeMap.has(key)) {
        addEdge(agentNodeIds[m.agent_id], nodeMap.get(key)!, "threat_match", 0.95);
      }
    }

    // 5. Blocked access attempts ? IPs/domains
    const { data: blocked } = await supabase
      .from("blocked_access_attempts")
      .select("agent_id, blocked_target, block_type, severity")
      .eq("tenant_id", tenant_id)
      .limit(200);

    for (const b of blocked || []) {
      if (!b.agent_id || !agentNodeIds[b.agent_id]) continue;
      const bType = b.block_type === 'domain' ? 'domain' : 'ip';
      const bRisk = b.severity === 'critical' ? 90 : b.severity === 'high' ? 75 : 45;
      const bNid = addNode(bType, b.blocked_target, b.blocked_target, bRisk, { block_type: b.block_type });
      addEdge(agentNodeIds[b.agent_id], bNid, "blocked_access", 0.85);
    }

    // 6. Vuln findings ? CVE nodes
    const { data: vulns } = await supabase
      .from("vuln_findings")
      .select("agent_id, cve_id, severity, affected_software")
      .eq("tenant_id", tenant_id)
      .limit(200);

    for (const v of vulns || []) {
      if (!v.agent_id || !agentNodeIds[v.agent_id] || !v.cve_id) continue;
      const cveRisk = v.severity === 'critical' ? 95 : v.severity === 'high' ? 75 : 40;
      const cNid = addNode("cve", v.cve_id, v.cve_id, cveRisk, { software: v.affected_software });
      addEdge(agentNodeIds[v.agent_id], cNid, "vulnerable_to", 0.9);
    }

    // Clear existing graph for this tenant and insert new
    await supabase.from("security_graph_edges").delete().eq("tenant_id", tenant_id);
    await supabase.from("security_graph_nodes").delete().eq("tenant_id", tenant_id);

    // Insert nodes in batches
    for (let i = 0; i < nodes.length; i += 100) {
      const batch = nodes.slice(i, i + 100);
      const { error } = await supabase.from("security_graph_nodes").insert(batch);
      if (error) logger.error("Node insert error:", error);
    }

    // Insert edges in batches
    for (let i = 0; i < edges.length; i += 100) {
      const batch = edges.slice(i, i + 100);
      const { error } = await supabase.from("security_graph_edges").insert(batch);
      if (error) logger.error("Edge insert error:", error);
    }

    return new Response(JSON.stringify({
      success: true,
      nodes_created: nodes.length,
      edges_created: edges.length,
      breakdown: {
        agents: (agents || []).length,
        threats: (threats || []).length,
        evidence_processed: (evidenceLogs || []).length,
      }
    }), { headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" }
    });
  }
});
