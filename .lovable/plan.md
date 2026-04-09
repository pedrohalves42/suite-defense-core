## Plano: Cleanup automático de `hmac_signatures`

### Contexto
- Tabela particionada por mês (6 partições: 2026_02 a 2026_07)
- 7.222 linhas atuais, crescimento estimado ~2.500/dia
- Sem cleanup existente → crescimento ilimitado
- Índice `idx_hmac_signatures_used_at` já presente

### Migração SQL (única)

**1. Criar função de purge (SECURITY DEFINER com search_path fixo):**
- Deleta registros com `used_at < now() - interval '7 days'`
- Usa batch delete (1.000 linhas por vez) para evitar locks longos
- Retorna contagem de linhas deletadas
- Log via `RAISE NOTICE` para auditoria

**2. Criar pg_cron job:**
- Nome: `purge-hmac-signatures`
- Schedule: `0 3 * * *` (diário às 03:00 UTC, horário de menor tráfego)
- Executa a função de purge

**3. Purge inicial dos dados antigos** (>7 dias) na mesma migração

### Validações
- ✅ Partition pruning: DELETE com filtro `used_at` ativa pruning automático
- ✅ Sem impacto em escritas: batch de 1.000 evita contention
- ✅ Custo: zero (pg_cron é nativo, sem Edge Function)
- ✅ Retenção de 7 dias garante janela anti-replay HMAC (~5 min) com margem
- ✅ `SECURITY DEFINER` com `SET search_path = public` (SOC 2 CC6.1)
