# Migração de Polling para Realtime Subscriptions

| Campo | Valor |
|-------|-------|
| **Código** | RT-001 |
| **Versão** | 1.0 |
| **Status** | Planejado |
| **Data** | 2026-04-09 |
| **Prioridade** | Média |

---

## 1. Contexto

Vários hooks do frontend utilizam polling periódico (`setInterval` / `refetchInterval`) para manter dados atualizados. Isso gera custo desnecessário em requisições HTTP e carga no banco.

### 1.1 Candidatos à Migração

| Hook / Componente | Polling Atual | Impacto (req/dia/admin) | Prioridade |
|-------------------|--------------|------------------------|------------|
| `useHoneypotData.ts` | 30s | ~2.880 | Alta |
| `useAgentStatus` | 30s | ~2.880 | Média |
| `useDashboardMetrics` | 60s | ~1.440 | Baixa |

### 1.2 Benefícios Esperados

- **Custo**: Redução de ~80% das requisições HTTP ao backend
- **Latência**: Dados em tempo real (~100ms) vs polling (até 30s de atraso)
- **Escalabilidade**: Conexão WebSocket compartilhada vs N requests/minuto por admin

---

## 2. Pré-requisitos

1. Tabela deve ter `ALTER PUBLICATION supabase_realtime ADD TABLE public.<tabela>;`
2. RLS deve estar habilitado e correto (Realtime respeita RLS)
3. Testar que `tenant_id` filtering funciona via RLS no canal

---

## 3. Padrão de Migração

### 3.1 Antes (Polling)

```typescript
const { data } = useQuery({
  queryKey: ['honeypot-data', tenantId],
  queryFn: () => fetchHoneypotData(tenantId),
  refetchInterval: 30_000,
});
```

### 3.2 Depois (Realtime + Query)

```typescript
// Initial load via query
const { data, refetch } = useQuery({
  queryKey: ['honeypot-data', tenantId],
  queryFn: () => fetchHoneypotData(tenantId),
  staleTime: 5 * 60 * 1000, // 5 min
});

// Realtime subscription for updates
useEffect(() => {
  const channel = supabase
    .channel(`honeypot-${tenantId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'honeypot_interactions',
      filter: `tenant_id=eq.${tenantId}`,
    }, () => {
      queryClient.invalidateQueries({ queryKey: ['honeypot-data', tenantId] });
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, [tenantId]);
```

### 3.3 Fallback Seguro

Caso o WebSocket desconecte, manter polling de fallback com intervalo longo (5 minutos):

```typescript
refetchInterval: isRealtimeConnected ? false : 5 * 60 * 1000,
```

---

## 4. Plano de Execução

| Fase | Ação | Prazo |
|------|------|-------|
| 1 | Habilitar Realtime nas tabelas candidatas (SQL) | Semana 1 |
| 2 | Migrar `useHoneypotData` com fallback | Semana 2 |
| 3 | Monitorar métricas de conexão WebSocket por 1 semana | Semana 3 |
| 4 | Migrar hooks restantes se métricas saudáveis | Semana 4 |
| 5 | Remover polling legado | Semana 5 |

---

## 5. Monitoramento Pós-Migração

- **Métrica**: Contagem de requisições HTTP ao endpoint de honeypot (deve cair ~80%)
- **Alerta**: Se conexões Realtime ativas < número de admins online, investigar
- **Fallback**: Se Realtime instável por >5 min, polling automático reativado

---

## 6. Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| Realtime quota excedida | Monitorar via dashboard; limitar canais por tenant |
| Latência em regiões distantes | WebSocket já é mais eficiente que polling HTTP |
| Dados sensíveis em broadcast | RLS garante isolamento; nunca usar `broadcast` para dados tenant-scoped |

---

## 7. Decisão: Quando NÃO migrar

- Dados que mudam < 1x/hora → manter polling com `staleTime: 10min`
- Endpoints que agregam dados de múltiplas tabelas → polling é mais simples
- Funções que fazem cálculos server-side (RPCs) → não suportam Realtime
