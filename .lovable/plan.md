
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
