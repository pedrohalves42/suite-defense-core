
# Plano: Consolidação de Edge Functions (186 → <60)

## Análise Atual

- **186 funções standalone** (excluindo `api-gateway`, `ops-gateway`, `_shared`)
- **api-gateway**: 30 handlers inlined + ~70 proxied (ainda chamam standalone via HTTP)
- **ops-gateway**: 65 handlers inlined (check, sync, cleanup, notify, honeypot, cron)
- **Problema**: As funções proxied ainda existem como standalone — o proxy reduz cold starts no caller mas NÃO elimina a função

## Funções que DEVEM permanecer standalone (~20)

Estas funções são chamadas diretamente por agentes, webhooks externos ou têm requisitos especiais:

| Função | Razão |
|--------|-------|
| `heartbeat` | Agentes chamam diretamente (alta frequência) |
| `poll-jobs` | Agentes chamam diretamente |
| `ack-job` | Agentes chamam diretamente |
| `submit-router` | Router de telemetria dos agentes |
| `collect-router` | Router de coleta dos agentes |
| `submit-system-metrics` | Agentes enviam diretamente |
| `submit-job-result` | Agentes enviam diretamente |
| `submit-processes` | Agentes enviam diretamente |
| `submit-vuln-findings` | Agentes enviam diretamente |
| `submit-web-activity` | Agentes enviam diretamente |
| `submit-antivirus-status` | Agentes enviam diretamente |
| `submit-software-inventory` | Agentes enviam diretamente |
| `submit-rollback-event` | Agentes enviam diretamente |
| `enroll-agent` | Agentes chamam na instalação |
| `post-installation-telemetry` | Agentes enviam pós-install |
| `stripe-webhook` | Stripe chama diretamente |
| `health` | Health check público |
| `serve-installer` | Download público de instaladores |
| `serve-dns-filter` | Agentes consultam DNS filter |
| `serve-agent-update` | Agentes baixam atualizações |
| `honeypot-handler` | Honeypot público |
| `approve-via-token` | Links de aprovação por email |
| `track-installation-event` | Agentes enviam eventos |
| `validate-hmac-signature` | Agentes validam HMAC |

**Total standalone obrigatório: ~24**

## Meta: 186 → ≤55 (eliminar ~131 funções)

---

## Fase 1: Inline das funções PROXIED no api-gateway (~70 funções)

Estas funções JÁ têm rotas no api-gateway mas ainda existem como standalone (proxy via HTTP). Convertê-las em handlers inlined:

### 1A. Security namespace (~28 funções → handlers)
Criar `api-gateway/handlers/security.ts` e `security-intel.ts`:
- `auto-block-threats`, `auto-quarantine`, `quarantine-agent`, `apply-security-patch`
- `check-credential-leaks`, `check-failed-logins`, `clear-failed-logins`, `record-failed-login`
- `detect-blocked-attempts`, `security-monitor`, `security-alert-dispatcher`
- `build-security-graph`, `populate-security-graph`, `integrity-sentinel`
- `classify-shadow-it`, `scan-virus`, `scan-vulnerabilities`
- `fetch-nvd-cves`, `translate-cve`, `sync-cve-database`
- `publish-threat-ioc`, `threat-intelligence-lookup`, `correlate-edr-events`
- `evaluate-edr-detections`, `mitre-sync`, `siem-export`, `run-rls-tests`, `security-advisor`

### 1B. Build namespace (~15 funções → handlers)
Criar `api-gateway/handlers/build.ts`:
- `build-agent-exe`, `build-callback`, `generate-deploy-package`, `generate-portable-installer`
- `generate-enrollment-key`, `auto-generate-enrollment`, `auto-renew-enrollment-keys`
- `revoke-enrollment-key`, `register-agent-release`, `sign-release`, `upload-release-content`
- `validate-build-pipeline`, `confirm-force-update`, `get-diagnostic-script`

### 1C. Agent namespace (~24 funções → handlers)
Criar `api-gateway/handlers/agent.ts` e `agent-reinstall.ts`:
- `agent-snapshot`, `agent-version-management`, `check-agent-integrity`
- `check-agent-name-availability`, `check-agent-updates`, `diagnose-agent`
- `diagnostics-agent-logs`, `get-agent-config`, `get-agent-dashboard-data`
- `get-agent-policy`, `get-agent-script-content`, `get-agent-timeline`
- `get-latest-agent-script`, `promote-agent-v5`, `recover-agent-credentials`
- `register-agent-key`, `setup-agent-script`, `token-rotate`
- `force-reinstall-fleet`, `create-reinstall-jobs`, `get-reinstall-by-name`
- `get-reinstall-preserve-script`, `get-reinstall-script`

**Resultado Fase 1**: Eliminar ~67 funções standalone. Restam ~119.

---

## Fase 2: Criar ai-gateway (~12 funções)

Novo gateway `ai-gateway/index.ts` com handlers inlined:
- `ai-action-executor`, `ai-agent-assist`, `ai-analyze-agent`
- `ai-behavioral-anomaly-detector`, `ai-full-audit`, `ai-insight-dispatcher`
- `ai-predict-agent-failure`, `ai-quality-check`, `ai-red-team-assessment`
- `ai-router` (absorver), `ai-system-analyzer`, `ai-system-audit`

