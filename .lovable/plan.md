

# Plano de Correcao: Criar Particao HMAC Fevereiro 2026

## Problema Identificado

A tabela `hmac_signatures` e particionada por mes, mas **falta a particao de Fevereiro 2026**:

```text
Particoes Existentes:
+---------------------------+----------------------------------------+
| Particao                  | Range                                  |
+---------------------------+----------------------------------------+
| hmac_signatures_2025_12   | 2025-12-01 ate 2026-01-01              |
| hmac_signatures_2026_01   | 2026-01-01 ate 2026-02-01              |
| hmac_signatures_2026_02   | NAO EXISTE (FALTANDO!)                 |
+---------------------------+----------------------------------------+
```

## Evidencia do Problema

Logs de edge functions mostram erro critico:

```text
[HMAC] CRITICAL: Failed to store signature for agent PC-Servidor-Planalto: {
  error: 'no partition of relation "hmac_signatures" found for row',
  code: "23514",
  details: "Partition key of the failing row contains (used_at) = (2026-02-01 13:23:09.687407+00).",
  hint: null
}
```

**Impacto**: Replay protection NAO OPERACIONAL desde 2026-02-01 00:00:00 UTC.

---

## Correcao Proposta

### Migration SQL

Criar particao de Fevereiro 2026 e particoes futuras para prevenir recorrencia:

```sql
-- Criar particao Fevereiro 2026 (URGENTE)
CREATE TABLE IF NOT EXISTS public.hmac_signatures_2026_02 
  PARTITION OF public.hmac_signatures
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- Criar particoes futuras para prevenir recorrencia
CREATE TABLE IF NOT EXISTS public.hmac_signatures_2026_03 
  PARTITION OF public.hmac_signatures
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE IF NOT EXISTS public.hmac_signatures_2026_04 
  PARTITION OF public.hmac_signatures
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE IF NOT EXISTS public.hmac_signatures_2026_05 
  PARTITION OF public.hmac_signatures
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE IF NOT EXISTS public.hmac_signatures_2026_06 
  PARTITION OF public.hmac_signatures
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

-- Criar indices nas novas particoes
CREATE INDEX IF NOT EXISTS idx_hmac_signatures_2026_02_signature 
  ON public.hmac_signatures_2026_02(signature);
CREATE INDEX IF NOT EXISTS idx_hmac_signatures_2026_02_used_at 
  ON public.hmac_signatures_2026_02(used_at);

CREATE INDEX IF NOT EXISTS idx_hmac_signatures_2026_03_signature 
  ON public.hmac_signatures_2026_03(signature);
CREATE INDEX IF NOT EXISTS idx_hmac_signatures_2026_03_used_at 
  ON public.hmac_signatures_2026_03(used_at);

CREATE INDEX IF NOT EXISTS idx_hmac_signatures_2026_04_signature 
  ON public.hmac_signatures_2026_04(signature);
CREATE INDEX IF NOT EXISTS idx_hmac_signatures_2026_04_used_at 
  ON public.hmac_signatures_2026_04(used_at);

CREATE INDEX IF NOT EXISTS idx_hmac_signatures_2026_05_signature 
  ON public.hmac_signatures_2026_05(signature);
CREATE INDEX IF NOT EXISTS idx_hmac_signatures_2026_05_used_at 
  ON public.hmac_signatures_2026_05(used_at);

CREATE INDEX IF NOT EXISTS idx_hmac_signatures_2026_06_signature 
  ON public.hmac_signatures_2026_06(signature);
CREATE INDEX IF NOT EXISTS idx_hmac_signatures_2026_06_used_at 
  ON public.hmac_signatures_2026_06(used_at);
```

---

## Secao Tecnica

### O Que Foi Descoberto

1. A tabela `hmac_signatures` e particionada por mes usando `RANGE` em `used_at`
2. A migration `20251209180420` criou particoes ate `2026_03`, mas elas nao existem no banco atual
3. A migration `20260109171719` renomeou `hmac_signatures_partitioned` para `hmac_signatures`
4. As particoes originais nao foram migradas corretamente

### Validacao Pos-Correcao

```sql
-- Verificar particoes criadas
SELECT 
  inhrelid::regclass as partition_name,
  pg_get_expr(c.relpartbound, c.oid) as partition_range
FROM pg_inherits i
JOIN pg_class c ON c.oid = inhrelid
WHERE inhparent = 'hmac_signatures'::regclass
ORDER BY partition_name;
-- ESPERADO: 2025_12, 2026_01, 2026_02, 2026_03, 2026_04, 2026_05, 2026_06

-- Aguardar proximo heartbeat de agente e verificar
SELECT COUNT(*) FROM hmac_signatures WHERE used_at > NOW() - INTERVAL '10 minutes';
-- ESPERADO: > 0 (apos agentes fazerem polling)
```

---

## Resumo de Acoes

| Acao | Arquivo | Descricao |
|------|---------|-----------|
| Criar migration | SQL | Adicionar particoes 2026_02 ate 2026_06 |

## Resultado Esperado

Apos implementacao:

| Invariante | Estado Atual | Estado Esperado |
|------------|--------------|-----------------|
| INV-002 (HMAC/Replay) | REFUTADO | PROVADO (signatures armazenadas) |

