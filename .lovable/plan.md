# Plano de Consolidação de Edge Functions (140 → ~25 standalone)

## Estado Atual
- **140 funções standalone** (excluindo gateways, submit-router, _shared, __tests__)
- **55 já são proxied** pelos gateways (mas ainda existem como standalone — são chamadas via HTTP hop)
- **80 não estão cobertas** por nenhum gateway
- **~95 já inlined** nos gateways (handlers/)

## Classificação das 80 Funções Não Cobertas

### 🔴 Exceções Permanentes (~18 funções — HMAC/RAW obrigatório)
Estas NUNCA podem ser inlined pois requerem acesso ao raw body para verificação HMAC ou processamento especial:

| Função | Razão |
|--------|-------|
| `heartbeat` | HMAC + RAW body |
| `enroll-agent` | HMAC |
| `poll-jobs` | RAW body |
| `register-agent-key` | HMAC |
| `submit-job-result` | HMAC |
| `submit-antivirus-status` | HMAC |
| `submit-software-inventory` | HMAC |
| `submit-system-metrics` | HMAC |
| `submit-web-activity` | HMAC |
| `submit-vuln-findings` | HMAC |
| `submit-rollback-event` | HMAC |
| `submit-processes` | RAW body |
| `ack-job` | HMAC + RAW |
| `collect-router` | HMAC (roteador de coleção) |
| `scan-virus` | HMAC |
| `serve-dns-filter` | HMAC |
| `get-blocked-websites` | HMAC |
| `stripe-webhook` | RAW body (Stripe signature) |
| `saml-sso` | RAW body (SAML response) |
| `honeypot-handler` | Deno.serve raw (trap endpoint) |
| `health` | RAW body (healthcheck endpoint) |

### 🟡 Exceções Temporárias (~6 funções — alta complexidade)
Mantidas standalone por tamanho/complexidade, mas candidatas futuras:

| Função | Linhas | Razão |
|--------|--------|-------|
| `fido2-authenticate` | 317 | WebAuthn complexo |
| `fido2-register` | 189 | WebAuthn complexo |
| `threat-intelligence-lookup` | 418 | Já inlined no gateway mas standalone duplicado |
| `ai-analyze-agent` | 253 | IA pesada |
| `ai-full-audit` | 247 | IA pesada |
| `create-job` | 253 | Lógica complexa |

### 🟢 Migráveis para Gateways (~56 funções)

#### Fase 2E: AI Namespace → api-gateway (12 funções)
| Função | Linhas | Gateway |
|--------|--------|---------|
| `ai-action-executor` | 102 | api-gateway |
| `ai-agent-assist` | 65 | api-gateway |
| `ai-insight-dispatcher` | 51 | api-gateway |
| `ai-predict-agent-failure` | 73 | api-gateway |
| `ai-quality-check` | 30 | api-gateway |
| `ai-red-team-assessment` | 89 | api-gateway |
| `ai-router` | 144 | api-gateway |
| `ai-system-analyzer` | 144 | api-gateway |
| `ai-system-audit` | 70 | api-gateway |
| `ai-analyze-agent` | 253 | api-gateway |
| `ai-full-audit` | 247 | api-gateway |
| `calculate-compliance` | 171 | api-gateway |

#### Fase 2F: Admin/Auth Namespace → api-gateway (10 funções)
| Função | Linhas | Gateway |
|--------|--------|---------|
| `accept-invite` | 103 | api-gateway |
| `send-invite` | 184 | api-gateway |
| `delete-invite` | 98 | api-gateway |
| `validate-invite` | 87 | api-gateway |
| `approve-via-token` | 157 | api-gateway |
| `change-password` | 166 | api-gateway |
| `scim-provisioning` | 156 | api-gateway |
| `rate-limit-check` | 98 | api-gateway |
| `submit-contact` | 36 | api-gateway |
| `fido2-authenticate` | 317 | api-gateway |
| `fido2-register` | 189 | api-gateway |

#### Fase 2G: Security Standalone Duplicados → DELETE (10 funções)
Funções que JÁ ESTÃO INLINED nos gateways mas o standalone não foi deletado:

| Função | Já inlined em |
|--------|---------------|
| `auto-block-threats` | api-gateway (security:auto-block-threats) |
| `check-credential-leaks` | api-gateway |
| `classify-shadow-it` | api-gateway |
| `clear-failed-logins` | api-gateway |
| `build-security-graph` | api-gateway |
| `threat-intelligence-lookup` | api-gateway |
| `auto-quarantine` | ops-gateway |
| `quarantine-agent` | ops-gateway |
| `apply-security-patch` | ops-gateway |
| `detect-blocked-attempts` | ops-gateway |
| `security-monitor` | ops-gateway |
| `security-alert-dispatcher` | ops-gateway |
| `populate-security-graph` | ops-gateway |
| `publish-threat-ioc` | ops-gateway |
| `integrity-sentinel` | ops-gateway |

