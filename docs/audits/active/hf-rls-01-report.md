# HF-RLS-01 — Correção do drift de RLS em `agent_system_metrics_2026_08`

**Escopo**: corrigir exclusivamente a partição `agent_system_metrics_2026_08`
sem tocar em outras tabelas ou padronizações.
**Status**: ✅ Concluído.
**Referência**: pattern replicado da migração original P0-S1 `20260622130254_bc846e09`
(que corrigiu a partição irmã `2026_07`).

---

## Fase 1 — Inventário (read-only)

Todas as 4 partições ativas de `agent_system_metrics_partitioned`:

| Partição | Bound                   | Owner    | RLS  | Policies                                                              | Grants (`sandbox_exec`) | Índices                                     |
| -------- | ----------------------- | -------- | ---- | --------------------------------------------------------------------- | ----------------------- | ------------------------------------------- |
| 2026_05  | 2026-05-01 → 2026-06-01 | postgres | ✅ ON | `service_role_all` (ALL, true) + `tenant_isolation_select` (SELECT)   | INSERT, SELECT          | pkey + agent_id×2 + tenant_id (4 índices)   |
| 2026_06  | 2026-06-01 → 2026-07-01 | postgres | ✅ ON | `agent_system_metrics_2026_06_tenant_scoped` (ALL, tenant OR super)   | INSERT, SELECT          | idem                                        |
| 2026_07  | 2026-07-01 → 2026-08-01 | postgres | ✅ ON | `agent_system_metrics_2026_07_tenant_scoped` (ALL, tenant OR super)   | INSERT, SELECT          | idem                                        |
| **2026_08**  | 2026-08-01 → 2026-09-01 | postgres | ❌ **OFF** | **(nenhuma)** ← **DIVERGÊNCIA**                                    | INSERT, SELECT          | idem                                        |

### Comparação estrutural

| Aspecto             | Divergente? | Nota                                                                  |
| ------------------- | :---------: | --------------------------------------------------------------------- |
| Owner               |     Não     | Todos = `postgres`.                                                   |
| Herança/particionamento | Não | Todos anexados corretamente ao pai.                                    |
| Bound               |     Não     | Faixa mensal contígua.                                                |
| Grants              |     Não     | Todos = `sandbox_exec: INSERT,SELECT` (roles API não têm grants aqui). |
| Índices             |     Não     | Mesmo conjunto (pkey + 3 secundários).                                |
| **RLS habilitado**  |  **Sim**    | 2026_08 = OFF; irmãs = ON.                                            |
| **Policies**        |  **Sim**    | 2026_08 = zero; irmãs = 1 ou 2.                                       |

**Nota complementar**: 2026_05 usa um par de policies mais antigo
(`service_role_all` + `tenant_isolation_select`) herdado da migração baseline.
2026_06 e 2026_07 seguem o padrão P0-S1 unificado (`_tenant_scoped` ALL). O
padrão canônico atual — e a irmã mais próxima temporalmente — é
`2026_07`. Foi esse o padrão replicado.

---

## Fase 2 — Correção mínima aplicada

Migração publicada (aprovada e executada):

```sql
ALTER TABLE public.agent_system_metrics_2026_08 ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_system_metrics_2026_08_tenant_scoped
ON public.agent_system_metrics_2026_08
AS PERMISSIVE FOR ALL TO authenticated
USING      (tenant_id = get_active_tenant_id() OR is_current_super_admin())
WITH CHECK (tenant_id = get_active_tenant_id() OR is_current_super_admin());
```

Sem outras alterações. Sem renomear policies. Sem tocar em irmãs.

---

## Fase 3 — Validação estrutural (pós-mudança)

```
 relname                       | rls | owner    | policies
-------------------------------+-----+----------+---------------------------------------------------
 agent_system_metrics_2026_05  | t   | postgres | service_role_all/ALL, tenant_isolation_select/SELECT
 agent_system_metrics_2026_06  | t   | postgres | agent_system_metrics_2026_06_tenant_scoped/ALL
 agent_system_metrics_2026_07  | t   | postgres | agent_system_metrics_2026_07_tenant_scoped/ALL
 agent_system_metrics_2026_08  | t   | postgres | agent_system_metrics_2026_08_tenant_scoped/ALL   ✅
```

Checklist:

- [x] RLS habilitado em 2026_08.
- [x] Nome/forma da policy semanticamente idêntica a 2026_06/2026_07.
- [x] Mesmo owner (`postgres`).
- [x] Comportamento esperado: `authenticated` restrito ao próprio tenant OR
      super_admin; `service_role` bypass RLS por padrão do papel (mesmo
      comportamento das irmãs).
- [x] Linter Supabase: contagem caiu de **68 → 67 findings** — o
      "RLS Disabled in Public" foi eliminado. Warnings remanescentes são
      pré-existentes e fora deste escopo.

### Sweep global de partições

Verificação sistêmica após a correção:

```sql
SELECT parent, relname
FROM pg_inherits i
JOIN pg_class c ON c.oid = i.inhrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity = false;
-- (0 rows)
```

✅ **Nenhuma outra partição em `public` está com RLS desabilitada.** O
drift era isolado a `2026_08`.

---

## Fase 4 — Causa raiz

**Pergunta**: por que apenas `2026_08` ficou sem RLS?

### Evidências

1. Existe um gerador automático de partições em `public.create_monthly_partitions(p_table_name, p_partition_column, p_months_ahead)`. Corpo relevante:

   ```sql
   EXECUTE format(
     'CREATE TABLE public.%I PARTITION OF public.%I FOR VALUES FROM (%L) TO (%L)',
     v_partition_name, p_table_name, v_start, v_end
   );
   ```

   Ele cria a partição, mas **não** executa `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
   e **não** cria policy alguma.

2. Existe uma função `public.ensure_partition_rls()` que sabe iterar
   partições filhas e propagar RLS/policies, mas ela **não é chamada
   pelo gerador**, nem consta em `pg_cron` (nenhum job com esse nome).

3. Histórico das partições sadias mostra que cada uma exigiu uma
   migração manual dedicada:
   - `20260501202931_d0bfaa8b` — cria RLS + policy para `2026_06`.
   - `20260622130254_bc846e09` — "P0-S1: Enable RLS + tenant policy on
     missing partition agent_system_metrics_2026_07".
   - `2026_08` — **não foi acompanhada por uma migração equivalente**.

### Diagnóstico

Causa **sistêmica confirmada**: o processo padrão de criação de
partições produz filhas *inseguras por padrão* — RLS off e sem
policies. A correção histórica dependia de intervenção manual por
partição. Foi uma questão de tempo até uma partição escapar.

`2026_08` escapou provavelmente porque foi criada pela função automática
(a primeira coisa que roda quando `date_trunc('month', now())` avança) e
nenhuma migração acompanhou o próximo turno.

### Follow-up (fora do escopo do HF-RLS-01, apenas registro)

Aberto como candidato à próxima janela de governança, sem ação nesta:

- **FUP-PARTITION-RLS-01 (P1)**: alterar `create_monthly_partitions` para
  invocar `ensure_partition_rls()` ao final, tornando o padrão
  **secure-by-default**. Alternativamente, chamar `ensure_partition_rls()`
  num cron dedicado logo após a criação mensal. Deve vir acompanhado
  de teste SQL invariante em `tools/tests/` e execução no CI.
- **Observação adicional** (informacional): só existem 4 partições
  (05–08). O `create_monthly_partitions(..., p_months_ahead=3)` deveria
  ter gerado também `2026_09` / `2026_10`. Sugere que o cron de
  manutenção não está executando com regularidade — fora do escopo,
  registrar apenas.

---

## Critério de aceite

| Item                                                             | Status |
| ---------------------------------------------------------------- | :----: |
| Partição protegida (RLS on + policy alinhada)                    |  ✅    |
| Divergência eliminada em 2026_08                                 |  ✅    |
| Comparação estrutural antes/depois documentada                   |  ✅    |
| Causa raiz identificada (gerador não aplica RLS)                 |  ✅    |
| Nenhuma outra partição afetada (sweep global 0 rows)             |  ✅    |
| Nenhum outro hardening incluído no bloco                         |  ✅    |
| Follow-up sistêmico registrado como recomendação                 |  ✅    |

---

## Estado do programa após HF-RLS-01

- **Incidente Primário HF-RLS-06B**: **MITIGADO**.
- **Programa de Hardening RLS**: reduzido a
  - `HF-RLS-06B-EXTRA-D` (hipótese sobre `check_blast_radius`, P1),
  - `FUP-PARTITION-RLS-01` (governança do gerador, P1).
  - Sem P0 confirmados remanescentes.

Transição concluída de **resposta a incidente** → **evolução contínua de segurança**.
