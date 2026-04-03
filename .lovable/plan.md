
# Fase 2J: Consolidação dos Proxy Targets Restantes

## Diagnóstico Atual

### api-gateway — 44 proxy entries em ACTION_TO_FUNCTION
### ops-gateway — 7 proxy entries em ACTION_TO_FUNCTION

---

## Etapa 1: Remover entradas QUEBRADAS (funções deletadas)
Ações no api-gateway que apontam para funções que não existem mais:
- `security:verify-log-integrity` → NOT FOUND
- `security:fetch-nvd-cves` → deletado (agora no ops-gateway Phase 2I)
- `security:correlate-edr-events` → deletado (agora no ops-gateway Phase 2I)
- `security:evaluate-edr-detections` → deletado (agora no ops-gateway Phase 2I)
- `security:run-rls-tests` → deletado (agora no ops-gateway Phase 2I)
- `agent:check-agent-integrity` → deletado (agora no ops-gateway Phase 2I)
- `build:auto-renew-enrollment-keys` → NOT FOUND

**Ação:** Remover essas 7 entradas do ACTION_TO_FUNCTION.

---

## Etapa 2: Remover proxies para funções com auth incompatível
Funções que usam serveAgent/HMAC, servePublic, ou Deno.serve raw NÃO funcionam via proxy do gateway (que usa assertInternalCaller). Devem ser chamadas diretamente:

### serveAgent (HMAC) — remover do proxy, chamar diretamente:
- `agent:check-agent-updates`, `agent:diagnostics-agent-logs`, `agent:get-agent-config`, `agent:get-agent-policy`, `agent:serve-agent-update`, `build:confirm-force-update`

### servePublic — remover do proxy:
- `agent:validate-hmac-signature`, `agent:get-reinstall-by-name`, `agent:get-reinstall-preserve-script`, `agent:get-reinstall-script`, `build:get-diagnostic-script`, `build:serve-installer`

### Raw Deno.serve (HMAC custom) — remover do proxy:
- `agent:enroll-agent`, `agent:register-agent-key`

**Ação:** Remover essas 14 entradas. Total removido: 21 de 44.

---

## Etapa 3: Inline serveInternal functions no ops-gateway
Funções serveInternal que podem ser inlined (lógica DB-only ou simples):

### No ops-gateway (já tem auth interna compatível):
- `sync-cve-database` → `sync:sync-cve-database`
- `mitre-sync` → `sync:mitre-sync`
- `setup-agent-script` → `sync:setup-agent-script`
- `upload-release-content` → `sync:upload-release-content`

### No ops-gateway (playbook serveInternal):
- `evaluate-playbook-triggers` → `playbook:evaluate-playbook-triggers`
- `evaluate-automation-rules` → `playbook:evaluate-automation-rules`
- `autonomous-safe-mode` → `playbook:autonomous-safe-mode`

**Ação:** Criar handlers e mover lógica. Deletar standalone directories após deploy.

---

## Etapa 4: Manter como proxy (serveTenant complexas — custo/benefício)
Estas funções usam serveTenant e são multi-arquivo/complexas. O proxy funciona corretamente e o custo de inline não compensa:

### api-gateway (permanecem como proxy):
- `build:build-agent-exe` (multi-arquivo + GitHub dispatch)
- `build:generate-deploy-package`, `build:generate-portable-installer`
- `build:auto-generate-enrollment`, `build:register-agent-release`
- `build:sign-release`, `build:validate-build-pipeline`
- `agent:get-agent-script-content`, `agent:promote-agent-v5`
- `agent:force-reinstall-fleet`, `agent:create-reinstall-jobs`
- `security:scan-vulnerabilities` (multi-arquivo)
- `security:security-advisor` (AI + complexo)
- `security:siem-export`, `security:sync-cve-database`, `security:mitre-sync`

### ops-gateway (permanecem como proxy):
- `playbook:execute-playbook-action` (multi-arquivo, 851 linhas decompostas)
- `playbook:auto-remediate` (serveTenant)
- `playbook:evaluate-software-risk` (servePublic)
- `report:list` (serveAgent/HMAC)

---

## Resultado Esperado
- **api-gateway:** 44 → ~16 proxy entries (remove 21 quebradas/incompatíveis, inline 7)
- **ops-gateway:** 7 → 0 proxy entries (inline 7 serveInternal)
- **Funções standalone deletadas:** ~7 (serveInternal migradas)
- **Cold starts eliminados:** ~7 (inline no ops-gateway)
- **Custo reduzido:** Menos invocações de funções separadas

---

## Validação
1. TypeScript check sem erros
2. Deploy dos gateways
3. Teste via curl das ações inlined
4. Verificar que ações removidas não quebram frontend (buscar referências no src/)