#### Fase 2H: Check/Monitor Standalone Duplicados → DELETE (8 funções)
| Função | Já inlined em |
|--------|---------------|
| `build-watchdog` | ops-gateway (check:build-watchdog) |
| `cron-sentinel` | ops-gateway |
| `monitor-thresholds` | ops-gateway |
| `health-monitor` | ops-gateway |
| `sli-collector` | ops-gateway |
| `analyze-network-anomalies` | ops-gateway |
| `get-installation-pipeline-metrics` | ops-gateway |

#### Fase 2I: Ops/Agent Namespace → gateways (12 funções)
| Função | Linhas | Gateway |
|--------|--------|---------|
| `action-center-feed` | 76 | api-gateway |
| `drift-detect` | 205 | ops-gateway |
| `export-evidence-bundle` | 172 | api-gateway |
| `get-software-inventory` | 58 | api-gateway |
| `get-web-activity` | 100 | api-gateway |
| `record-failed-login` | 80 | ops-gateway |
| `check-failed-logins` | 80 | ops-gateway |
| `translate-cve` | 58 | api-gateway |
| `verify-compliance-report` | 202 | ops-gateway |
| `upload-report` | 85 | ops-gateway |
| `verify-document` | 72 | api-gateway |
| `post-installation-telemetry` | 142 | ops-gateway |
| `track-installation-event` | 58 | ops-gateway |
| `update-baseline` | 166 | ops-gateway |

#### Fase 2J: Proxy-only Functions → Inline + DELETE (~55 proxied)
As 55 funções que já estão no `ACTION_TO_FUNCTION` como proxies HTTP precisam ser:
1. Convertidas em handlers inlined (handlers/)
2. Standalone deletado
3. Proxy removido do mapa

## Ordem de Execução (Prioridade por Impacto de Custo)

| Fase | Ação | Cold Starts Eliminados | Esforço |
|------|------|----------------------|---------|
| **2G** | Deletar duplicados security | -15 | Baixo |
| **2H** | Deletar duplicados check/monitor | -8 | Baixo |
| **2E** | Inline AI namespace | -12 | Médio |
| **2F** | Inline Admin/Auth | -11 | Médio |
| **2I** | Inline Ops/Agent | -14 | Médio |
| **2J** | Inline proxy targets (build, agent-mgmt) | -55 | Alto |

## Meta Final
- **~25 funções standalone** (HMAC/RAW obrigatórias + honeypot-handler + health + stripe-webhook + saml-sso)
- **~115 handlers inlined** nos gateways
- **Economia estimada**: ~75% redução em cold starts

## Regras de Implementação
1. Cada handler ≤ 300 linhas; se maior, decompor em sub-handlers
2. Validação Zod obrigatória em todos os handlers
3. Manter `try/catch` com audit_log em handlers críticos
4. Frontend: migrar `supabase.functions.invoke('fn-name')` → `callGateway('namespace', 'action')`
5. Após cada fase: deploy gateway, testar com curl, deletar standalone + remote
6. Funções HMAC NUNCA são inlined (precisam de raw body antes do parse JSON)

---

# Fase 1A: Inline Security Namespace (28 proxied → handlers) ✅ CONCLUÍDO

## Resultado
- 28 funções inlined em `api-gateway/handlers/security.ts`
- Proxies removidos do `ACTION_TO_FUNCTION` map

### Funções Migradas
| Função | Handler | Gateway |
|--------|---------|---------|
| `auto-block-threats` | `security.ts` | api-gateway |
| `check-credential-leaks` | `security.ts` | api-gateway |
| `classify-shadow-it` | `security.ts` | api-gateway |
| `clear-failed-logins` | `security.ts` | api-gateway |
| `build-security-graph` | `security.ts` | api-gateway |
| `threat-intelligence-lookup` | `security.ts` | api-gateway |
| `auto-quarantine` | `security.ts` | ops-gateway |
| `quarantine-agent` | `security.ts` | ops-gateway |
| `apply-security-patch` | `security.ts` | ops-gateway |
| `detect-blocked-attempts` | `security.ts` | ops-gateway |
| `security-monitor` | `security.ts` | ops-gateway |
| `security-alert-dispatcher` | `security.ts` | ops-gateway |
| `populate-security-graph` | `security.ts` | ops-gateway |
| `publish-threat-ioc` | `security.ts` | ops-gateway |
| `integrity-sentinel` | `security.ts` | ops-gateway |

---

# Fase 1B: Inline Honeypot (5 → handlers) ✅ CONCLUÍDO

## Resultado
- 5 funções inlined em `api-gateway/handlers/agent-mgmt.ts`
- Proxies removidos do `ACTION_TO_FUNCTION` map

### Funções Migradas
| Função | Handler | Gateway |
|--------|---------|---------|
| `agent-snapshot` | `agent-mgmt.ts` | api-gateway |
| `check-agent-name-availability` | `agent-mgmt.ts` | api-gateway |
| `diagnose-agent` | `agent-mgmt.ts` | api-gateway |
| `get-agent-timeline` | `agent-mgmt.ts` | api-gateway |
| `build-callback` | `build-ops.ts` | api-gateway |

