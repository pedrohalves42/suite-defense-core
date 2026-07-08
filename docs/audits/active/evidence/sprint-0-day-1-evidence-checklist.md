# Sprint 0 · Day 1 — Evidence Checklist (read-only)

Date: 2026-07-08
Owner: Reliability Program
Mode: **read-only** — nenhum runtime, nenhuma policy, nenhum wrapper,
nenhum `_shared/*` pode ser tocado por este checklist.

Objetivo: fornecer o roteiro auditável do que foi (e deve ser)
executado no Dia 1 para classificar **P0-01, P0-10, P0-07, P0-08**
em Discovery. Cada item lista:

- **Ações permitidas** (somente leitura/inspeção).
- **Artefatos obrigatórios** para a classificação valer.
- **Critério de classificação** (Confirmed / False Positive / Needs Investigation / Reclassify).
- **Guarda de freeze** (o que não pode ser feito, mesmo se aparecer tentação).

---

## Guardas globais (aplicam-se a todos os itens)

- ❌ Não editar `_shared/reliability/*`, wrappers, retry, breaker, idempotency.
- ❌ Não criar/alterar migrations, policies, GRANTs, roles.
- ❌ Não redeployar edge functions.
- ❌ Não executar restore real, rollback real, ou geração de installer real fora de sandbox.
- ✅ Ler código, rodar linter, rodar `rg`, ler logs históricos, ler docs.
- ✅ Produzir `discovery.md` no diretório do item.
- ✅ Atualizar coluna `Discovery` no `hardening-tracking-board.md`.

Toda ação de escrita no repo deve ser **exclusivamente documental**.

---

## P0-01 — RLS cross-tenant

**Owner:** Security Lead

### Ações permitidas

- [ ] Rodar `supabase--linter` e salvar a saída integral.
- [ ] Contar por categoria: `rls_disabled_in_public` (ERROR),
      `0024_permissive_rls_policy`, `0028_anon_security_definer_function_executable`,
      `0029_authenticated_security_definer_function_executable`.
- [ ] Ler `mem://security/rls-and-multi-tenant-isolation-hardened` para
      contrapor o padrão esperado ao observado.
- [ ] Ler `mem://index.md` Core (regra `get_active_tenant_id()`).
- [ ] NÃO executar query cross-tenant contra produção ainda —
      requer 2 tenants sintéticos, fora do escopo do Dia 1.

### Artefatos obrigatórios

- [ ] `evidence/P0-01-rls/discovery.md` com: contagem por categoria,
      lista das funções `SECURITY DEFINER` reportadas, identificação
      da tabela/verbo do `always-true`, e classificação final.
- [ ] Link para o run do linter (data + total de issues).

### Critério de classificação

| Sinal                                                            | Classificação        |
| ---------------------------------------------------------------- | -------------------- |
| ≥1 ERROR `rls_disabled_in_public` em tabela sensível              | **Confirmed**        |
| 0 ERROR + `always-true` em SELECT público intencional + 0028/0029 justificadas por `has_role`/`get_active_tenant_id` | **False Positive** (com evidência) |
| 0 ERROR + `always-true` em INSERT/UPDATE/DELETE **ou** SECURITY DEFINER exposto sem tenant guard | **Needs Investigation** |
| Item deveria ser P1 (risco baixo comprovado)                     | **Reclassify**       |

### Resultado observado no Dia 1

- 71 WARN / 0 ERROR → **Needs Investigation** (padrão registrado).

---

## P0-10 — Segredos em logs

**Owner:** Security Lead

### Ações permitidas

- [ ] `rg -n -E "console\.(log|info|debug|warn|error)\(.*(service_role|SERVICE_ROLE|Bearer |sk_[a-z]|process\.env|Deno\.env)" supabase/functions`
- [ ] `rg -l "createLogger|structured-logger|_shared/logger" supabase/functions | wc -l`
- [ ] Contar diretórios de edge functions: `ls supabase/functions | grep -v "^_" | grep -v "^__" | wc -l`
- [ ] Ler Core Rule "No `console.log` em edge functions".
- [ ] NÃO baixar segredos, NÃO imprimir `Deno.env.get(...)`.

### Artefatos obrigatórios

- [ ] `evidence/P0-10-secrets/discovery.md` com: comando exato + saída,
      contagem de logger estruturado, taxa de adoção estimada.
- [ ] Nota explícita: "evidência DEPOIS pendente = grep em 24h de logs
      de runtime" — sem isso o item **não** vira `Closed`.

