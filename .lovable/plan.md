
# Fase 1A: Inline Security Namespace (28 proxied → handlers)

## Situação Atual
- **28 ações security** no `ACTION_TO_FUNCTION` fazem proxy HTTP para funções standalone
- Cada proxy = 1 cold start extra + ~50-200ms de latência desnecessária
- Total: ~4.500 linhas de lógica a migrar

## Estratégia: Dividir em 5 handler files por subdomínio

### Handler Files (dentro de `api-gateway/handlers/`)

| Arquivo | Ações | Linhas est. |
|---------|-------|-------------|
| `security-threats.ts` | auto-block-threats, auto-quarantine, quarantine-agent, auto-remediate, rollback-remediation, detect-blocked-attempts | ~800 |
| `security-scanning.ts` | scan-virus, scan-vulnerabilities, check-credential-leaks, check-agent-integrity, integrity-sentinel, classify-shadow-it | ~600 |
| `security-intel.ts` | publish-threat-ioc, threat-intelligence-lookup, fetch-nvd-cves, translate-cve, sync-cve-database, correlate-edr-events, evaluate-edr-detections, mitre-sync | ~900 |
| `security-monitoring.ts` | security-monitor, security-alert-dispatcher, build-security-graph, populate-security-graph, siem-export, run-rls-tests, security-advisor, generate-security-report | ~1100 |
| `security-auth.ts` | check-failed-logins, clear-failed-logins, record-failed-login, verify-log-integrity, apply-security-patch, update-baseline, analyze-network-anomalies, submit-vuln-findings | ~700 |

### Passos de Execução

**1. Criar os 5 handler files** — extrair a lógica core de cada standalone, removendo boilerplate (serve middleware, CORS, auth) que já é feito pelo api-gateway

**2. Registrar no INLINED_HANDLERS** — mover as 28 entradas de `ACTION_TO_FUNCTION` para `INLINED_HANDLERS`

**3. Atualizar imports no index.ts** — adicionar imports dos novos handlers

**4. Deletar 28 funções standalone** — remover diretórios e chamar `delete_edge_functions`

**5. Deploy e validação** — deploy do api-gateway atualizado, testar ações via curl

### Funções NÃO incluídas (auth própria / fluxo especial)
- `serve-dns-filter` (serveAgent com HMAC — chamada direta pelo agente)
- `block-website` / `get-blocked-websites` (serveInternal/serveAgent)
- `activate-agent-honeypot` / `revert-agent-honeypot` / `create-honeypot-pool` / `honeypot-handler` (ops-gateway)
- `ai-behavioral-anomaly-detector` (ops-gateway)

Essas 8 ficam para Fase 1B (ops-gateway) ou permanecem standalone por terem auth diferente.

### Ganhos Esperados
- **-28 cold starts** por chamada
- **~100-200ms** economia de latência por request
- **-28 funções** no total (163 → 135)
- **Custo**: menos invocações de edge function = menos billing