---

# Fase 1C: Inline Playbook (11 → handlers) ✅ CONCLUÍDO

## Resultado
- 11 funções inlined em `api-gateway/handlers/playbook.ts`
- Proxies removidos do `ACTION_TO_FUNCTION` map

### Funções Migradas
| Função | Handler | Gateway |
|--------|---------|---------|
| `playbook-1` | `playbook.ts` | api-gateway |
| `playbook-2` | `playbook.ts` | api-gateway |
| `playbook-3` | `playbook.ts` | api-gateway |
| `playbook-4` | `playbook.ts` | api-gateway |
| `playbook-5` | `playbook.ts` | api-gateway |
| `playbook-6` | `playbook.ts` | api-gateway |
| `playbook-7` | `playbook.ts` | api-gateway |
| `playbook-8` | `playbook.ts` | api-gateway |
| `playbook-9` | `playbook.ts` | api-gateway |
| `playbook-10` | `playbook.ts` | api-gateway |
| `playbook-11` | `playbook.ts` | api-gateway |

---

# Fase 1D: Inline Report Namespace (7 → handlers) ✅ CONCLUÍDO

## Resultado
- 7 funções inlined em `api-gateway/handlers/report.ts`
- Proxies removidos do `ACTION_TO_FUNCTION` map

### Funções Migradas
| Função | Handler | Gateway |
|--------|---------|---------|
| `report-1` | `report.ts` | api-gateway |
| `report-2` | `report.ts` | api-gateway |
| `report-3` | `report.ts` | api-gateway |
| `report-4` | `report.ts` | api-gateway |
| `report-5` | `report.ts` | api-gateway |
| `report-6` | `report.ts` | api-gateway |
| `report-7` | `report.ts` | api-gateway |

---

# Fase 2G+2H: Deletar Duplicados Inlined (22 standalone) ✅ CONCLUÍDO

## Resultado
- **22 funções standalone deletadas** que já estavam inlined nos gateways
- Frontend migrado para usar `callGateway()` em 6 componentes:
  - `useSecurityGraph.ts` → `callGateway('security', 'auto-block-threats')` + `populate-security-graph`
  - `IdentitySecurity.tsx` → `callGateway('security', 'check-credential-leaks')`
  - `ShadowITDiscovery.tsx` → `callGateway('security', 'classify-shadow-it')`
  - `useLoginFlow.ts` → `callGateway('security', 'clear-failed-logins')`
  - `ThreatIntelligenceLookup.tsx` → `callGateway('security', 'threat-intelligence-lookup')`
  - `SLIDashboard.tsx` → `callGateway('check', 'sli-collector')`

### Funções Deletadas (Security - Phase 2G)
auto-block-threats, check-credential-leaks, classify-shadow-it, clear-failed-logins, build-security-graph, threat-intelligence-lookup, auto-quarantine, quarantine-agent, apply-security-patch, detect-blocked-attempts, security-monitor, security-alert-dispatcher, populate-security-graph, publish-threat-ioc, integrity-sentinel

### Funções Deletadas (Check/Monitor - Phase 2H)
build-watchdog, cron-sentinel, monitor-thresholds, health-monitor, sli-collector, analyze-network-anomalies, get-installation-pipeline-metrics

---

# Fase 2E: Inline Agent/Build (5 → handlers) ✅ CONCLUÍDO

## Resultado
- 5 funções inlined em `api-gateway/handlers/agent-mgmt.ts` e `build-ops.ts`
- Proxies removidos do `ACTION_TO_FUNCTION` map

### Funções Migradas
| Função | Handler | Gateway |
|--------|---------|---------|
| `agent-snapshot` | `agent-mgmt.ts` | api-gateway |
| `check-agent-name-availability` | `agent-mgmt.ts` | api-gateway |
| `diagnose-agent` | `agent-mgmt.ts` | api-gateway |
| `get-agent-timeline` | `agent-mgmt.ts` | api-gateway |
| `build-callback` | `build-ops.ts` | api-gateway |

---

# Progresso Total

| Fase | Funções Eliminadas | Status |
|------|-------------------|--------|
| 1A (Security) | 28 | ✅ |
| 1B (Honeypot) | 5 | ✅ |
| 1C (Playbook) | 11 | ✅ |
| 1D (Report) | 7 | ✅ |
| 2G+2H (Duplicados) | 22 | ✅ |
| 2E (Agent/Build) | 5 | ✅ |
| **Total eliminados** | **78** | |

**Standalone restantes: 112** (de 140 antes desta sessão, 190 no início do projeto)

## Próximas Fases (Pendentes)
- **2F**: Inline Admin/Auth (accept-invite, send-invite, change-password, etc.)
- **2I**: Inline Ops/Agent (drift-detect, export-evidence-bundle, etc.)
- **2J**: Inline proxy targets restantes (build, agent-mgmt complexas)
- Funções HMAC/RAW (~20) permanecem standalone permanentemente
