
# Fase 1A: Inline Security Namespace (28 proxied → handlers) ✅ CONCLUÍDO

## Resultado
- 28 funções de segurança inlined nos gateways (api-gateway + ops-gateway)
- Handlers criados: security-threats.ts, security-scanning.ts, security-intel.ts (api-gateway) + security-ops.ts (ops-gateway)
- 6 funções mantidas standalone (auth específica): scan-virus, submit-vuln-findings, update-baseline, check-failed-logins, record-failed-login, translate-cve

---

# Fase 1B: Inline Honeypot + Anomaly + Block-Website (5 → handlers) ✅ CONCLUÍDO

## Funções Migradas (5)

| Função | Gateway | Handler | Auth Original |
|--------|---------|---------|--------------|
| `activate-agent-honeypot` | api-gateway | `handlers/honeypot.ts` | serveTenant |
| `revert-agent-honeypot` | api-gateway | `handlers/honeypot.ts` | serveTenant |
| `create-honeypot-pool` | ops-gateway | `handlers/honeypot-pool.ts` | serveInternal |
| `ai-behavioral-anomaly-detector` | ops-gateway | `handlers/anomaly-ops.ts` | serveInternal |
| `block-website` | ops-gateway | `handlers/block-website.ts` | serveInternal |

## Ações Registradas

| Gateway | Action | Handler |
|---------|--------|---------|
| api-gateway | `security:activate-agent-honeypot` | handleActivateAgentHoneypot |
| api-gateway | `security:revert-agent-honeypot` | handleRevertAgentHoneypot |
| ops-gateway | `sync:create-honeypot-pool` | handleCreateHoneypotPool |
| ops-gateway | `check:ai-behavioral-anomaly-detector` | handleAiBehavioralAnomalyDetector |
| ops-gateway | `security:block-website` | handleBlockWebsite |

## Funções Mantidas Standalone (3) — Auth Especial

| Função | Razão |
|--------|-------|
| `honeypot-handler` | serveHoneypot — auth customizada para agentes em modo honeypot |
| `get-blocked-websites` | serveAgent/HMAC — chamada diretamente pelos agentes |
| `serve-dns-filter` | serveAgent/HMAC — chamada diretamente pelos agentes |

## Ganhos Fase 1B
- **-5 cold starts** por chamada
- **-5 funções** no total
- **ai-router** atualizado: removido proxy para `ai-behavioral-anomaly-detector` (era serveInternal, não acessível via ai-router)