Handlers: `ai-gateway/handlers/analysis.ts`, `ai-gateway/handlers/automation.ts`

**Resultado Fase 2**: Eliminar ~12 funções. Restam ~107.

---

## Fase 3: Expandir ops-gateway com domínios restantes (~30 funções)

### 3A. Report namespace (~8 funções)
Criar `ops-gateway/handlers/report.ts`:
- `generate-compliance-report`, `generate-executive-report`, `generate-explainable-report`
- `generate-security-report`, `generate-weekly-report`, `scheduled-report-generator`
- `list-reports`, `upload-report`, `verify-compliance-report`, `export-evidence-bundle`

### 3B. Playbook/SOAR namespace (~10 funções)
Criar `ops-gateway/handlers/soar.ts`:
- `evaluate-playbook-triggers`, `execute-playbook`, `execute-playbook-action`
- `process-playbook-trigger-logs`, `evaluate-automation-rules`, `soar-engine`
- `auto-execute-ai-actions`, `auto-remediate`, `rollback-remediation`
- `rollback-by-decision-event`, `resolve-action-policy`

### 3C. Risk/Compliance namespace (~8 funções)
Criar `ops-gateway/handlers/compliance.ts`:
- `calculate-compliance`, `calculate-risk-score`, `drift-detect`
- `evaluate-software-risk`, `compute-compliance-benchmarks` (já inlined, remover standalone)
- `update-baseline`, `run-attack-simulation`, `verify-document`

**Resultado Fase 3**: Eliminar ~26 funções. Restam ~81.

---

## Fase 4: Expandir api-gateway com domínios restantes (~30 funções)

### 4A. Auth namespace (~8 funções)
Criar `api-gateway/handlers/auth.ts`:
- `accept-invite`, `delete-invite`, `send-invite`, `validate-invite`
- `change-password`, `fido2-authenticate`, `fido2-register`, `saml-sso`, `scim-provisioning`

### 4B. Tenant/Data namespace (~10 funções)
Criar `api-gateway/handlers/tenant.ts`:
- `api-tenant-features`, `api-tenant-info`, `api-tenant-stats`
- `get-blocked-websites`, `block-website`, `get-web-activity`, `get-software-inventory`
- `action-center-feed`, `create-job`, `analyze-url`
- `submit-contact`, `oncall-integration`, `create-itsm-ticket`

### 4C. Honeypot namespace (~4 funções)
Criar `api-gateway/handlers/honeypot.ts`:
- `activate-agent-honeypot`, `revert-agent-honeypot`, `create-honeypot-pool`

### 4D. Misc namespace (~5 funções)
- `rate-limit-check`, `autonomous-safe-mode`, `check-subscription` (já inlined, deletar standalone)
- `customer-portal` (já inlined), `create-checkout` (já inlined)
- `revenue-projections`, `unit-economics`, `sales-pipeline`, `subscription-analytics`
  (todos já inlined no api-gateway — deletar standalone)

**Resultado Fase 4**: Eliminar ~27 funções. Restam ~54.

---

## Fase 5: Limpeza de funções duplicadas/já-inlined

Funções que já estão inlined nos gateways mas cujos diretórios standalone ainda existem:
- Todos os `check-*`, `cleanup-*`, `sync-*` que estão no ops-gateway
- Todos os `billing:*` que estão no api-gateway
- `cron-sentinel`, `build-watchdog`, `monitor-thresholds`, `health-monitor`
- `sli-collector`, `analyze-confidence-gap-trend`, `analyze-network-anomalies`

Verificar se algum cron job ou agent chama diretamente. Se não, deletar.

**Resultado Fase 5**: Eliminar ~15 funções. Restam ~39.

---

## Fase 6: Validação Final

1. Verificar que nenhum frontend (`src/`) referencia função deletada
2. Verificar que nenhum cron job (`pg_cron`) chama função deletada
3. Verificar que nenhum agent script chama função deletada
4. Deploy e smoke test de todos os gateways
5. Contagem final: ≤55 funções standalone

---

## Regras de Implementação

1. **Funções >300 linhas**: Extrair lógica para `_shared/` antes de inlinar
2. **Funções com Stripe**: Usar `dynamic import` para evitar carregar SDK desnecessariamente
3. **Funções com HMAC/crypto**: Manter utilitários em `_shared/crypto-utils.ts`
4. **Testes**: Manter testes existentes, adaptar imports
5. **Frontend**: Substituir `callEdgeFunction('func-name')` por `callGateway('namespace:action')`
6. **Zero downtime**: Deletar standalone SOMENTE após confirmar que gateway funciona

## Estimativa de Impacto

- **Cold starts**: Redução de ~70% (3 gateways quentes vs 186 funções frias)
- **Custo**: Menos instâncias ativas = menor consumo de compute
- **Manutenção**: CORS, auth, tracing centralizados — menos boilerplate
