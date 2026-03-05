# Runbook: Erros 500 em Edge Functions

**Severidade**: Alta  
**Meta MTTR**: < 15 minutos  
**Escalação**: Após 3 falhas consecutivas da mesma função

---

## Sintomas

- Edge Function retornando HTTP 500
- `Internal Server Error` no corpo da resposta
- Logs de erro mostrando exceções não tratadas
- Erros client-side em chamadas de API

---

## Diagnóstico Rápido

### 1. Verificar Logs de Edge Functions

```bash
# Via CLI do Supabase
npx supabase functions logs <nome-funcao> --tail
```

Procurar por:
- Stack traces
- Erros de acesso "undefined"
- Falhas de conexão com o banco
- Variáveis de ambiente ausentes

### 2. Verificar Modo do Sistema

```sql
SELECT * FROM get_system_mode_safe();
```

Se retornar `emergency_stop`:
- Ver [RUNBOOK-EMERGENCY-MODE.md](./RUNBOOK-EMERGENCY-MODE.md)

### 3. Verificar Variáveis de Ambiente

Obrigatórias para todas as funções:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`

---

## Causas Comuns e Correções

### A. Schema Drift

**Sintoma**: `relation "X" does not exist` ou `column "Y" does not exist`

**Causa Raiz**: Schema do banco mudou mas Edge Function espera schema antigo

**Correção**:
1. Verificar testes de contrato: `npm run test:contracts`
2. Revisar migrations recentes
3. Alinhar Edge Function com schema atual
4. Reimplantar função

### B. Função RPC Ausente

**Sintoma**: `function "X" does not exist`

**Correção**:
1. Verificar se RPC existe: `SELECT proname FROM pg_proc WHERE proname = 'nome_funcao';`
2. Se ausente, executar migration apropriada
3. Se existe, verificar qualificação do schema (public. vs outro)

### C. Problemas com Service Role Key

**Sintoma**: `JWT expired`, `Invalid API key`

**Correção**:
1. Regenerar service role key no dashboard
2. Atualizar no ambiente da Edge Function
3. Reimplantar função

### D. Rate Limiting

**Sintoma**: Função falha intermitentemente

**Correção**:
1. Verificar tabela `rate_limits` para entradas bloqueadas
2. Revisar padrões de chamadas
3. Implementar exponential backoff nos clientes

### E. Memória/Timeout

**Sintoma**: Timeout da função ou memória excedida

**Correção**:
1. Otimizar performance de queries
2. Adicionar paginação para conjuntos grandes de dados
3. Considerar dividir em funções menores

---

## Procedimento de Recuperação

### Imediato (< 5 min)

1. **Identificar função(ões) afetada(s)**
   ```sql
   SELECT * FROM security_logs 
   WHERE severity IN ('high', 'critical')
   AND created_at > NOW() - INTERVAL '1 hour'
   ORDER BY created_at DESC;
   ```

2. **Verificar se é isolado ou sistêmico**
   - Função única → Provavelmente problema de código
   - Múltiplas funções → Verificar banco/infraestrutura

3. **Rollback se deploy recente**
   ```bash
   # Reimplantar versão anterior
   git checkout HEAD~1 -- supabase/functions/<nome-funcao>
   npx supabase functions deploy <nome-funcao>
   ```

### Curto prazo (< 15 min)

1. **Revisar logs de erro em detalhe**
2. **Aplicar correção direcionada**
3. **Testar em staging**
4. **Implantar correção**

### Pós-Incidente

1. **Documentar causa raiz**
2. **Adicionar teste de contrato se relacionado a schema**
3. **Atualizar limiares de monitoramento se necessário**
4. **Agendar post-mortem se significativo**

---

## Monitoramento

### Alertas a Verificar

- `system_alerts` com `alert_type = 'edge_function_failure'`
- `security_logs` com `endpoint LIKE '/functions/v1/%'`

### Métricas Principais

- Taxa de erro por função
- Latência P95
- Taxa de sucesso ao longo do tempo

---

## Prevenção

1. **Sempre executar testes de contrato antes de implantar**
2. **Usar middleware de health probe em todas as funções críticas**
3. **Implementar tratamento de erros adequado com contexto**
4. **Adicionar logging em pontos de decisão importantes**

---

## Runbooks Relacionados

- [RUNBOOK-SCHEMA-DRIFT.md](./RUNBOOK-SCHEMA-DRIFT.md)
- [RUNBOOK-EMERGENCY-MODE.md](./RUNBOOK-EMERGENCY-MODE.md)
