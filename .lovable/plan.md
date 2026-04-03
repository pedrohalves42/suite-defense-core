
# Consolidação Completa de Edge Functions — Plano Master

## Estado Atual
- **107 funções standalone** (excluindo gateways)
- **~68 handlers inlined** no api-gateway
- **~96 handlers inlined** no ops-gateway  
- **18 proxy entries** no api-gateway + 3 API-key proxy
- **7 proxy entries** no ops-gateway
- **Meta:** < 60 funções standalone

---

## FASE 1: Quick Wins — Deletar Diretórios Zumbis (0 risco)
Funções já inlined nos gateways SEM chamadas diretas do frontend.
**Ação:** Deletar diretórios standalone + remover do Supabase.

| Função | Inlined como | Chamadas diretas |
|--------|-------------|-----------------|
| accept-invite | admin:accept-invite | 0 |
| send-invite | admin:send-invite | 0 |
| generate-enrollment-key | build:generate-enrollment-key | 0 |
| revoke-enrollment-key | build:revoke-enrollment-key | 0 |
| get-software-inventory | agent:get-software-inventory | 0 |
| get-web-activity | agent:get-web-activity | 0 |
| token-rotate | agent:token-rotate | 0 |
| agent-version-management | agent:agent-version-management | 0 |

**Resultado:** 107 → 99 standalone (-8)

---

## FASE 2: Migrar Frontend + Deletar (baixo risco)
Funções inlined mas ainda com chamadas `functions.invoke()` diretas. Migrar para `callGateway()`.

| Função | Inlined como | Chamadas | Ação Frontend |
|--------|-------------|----------|---------------|
| delete-invite | admin:delete-invite | 2 | → callGateway('admin','delete-invite') |
| get-agent-dashboard-data | agent:get-agent-dashboard-data | 1 | → callGateway('agent','get-agent-dashboard-data') |
| recover-agent-credentials | agent:recover-agent-credentials | 2 | → callGateway('agent','recover-agent-credentials') |

**Resultado:** 99 → 96 standalone (-3)

---

## FASE 3: Inline novos serveTenant simples no api-gateway
Funções single-file serveTenant que podem ser convertidas em handlers.

### 3A — Funções chamadas pelo frontend (migrar invoke → callGateway):
| Função | Files | Frontend calls |
|--------|-------|---------------|
| calculate-compliance | 2 | 3 |
| create-job | 1 | 6 |
| export-evidence-bundle | 1 | 1 |
| translate-cve | 1 | 1 |
| analyze-url | 1 | 0 |
| change-password | 1 | 0 |
| fido2-register | 1 | 0 |
| create-reinstall-jobs | 1 | 0 (proxy only) |

### 3B — Funções complexas (multi-file, inline custo alto → manter como proxy):
| Função | Files/Dirs | Razão |
|--------|-----------|-------|
| action-center-feed | 5 files | Multi-módulo |
| ai-router | 2 files + 1 dir | Roteador AI complexo |
| ai-agent-assist | 3 files | AI complexo |
| ai-red-team-assessment | 5 files | AI + multi-módulo |
| build-agent-exe | 4 files | GitHub Actions dispatch |
| scan-vulnerabilities | 3 files | Scanner multi-módulo |
| security-advisor | 2 files | AI + fetch externo |
| serve-installer | 6 files | Gerador complexo |
| execute-playbook-action | 3 files + 1 dir | Dispatcher decomposto |

**Resultado estimado Fase 3A:** 96 → 88 standalone (-8)

---

## FASE 4: Inline serveInternal simples no ops-gateway
Funções serveInternal que são chamadas por cron/internal.

| Função | Files | Proxy atual |
|--------|-------|------------|
| sync-cve-database | 1 | ops-gw proxy |
| mitre-sync | 1 | ops-gw proxy |
| setup-agent-script | 1 | api-gw proxy |
| upload-release-content | 1 | api-gw proxy |
| rate-limit-check | 1 | nenhum |
| ai-predict-agent-failure | 2 | nenhum |
| ai-insight-dispatcher | 4 | nenhum |
| ai-system-analyzer | 4 | nenhum |

**Resultado estimado:** 88 → 80 standalone (-8)

---

## FASE 5: Funções servePublic — avaliar consolidação parcial
servePublic não pode ir para gateways (auth incompatível), mas algumas podem ser agrupadas em um "public-gateway":