### Critério de classificação

| Sinal                                                    | Classificação                    |
| -------------------------------------------------------- | -------------------------------- |
| Grep no código = 0 hits + logger estruturado amplo       | **False Positive (pendente 24h)** |
| Grep no código > 0 hits                                  | **Confirmed**                    |
| Grep = 0 mas cobertura de logger < 60% dos diretórios    | **Needs Investigation**          |

### Resultado observado no Dia 1

- 0 hits em código + 214 refs de logger em 75 dirs → **False Positive (pendente 24h)**.

---

## P0-07 — Signing / integridade do installer

**Owner:** Security Lead

### Ações permitidas

- [ ] `rg -l -iE "hmac|signature|manifest_sha256|sha256|verifyHmac|timingSafeEqual"`
      em `supabase/functions/{generate-portable-installer,build-agent-exe,serve-installer,register-agent-release,promote-agent-v5}`.
- [ ] Ler `mem://security/agent-installer-integrity-validation` para
      registrar o padrão esperado.
- [ ] Listar toda função em `supabase/functions/` cujo nome envolva
      `install|agent|update` para não perder candidata.
- [ ] NÃO baixar installer real, NÃO tentar tamper — isso é passo
      da fase de execução (fora do Dia 1).

### Artefatos obrigatórios

- [ ] `evidence/P0-07-installer/discovery.md` com: lista das funções
      inspecionadas, saída do `rg`, referência ao padrão esperado,
      classificação final.

### Critério de classificação

| Sinal                                                          | Classificação        |
| -------------------------------------------------------------- | -------------------- |
| Primitiva de assinatura presente + verificação documentada     | **False Positive**   |
| 0 primitivas em qualquer função candidata + agente sem verify  | **Confirmed**        |
| 0 primitivas nas emissoras, mas possível verificação em `_shared/` ou no agente | **Needs Investigation** |

### Resultado observado no Dia 1

- 0 primitivas em 5 funções candidatas → **Needs Investigation**
  (spike de 0.5 dia para varrer `_shared/` e o agente antes de
  escalar para `Confirmed`).

---

## P0-08 — Backup + restore verificado

**Owner:** Ops Lead

### Ações permitidas

- [ ] `rg -l -iE "backup|restore|pg_dump|snapshot" docs scripts`
- [ ] Verificar existência de `docs/runbooks/` e `docs/runbooks/restore.md`.
- [ ] Confirmar que a plataforma provê snapshot automático (leitura
      documental — não invocar API).
- [ ] NÃO executar restore. NÃO baixar dump. NÃO manipular snapshot.

### Artefatos obrigatórios

- [ ] `evidence/P0-08-restore/discovery.md` com: saída do `rg`,
      inventário de runbooks (ausência), classificação final.

### Critério de classificação

| Sinal                                                     | Classificação        |
| --------------------------------------------------------- | -------------------- |
| Runbook existe + último restore verificado ≤ 30 dias      | **False Positive**   |
| Runbook existe + nenhum restore verificado nos últimos 90 dias | **Confirmed** (operacional) |
| Runbook inexistente **e** nenhum registro de restore       | **Confirmed** (operacional + documental) |
| Impossível verificar sem acesso admin de plataforma        | **Needs Investigation** |

### Resultado observado no Dia 1

- 0 hits em `docs`/`scripts`, `docs/runbooks/` inexistente → **Confirmed**
  (tipo: Operational Readiness — correção não toca runtime).

---

## Checklist de encerramento do Dia 1

- [x] 4 `discovery.md` gerados sob `evidence/P0-0{1,7,8,10}-*/`.
- [x] Coluna `Discovery` do `hardening-tracking-board.md` atualizada.
- [x] `evidence/sprint-0-day-1-checkpoint.md` publicado.
- [x] Gate intermediário do Grupo A avaliado — nenhum `Confirmed` crítico
      em P0-01/P0-10/P0-07 ⇒ Sprint 0 autorizado a seguir para Dia 2.
- [x] Zero linhas de runtime alteradas.
- [x] Zero migrations criadas.
- [x] Zero policies/GRANTs alterados.
- [x] `_shared/reliability/*` intocado.

---

## Ligação

- `hardening-sprint-0-discovery.md` — plano geral do Sprint 0.
- `hardening-tracking-board.md` — coluna Discovery espelha este checklist.
- `pre-production-freeze-register.md` — regras invariantes.
- `evidence/sprint-0-day-1-checkpoint.md` — consolidação executiva.
