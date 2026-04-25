// @ts-nocheck
/**
4:  * ops-gateway — Minimal Router for Fallback
5:  */
6: import { buildCorsHeaders } from '../_shared/cors.ts';
7: import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
8: import { logger } from '../_shared/logger.ts';
9: import { z } from 'https://esm.sh/zod@3.23.8';
10: import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';
11: import { servePublic } from '../_shared/serve-public.ts';
12: 
13: const FETCH_TIMEOUT_MS = 45000;
14: const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
15: const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
16: 
17: // ── Flat proxy map: "namespace:action" → target function ────────────────
18: const ACTION_TO_FUNCTION: Record<string, string> = {
19:   // Reports
20:   'report:compliance': 'ops-reports',
21:   'report:executive': 'ops-reports',
22:   'report:explainable': 'ops-reports',
23:   'report:security': 'ops-reports',
24:   'report:weekly': 'ops-reports',
25:   'report:auto': 'ops-reports',
26:   'report:scheduled': 'ops-reports',
27:   'report:list': 'list-reports',
28: 
29:   // Checks
30:   'check:check-task-sla-breach': 'ops-checks',
31:   'check:evaluate-job-slo': 'ops-checks',
32:   'check:check-installation-health': 'ops-checks',
33:   'check:check-production-health': 'ops-checks',
34:   'check:detect-stuck-installations': 'ops-checks',
35:   'check:get-installation-pipeline-metrics': 'ops-checks',
36:   'check:cron-sentinel': 'ops-checks',
37:   'check:check-stuck-jobs': 'ops-checks',
38:   'check:build-watchdog': 'ops-checks',
39:   'check:calculate-behavioral-baselines': 'ops-checks',
40:   'check:compute-compliance-benchmarks': 'ops-checks',
41:   'check:check-pending-agents': 'ops-checks',
42:   'check:monitor-thresholds': 'ops-checks',
43:   'check:health-monitor': 'ops-checks',
44:   'check:watchdog-non-execution': 'ops-checks',
45:   'check:check-action-effectiveness': 'ops-checks',
46:   'check:analyze-job-failure-patterns': 'ops-checks',
47:   'check:sli-collector': 'ops-checks',
48:   'check:analyze-confidence-gap-trend': 'ops-checks',
49:   'check:analyze-network-anomalies': 'ops-checks',
50:   'check:secret-rotation-compliance': 'ops-checks',
51:   'check:record-secret-rotation': 'ops-checks',
52:   'check:honeypot-alerts': 'ops-checks',
53:   'check:honeypot-dispatch-ai': 'ops-checks',
54:   'check:ai-behavioral-anomaly-detector': 'ops-checks',
55:   'check:check-agent-integrity': 'ops-checks',
56:   'check:drift-detect': 'ops-checks',
57:   'check:run-rls-tests': 'ops-checks',
58:   'check:rate-limit-check': 'ops-checks',
59:   'check:access-review': 'ops-checks',
60:   'check:ai-predict-agent-failure': 'ai-predict-agent-failure',
61:   'check:ai-system-analyzer': 'ai-system-analyzer',
62: 
63:   // Sync / Jobs / EDR
64:   'sync:process-failed-jobs': 'ops-sync',
65:   'sync:process-scheduled-jobs': 'ops-sync',
66:   'sync:invoke-scheduled-jobs': 'ops-sync',
67:   'sync:dlq-action': 'ops-sync',
68:   'sync:process-dlq-retries': 'ops-sync',
69:   'security:fetch-nvd-cves': 'ops-sync',
70:   'security:correlate-edr-events': 'ops-sync',
71:   'security:evaluate-edr-detections': 'ops-sync',
72:   'sync:ai-insight-dispatcher': 'ai-insight-dispatcher',
73: 
74:   // Playbooks
75:   'playbook:execute-playbook': 'ops-playbook',
76:   'playbook:process-playbook-trigger-logs': 'ops-playbook',
77:   'playbook:rollback-by-decision-event': 'ops-playbook',
78:   'playbook:rollback-remediation': 'ops-playbook',
79:   'playbook:resolve-action-policy': 'ops-playbook',
80:   'playbook:soar-engine': 'ops-playbook',
81:   'playbook:auto-execute-ai-actions': 'ops-playbook',
82:   'playbook:oncall-integration': 'ops-playbook',
83:   'playbook:create-itsm-ticket': 'ops-playbook',
84:   'playbook:execute-playbook-action': 'execute-playbook-action',
85:   'playbook:evaluate-playbook-triggers': 'evaluate-playbook-triggers',
86:   'playbook:evaluate-automation-rules': 'evaluate-automation-rules',
87:   'playbook:auto-remediate': 'auto-remediate',
88:   'playbook:autonomous-safe-mode': 'autonomous-safe-mode',
89:   'playbook:evaluate-software-risk': 'evaluate-software-risk',
90: };
91: 
92: const RouterSchema = z.object({
93:   action: z.string().min(1).max(80),
94:   payload: z.record(z.unknown()).optional().default({}),
95: });
96: 
97: function forwardHeaders(req: Request, requestId: string): Record<string, string> {
98:   const h: Record<string, string> = {
99:     'Content-Type': 'application/json',
100:     'X-Request-ID': requestId,
101:     'X-Trace-ID': requestId,
102:     'Authorization': req.headers.get('Authorization') || `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
103:     'apikey': req.headers.get('apikey') || SUPABASE_SERVICE_ROLE_KEY,
104:   };
105:   // Copy relevant headers
106:   ['X-Internal-Secret', 'X-Agent-Token', 'X-HMAC-Signature', 'X-Timestamp', 'X-Nonce', 'x-cron-source'].forEach(name => {
107:     const v = req.headers.get(name);
108:     if (v) h[name] = v;
109:   });
110:   return h;
111: }
112: 
113: servePublic(async (req, ctx) => {
114:   const { requestId, body } = ctx;
115:   const startedAt = Date.now();
116:   const origin = req.headers.get('origin');
117: 
118:   try {
119:     const authError = await assertInternalCaller(req, { allowAuthenticatedUsers: true });
120:     if (authError) return authError;
121: 
122:     const parsed = RouterSchema.safeParse(body);
123:     if (!parsed.success) return { error: 'Invalid request', details: parsed.error.flatten().fieldErrors, __status: 400 };
124: 
125:     const { action, payload } = parsed.data;
126:     const targetFn = ACTION_TO_FUNCTION[action];
127: 
128:     if (!targetFn) {
129:       return { error: `Unknown action: ${action}`, __status: 404 };
130:     }
131: 
132:     const url = `${SUPABASE_URL}/functions/v1/${targetFn}`;
133:     logger.info(`[ops-gateway] Routing: ${action} → ${targetFn}`, { requestId });
134: 
135:     const response = await fetchWithTimeout(url, {
136:       method: 'POST',
137:       headers: forwardHeaders(req, requestId),
138:       body: JSON.stringify(body), // Send original body (action + payload)
139:       timeoutMs: FETCH_TIMEOUT_MS,
140:     });
141: 
142:     const responseData = await response.text();
143:     let json;
144:     try { json = JSON.parse(responseData); } catch { json = { message: responseData }; }
145: 
146:     return new Response(JSON.stringify(json), {
147:       status: response.status,
148:       headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
149:     });
150:   } catch (err) {
151:     logger.error('[ops-gateway] Router error:', err);
152:     return { error: 'Internal router error', message: err instanceof Error ? err.message : 'Unknown', requestId, __status: 500 };
153:   }
154: });