| Função | Chamadas | Status |
|--------|----------|--------|
| approve-via-token | 1 | Standalone obrigatório |
| check-failed-logins | 1 | Standalone obrigatório |
| fido2-authenticate | 0 | Standalone obrigatório |
| get-diagnostic-script | 0 | Standalone obrigatório |
| get-latest-agent-script | 0 | Standalone obrigatório |
| get-reinstall-by-name | 0 | Standalone obrigatório |
| get-reinstall-preserve-script | 0 | Standalone obrigatório |
| get-reinstall-script | 0 | Standalone obrigatório |
| health | 0 | Standalone obrigatório |
| record-failed-login | 1 | Standalone obrigatório |
| submit-contact | 1 | Standalone obrigatório |
| validate-hmac-signature | 1 | Standalone obrigatório |
| validate-invite | 0 | Standalone obrigatório |
| verify-compliance-report | 2 | Standalone obrigatório |
| verify-document | 0 | Standalone obrigatório |
| evaluate-software-risk | 0 | Standalone obrigatório |
| track-installation-event | 0 | Standalone obrigatório |
| api-tenant-features | 0 | API-key proxy |
| api-tenant-info | 0 | API-key proxy |
| api-tenant-stats | 0 | API-key proxy |

**Ação:** Manter como exceções autorizadas (20 funções).

---

## FASE 6: Funções serveAgent/HMAC — exceções autorizadas
Estas DEVEM permanecer standalone (auth HMAC incompatível com gateways):

| Função | Tipo |
|--------|------|
| ack-job | serveAgent |
| check-agent-updates | serveAgent |
| collect-router | serveAgent + subdir |
| confirm-force-update | serveAgent |
| diagnostics-agent-logs | serveAgent |
| get-agent-config | serveAgent |
| get-agent-policy | serveAgent |
| get-blocked-websites | serveAgent |
| list-reports | serveAgent |
| post-installation-telemetry | serveAgent |
| scan-virus | serveAgent |
| serve-agent-update | serveAgent + 4 files |
| serve-dns-filter | serveAgent |
| submit-antivirus-status | serveAgent |
| submit-rollback-event | serveAgent |
| submit-router | serveAgent + subdir |
| submit-software-inventory | serveAgent |
| submit-system-metrics | serveAgent |
| submit-vuln-findings | serveAgent |
| submit-web-activity | serveAgent |
| update-baseline | serveAgent |
| upload-report | serveAgent |

**Ação:** Manter como exceções autorizadas (22 funções).

---

## FASE 7: Funções Deno.serve raw — exceções autorizadas
| Função | Razão |
|--------|-------|
| enroll-agent | HMAC custom + raw body |
| heartbeat | HMAC custom + multi-file |
| poll-jobs | HMAC custom + multi-file |
| register-agent-key | HMAC custom + raw body |
| stripe-webhook | Webhook signature verification |

**Ação:** Manter como exceções autorizadas (5 funções).

---

## FASE 8: Funções especiais — avaliar caso a caso
| Função | Auth | Files | Decisão |
|--------|------|-------|---------|
| honeypot-handler | custom | 2 | Manter standalone |
| saml-sso | custom | 1 | Manter standalone |
| scim-provisioning | custom | 4 | Manter standalone |
| submit-job-result | custom | 7+1dir | Manter standalone |
| submit-processes | custom | 1 | Manter standalone |

**Ação:** Manter como exceções autorizadas (5 funções).

---

## Resumo de Resultados

| Métrica | Antes | Depois |
|---------|-------|--------|
| Funções standalone | 107 | ~60 |
| Gateways | 2 | 2 |
| Proxy entries (api-gw) | 18+3 | ~10+3 |
| Proxy entries (ops-gw) | 7 | ~3 |
| Cold starts eliminados | — | ~47 |

### Exceções autorizadas finais (~52 funções):
- 22 serveAgent/HMAC
- 20 servePublic
- 5 Deno.serve raw
- 5 especiais (honeypot, SAML, SCIM, etc.)

### Prioridade de execução:
1. **Fase 1** (imediato, 0 risco) — deletar 8 zumbis
2. **Fase 2** (baixo risco) — migrar 3 frontend calls + deletar
3. **Fase 3A** (médio) — inline 8 serveTenant simples
4. **Fase 4** (médio) — inline 8 serveInternal
5. **Fases 5-8** — documentar exceções

---

## Validação em cada fase
1. `deno check` nos gateways
2. `npx tsc --noEmit` no frontend
3. Deploy gateway
4. Teste curl das ações migradas
5. Deletar standalone + `supabase--delete_edge_functions`
