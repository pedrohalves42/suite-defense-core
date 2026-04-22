

# Plano: Backlog de Hardening — 4 Frentes

## Visão geral

Quatro frentes independentes, executáveis em paralelo, sem mudanças de comportamento funcional. Total estimado: ~1 commit por frente, baixo risco.

---

## 🔴 Frente 1 — RLS `USING(true)` em escritas (tenant bypass)

### Início — diagnóstico
Identificar as 2 policies já reportadas pela auditoria. Vou rodar:
```sql
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='public'
  AND cmd IN ('INSERT','UPDATE','DELETE')
  AND (qual = 'true' OR with_check = 'true');
```

### Meio — migration
Para cada policy encontrada, substituir `USING(true)` / `WITH CHECK(true)` por:
```sql
USING (tenant_id = public.get_active_tenant_id())
WITH CHECK (tenant_id = public.get_active_tenant_id())
```
Quando a tabela exigir privilégio admin, somar `AND public.has_role(auth.uid(),'super_admin'::app_role)`.

### Fim — verificação
- `supabase--linter` sem novos warnings.
- `pg_policies` mostra `qual` parametrizado em `tenant_id`.
- Smoke test via `read_query`: insert cross-tenant deve ser rejeitado.

---

## 🟠 Frente 2 — Cobertura Zod nas 8 edge functions submit

### Início — listar
Inventário das 8 funções pendentes (já mapeadas: `submit-antivirus-status`, `submit-system-metrics`, +6). Vou rodar `ci/validate-zod-coverage.sh` para confirmar o conjunto exato.

### Meio — adicionar schemas
Para cada função, no topo do `index.ts`:
```ts
import { z } from 'zod';
const BodySchema = z.object({ /* campos atuais */ });
const parsed = BodySchema.safeParse(await req.json());
if (!parsed.success) return jsonError(400, parsed.error.flatten());
```
Reutilizar tipos compartilhados de `_shared/schemas/` quando existir. Manter campos opcionais como `.optional()` para não quebrar agentes em campo.

### Fim — verificação
- `ci/validate-zod-coverage.sh` retorna 0.
- `supabase--deploy_edge_functions` em todas as 8 com sucesso.
- Curl de smoke (payload válido → 200; payload inválido → 400 com erro estruturado).

---

## 🟠 Frente 3 — 5 erros de lint (bloqueia merge)

### Início — localizados pela auditoria
1. `src/pages/__tests__/page-mocks.ts` — `require()` proibido (×N)
2. `src/pages/admin/CronHealthDashboard/useCronHealthDashboard.ts` — `require()` proibido
3. `src/lib/__tests__/utils.test.ts` — constant binary expression

### Meio — correções pontuais
- Trocar `require('x')` por `import x from 'x'` (estático) ou `await import('x')` (dinâmico) conforme contexto.
- No `utils.test.ts`, ajustar a expressão constante para refletir a intenção real do teste (provavelmente uma comparação que virou tautologia).

### Fim — verificação
- `bun lint` (ou `npm run lint`) com 0 erros.
- Vitest dos arquivos tocados continua verde.

---

## 🟡 Frente 4 — `search_path` mutable + bucket público

### Início — identificar
- Função sinalizada pelo linter sem `SET search_path = public`.
- Bucket público no storage (consultar `storage.buckets WHERE public=true`).

### Meio — migration
```sql
ALTER FUNCTION public.<nome>(<args>)
  SET search_path = public;
```
Para o bucket: se for asset legítimamente público (ex: avatares de marca), documentar e ignorar via `manage_security_finding`. Caso contrário:
```sql
UPDATE storage.buckets SET public = false WHERE id = '<bucket>';
```
e adicionar policy de leitura autenticada.

### Fim — verificação
- `supabase--linter` sem o warning de search_path.
- `security--get_scan_results` confirma resolução do bucket (ou ignore documentado).

---

## Ordem de execução recomendada

1. **Frente 3** (lint) — desbloqueia CI imediatamente, baixo risco.
2. **Frente 1** (RLS) — risco de segurança mais alto, isolado em 1 migration.
3. **Frente 2** (Zod) — 8 deploys independentes, paralelos.
4. **Frente 4** (search_path/bucket) — finaliza warnings residuais.

Cada frente entrega um diff coeso e revisável. Aprovação pode ser por frente ou em bloco — me diga como prefere.

