
# Plano de Consolidação — Fases 2F, 2I, 2J

**Estado atual:** 113 standalone functions. **Meta:** < 60 standalone.
**Funções já inlined:** ~80 handlers nos gateways.

---

## Fase 2F — Admin/Auth (inline no api-gateway)

Funções simples de DB/Auth que podem ser inlined como handlers:

| Função | Handler | Complexidade |
|--------|---------|-------------|
| `accept-invite` | `admin:accept-invite` | Baixa - DB query |
| `delete-invite` | `admin:delete-invite` | Baixa - DB delete |
| `send-invite` | `admin:send-invite` | Média - email |
| `validate-invite` | `admin:validate-invite` | Baixa - DB query |
| `change-password` | `admin:change-password` | Baixa - Auth API |
| `record-failed-login` | `admin:record-failed-login` | Baixa - DB insert |
| `check-failed-logins` | `admin:check-failed-logins` | Baixa - DB query |
| `approve-via-token` | `admin:approve-via-token` | Média - token validation |
| `create-job` | `admin:create-job` | Média - DB + validation |
| `action-center-feed` | `admin:action-center-feed` | Baixa - DB query |
| `get-blocked-websites` | `security:get-blocked-websites` | Baixa - DB query |
| `get-software-inventory` | `agent:get-software-inventory` | Baixa - DB query |
| `get-web-activity` | `agent:get-web-activity` | Baixa - DB query |
| `export-evidence-bundle` | `security:export-evidence-bundle` | Média - aggregation |
| `calculate-compliance` | `security:calculate-compliance` | Média - computation |
| `upload-report` | `report:upload` | Baixa - storage |
| `verify-compliance-report` | `report:verify-compliance` | Baixa - DB query |
| `verify-document` | `security:verify-document` | Baixa - hash check |
| `drift-detect` | `security:drift-detect` | Média - comparison |
| `update-baseline` | `security:update-baseline` | Baixa - DB update |

**Subtotal: -20 standalone** → Arquivo: `api-gateway/handlers/admin-auth.ts` + `admin-ops.ts`

---

## Fase 2I — Ops/Agent (inline no ops-gateway ou manter como exceção)

### 2I-a: Funções de submit (Agent-HMAC auth → EXCEÇÃO PERMANENTE)
Estas usam autenticação HMAC do agente e **devem permanecer standalone**:

- `submit-antivirus-status`, `submit-rollback-event`, `submit-software-inventory`
- `submit-system-metrics`, `submit-vuln-findings`, `submit-web-activity`
- `submit-router`, `collect-router` (roteadores de submit)
- `serve-dns-filter`, `serve-installer`, `serve-agent-update`
- `heartbeat`, `poll-jobs`, `submit-job-result`, `submit-processes`
- `register-agent-key`, `enroll-agent`
- `honeypot-handler`, `post-installation-telemetry`, `track-installation-event`

**Total exceções agent-HMAC: ~20 (já exceções ou novas)**

### 2I-b: Funções agent que podem ser inlined no api-gateway
(Converter proxy → inline, frontend já usa `callGateway`):

| Proxy atual | Ação |
|-------------|------|
| `agent-version-management` | Inline - DB queries |
| `check-agent-integrity` | Inline - DB query |
| `check-agent-updates` | Inline - DB query |
| `diagnostics-agent-logs` | Inline - DB query |
| `get-agent-config` | Inline - DB query |
| `get-agent-dashboard-data` | Inline - DB query |
| `get-agent-policy` | Inline - DB query |
| `get-agent-script-content` | Inline - storage read |
| `get-latest-agent-script` | Inline - DB query |
| `promote-agent-v5` | Inline - DB update |
| `recover-agent-credentials` | Inline - DB + crypto |
| `token-rotate` | Inline - DB + crypto |

**Subtotal: -12 standalone** → Arquivo: `api-gateway/handlers/agent-ops.ts`

### 2I-c: Funções de reinstall (inline no api-gateway)

| Proxy atual | Ação |
|-------------|------|
| `force-reinstall-fleet` | Inline - job creation |
| `create-reinstall-jobs` | Inline - batch insert |
| `get-reinstall-by-name` | Inline - DB query |
| `get-reinstall-preserve-script` | Inline - script gen |
| `get-reinstall-script` | Inline - script gen |

**Subtotal: -5 standalone** → Arquivo: `api-gateway/handlers/reinstall.ts`

---

## Fase 2J — Proxy Targets Restantes

