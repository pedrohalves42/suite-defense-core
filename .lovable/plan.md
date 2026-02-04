
# Plano: Atualizar Pc-Bianca-Tibery para v4.5.0

## Contexto
O agente `Pc-Bianca-Tibery` está na versão v4.1.9, significativamente desatualizado em relação ao fleet (v4.5.0). Está temporariamente **offline**, o que significa que o job será enfileirado e executado automaticamente quando o agente reconectar.

## Implementação

### 1. Criar job de atualização
Inserir um job `update_agent` na tabela `jobs` com:

```typescript
const jobData = await prepareJobForInsert({
  tenant_id: '2584d2cd-8b99-4ca7-a8e2-b61256e82b3e',
  agent_id: 'e6da82c9-92a8-4dc1-afc5-af3f6d66a425',
  agent_name: 'Pc-Bianca-Tibery',
  type: 'update_agent',
  status: 'queued',
  payload: {
    target_version: 'v4.5.0',
    platform: 'windows',
    current_version: 'v4.1.9',
    source: 'manual_update'
  },
  approved: true
});
```

### 2. Arquivo a modificar
**Opção A (Preferida):** Executar via componente existente de admin ou criar função dedicada.

**Opção B:** Criar migration SQL one-time:
```sql
INSERT INTO jobs (
  tenant_id, agent_id, agent_name, type, status, 
  payload, approved, payload_hash
) VALUES (
  '2584d2cd-8b99-4ca7-a8e2-b61256e82b3e',
  'e6da82c9-92a8-4dc1-afc5-af3f6d66a425',
  'Pc-Bianca-Tibery',
  'update_agent',
  'queued',
  '{"target_version":"v4.5.0","platform":"windows","current_version":"v4.1.9","source":"manual_update"}',
  true,
  encode(sha256('{"target_version":"v4.5.0","platform":"windows","current_version":"v4.1.9","source":"manual_update"}'::bytea), 'hex')
);
```

## Comportamento Esperado
1. Job fica em status `queued`
2. Quando agente reconectar e fizer polling via `poll-jobs`, receberá o job
3. Job muda para `delivered`
4. Agente executa atualização forçada via `Apply-ForcedUpdate`
5. Reinício imediato da scheduled task (Stop → Sleep 2s → Start)
6. Agente volta online com v4.5.0

## Observações sobre Insights
Os 50 alertas críticos não reconhecidos são legítimos e requerem atenção da equipe de operações:
- 2 padrões suspeitos de navegação (Pc-Vidro/Meio-Planalto)
- Múltiplos alertas de disco crítico (DESKTOP-UOABRHB com 97.9%)
- Alertas de CPU/Memória (DESKTOP-NOHACIE)

Recomendo criar uma rotina de reconhecimento (acknowledge) para insights resolvidos.
