
## Corrigir light_vuln_scan falhando nos agentes ativos

### Diagnóstico (comprovado com dados)

**Causa raiz:** O script v5.0.4 armazenado na tabela `agent_releases` **não contém** o handler `light_vuln_scan` (POSITION retorna 0). Os 3 agentes ativos (SISTEMA, DESKTOP-UOABRHB, SERVIDOR) rodam v5.0.4 mas com um script que não reconhece esse tipo de job, gerando `[DLQ:BUG] Unknown job type: light_vuln_scan`.

**Por que isso aconteceu:**
- O codebase tem scripts v5.0.5 com o handler `light_vuln_scan` implementado
- A release ativa no DB é v5.0.4 (criada em 14/02, 99KB)
- O conteúdo do DB nunca foi atualizado para incluir o handler v5.0.5
- Constraint de deploy do Lovable Cloud: arquivos `.ps1` não são bundled, então o DB é a fonte autoritativa

### Cadeia de falha

```
Cron agenda light_vuln_scan → Job criado (queued) → Agente v5.0.4 puxa job → 
Agente não reconhece tipo → Reporta "Unknown job type" → Backend marca [DLQ:BUG]
→ Cron cria novo job na hora seguinte → Loop infinito de falhas
```

### Solução (3 passos)

#### Passo 1: Criar release v5.0.5 no banco de dados

Sincronizar o conteúdo do script Windows v5.0.5 do codebase (`supabase/functions/_shared/agent-scripts/cybershield-agent-windows-v5.ps1`) para a tabela `agent_releases`:

1. Ler o script v5.0.5 do codebase
2. Inserir nova release v5.0.5 na tabela `agent_releases` com `is_active = true`
3. Desativar release v5.0.4 (`is_active = false`)
4. Inserir versão v5.0.5 na tabela `agent_versions`

**Opção A (via Edge Function):** Usar/criar a função `sync-agent-release-content` para popular o DB automaticamente.

**Opção B (manual):** Inserir diretamente via SQL com o conteúdo do script.

> **Preferido: Opção A** — o script tem ~100KB, inserir via SQL é impraticável.

#### Passo 2: Forçar atualização dos agentes ativos

Após a release v5.0.5 estar ativa no DB:

1. O mecanismo de heartbeat `force_update` já compara a versão do agente com a versão ativa no DB
2. Se o agente reportar v5.0.4 e a release ativa for v5.0.5, o heartbeat retorna `force_update: true` com o novo script
3. Os 3 agentes ativos se auto-atualizam no próximo ciclo de heartbeat (~1 minuto)

**Verificação:** Confirmar que a função `process_heartbeat_v2` ou o endpoint de heartbeat compara versões e entrega o script atualizado.

#### Passo 3: Limpar jobs falhados e parar criação de novos até atualização

1. Cancelar quaisquer jobs `light_vuln_scan` pendentes/enfileirados para evitar mais falhas
2. Após confirmação de que os agentes atualizaram para v5.0.5, os novos jobs do cron passarão a funcionar

### Arquivos envolvidos

1. `supabase/functions/sync-agent-release-content/index.ts` — verificar se existe, se não, criar
2. `supabase/functions/_shared/agent-scripts/cybershield-agent-windows-v5.ps1` — fonte do script v5.0.5
3. `supabase/functions/process-heartbeat/index.ts` (ou equivalente) — verificar lógica de force_update

### Verificação de sucesso

- [ ] `agent_releases` tem v5.0.5 para Windows com `is_active = true` e `script_content` preenchido
- [ ] `agent_versions` tem v5.0.5 para Windows
- [ ] Os 3 agentes ativos reportam `agent_version = v5.0.5` após próximo heartbeat
- [ ] Novos jobs `light_vuln_scan` completam com sucesso (status = `completed`)
- [ ] Nenhum novo erro `[DLQ:BUG] Unknown job type: light_vuln_scan` nos logs

### Riscos

- **Nenhum downtime:** A atualização via heartbeat é transparente
- **Rollback:** Se v5.0.5 causar problemas, reativar v5.0.4 no DB
- **Agentes offline (v5.0.3):** Serão atualizados quando voltarem online na quinta-feira