### 2J-a: Security proxies → inline no api-gateway

| Proxy atual | Decisão |
|-------------|---------|
| `scan-vulnerabilities` | **EXCEÇÃO** - scan pesado, timeout longo |
| `fetch-nvd-cves` | Inline - external API fetch |
| `sync-cve-database` | Mover para ops-gateway sync |
| `correlate-edr-events` | Inline - DB query + logic |
| `evaluate-edr-detections` | Inline - DB + rules |
| `mitre-sync` | Mover para ops-gateway sync |
| `siem-export` | Inline - data aggregation |
| `run-rls-tests` | Inline - RPC call |
| `security-advisor` | Inline - DB + AI prompt |

**Subtotal: -7 inline, 2 movidos para ops-gw**

### 2J-b: Build proxies → inline no api-gateway

| Proxy atual | Decisão |
|-------------|---------|
| `build-agent-exe` | **EXCEÇÃO** - GitHub Actions trigger, longa duração |
| `generate-deploy-package` | **EXCEÇÃO** - file generation complexa |
| `generate-portable-installer` | **EXCEÇÃO** - file generation |
| `generate-enrollment-key` | Inline - DB + crypto |
| `auto-generate-enrollment` | Inline - DB |
| `revoke-enrollment-key` | Inline - DB update |
| `register-agent-release` | Inline - DB insert |
| `sign-release` | **EXCEÇÃO** - crypto pesado |
| `upload-release-content` | **EXCEÇÃO** - storage upload |
| `validate-build-pipeline` | Inline - DB query |
| `confirm-force-update` | Inline - DB update |
| `get-diagnostic-script` | Inline - template gen |
| `serve-installer` | **EXCEÇÃO** - serves binary |

**Subtotal: -7 inline, 5 exceções**

### 2J-c: Ops-gateway playbook proxies → inline

| Proxy atual | Decisão |
|-------------|---------|
| `execute-playbook-action` | Inline - DB + dispatch |
| `evaluate-playbook-triggers` | Inline - rules engine |
| `evaluate-automation-rules` | **EXCEÇÃO** - complexo demais |
| `auto-remediate` | **EXCEÇÃO** - multi-step |
| `autonomous-safe-mode` | **EXCEÇÃO** - critical safety |
| `evaluate-software-risk` | Inline - scoring logic |
| `list-reports` | **EXCEÇÃO** - serveAgent auth |

**Subtotal: -3 inline, 4 exceções**

### 2J-d: AI functions → EXCEÇÃO PERMANENTE (todas)

- `ai-action-executor`, `ai-agent-assist`, `ai-analyze-agent`
- `ai-full-audit`, `ai-insight-dispatcher`, `ai-predict-agent-failure`
- `ai-quality-check`, `ai-red-team-assessment`, `ai-router`
- `ai-system-analyzer`, `ai-system-audit`, `analyze-url`

**Razão:** Submodules complexos, timeouts longos, imports pesados.
**Total: 12 exceções permanentes**

### 2J-e: Standalone com auth própria → EXCEÇÃO PERMANENTE

- `fido2-authenticate`, `fido2-register` (WebAuthn)
- `saml-sso`, `scim-provisioning` (Enterprise SSO)
- `stripe-webhook` (webhook Stripe)
- `health` (health check público)
- `submit-contact` (público)
- `rate-limit-check` (utility interna)
- `scan-virus` (scan pesado)
- `translate-cve` (NVD API)

---

## Resumo de Impacto

| Fase | Funções Inlined | Exceções Novas | Standalone Removidos |
|------|----------------|----------------|---------------------|
| 2F | 20 | 0 | -20 |
| 2I-b/c | 17 | 20 (agent-HMAC) | -17 |
| 2J | 17 | 21 | -17 |
| **Total** | **54** | **41** | **-54** |

**Projeção: 113 - 54 = 59 standalone** (meta < 60 ✅)

---

## Ordem de Execução

1. **2F** (Admin/Auth) — mais simples, maior impacto (-20)
2. **2I-b/c** (Agent inline) — converte proxies existentes (-17)
3. **2J-a/b** (Security + Build proxies → inline) (-14)
4. **2J-c** (Playbook proxies → inline) (-3)
5. Limpeza: remover diretórios standalone + `supabase--delete_edge_functions`
6. Atualizar `ci/validate-middleware.sh` com novas exceções
7. Build final + testes

**Tempo estimado: ~4-5 interações de implementação**
