# Runbook: DDoS / Rate Limit Saturado

**Severidade**: Alta
**Meta MTTR**: < 15 minutos
**Escalacao**: Apos 5 minutos de saturacao continua

---

## Sintomas

- Rate limit retornando 429 em massa
- Latencia elevada em todas as Edge Functions
- `rate-limit-check` mostrando IPs/tenants acima do threshold
- Dashboard inacessivel ou lento
- Heartbeats falhando por timeout
- Logs mostrando volume anomalo de requisicoes

---

## Diagnostico Rapido

### 1. Identificar Origem

```sql
-- Top IPs por volume de requisicoes (via rate limit stats)
SELECT ip_address, count, window_start
FROM rate_limit_entries
WHERE window_start > NOW() - INTERVAL '15 minutes'
ORDER BY count DESC
LIMIT 20;
```

### 2. Verificar Tenants Abusivos

```sql
SELECT tenant_id, COUNT(*) as total_requests
FROM audit_logs
WHERE created_at > NOW() - INTERVAL '15 minutes'
GROUP BY tenant_id
ORDER BY total_requests DESC
LIMIT 10;
```

### 3. Verificar Edge Function Mais Impactada

Consultar logs de Edge Functions ordenados por volume e latencia.

---

## Procedimento de Resolucao

### Nivel 1 — Mitigacao Imediata

1. **Reduzir rate limits temporariamente** para IPs/tenants abusivos
2. **Ativar modo de emergencia** para preservar funcoes criticas:
   - Heartbeat: manter
   - Dashboard: throttle
   - AI functions: desativar temporariamente
   - Reports: desativar temporariamente

3. **Verificar se e ataque ou pico legitimo**:
   - Pico legitimo: aumentar limits gradualmente
   - Ataque: bloquear IPs de origem

### Nivel 2 — Bloqueio

1. **Bloquear IPs via admin_ip_whitelist** (blacklist):
   ```sql
   -- Identificar IPs maliciosos e adicionar regra de bloqueio
   -- Implementar via WAF/CDN se disponivel
   ```

2. **Suspender tenant abusivo** (se tenant identificado):
   ```sql
   UPDATE tenants SET status = 'suspended',
     suspension_reason = 'rate_limit_abuse'
   WHERE id = '<tenant_id>';
   ```

### Nivel 3 — Normalizacao

1. Monitorar por 30 minutos apos mitigacao
2. Restaurar rate limits normais gradualmente
3. Reativar funcoes desabilitadas
4. Documentar incidente

---

## Prevencao

| Controle | Status | Localizacao |
|----------|--------|-------------|
| Rate limiter in-memory | Ativo | serveTenant middleware |
| IP allowlist/blocklist | Ativo | admin_ip_whitelist |
| Tenant quotas | Ativo | check-tenant-quotas |
| Request size limits | Ativo | Edge Functions (Zod) |
| CDN/WAF | Recomendado | Infraestrutura |

---

## Historico

| Versao | Data | Autor | Alteracoes |
|--------|------|-------|------------|
| 1.0 | 2026-03-31 | CyberShield Ops | Versao inicial |
