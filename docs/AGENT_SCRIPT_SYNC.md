# Sistema de Sincronização do Script do Agente

## 📋 Visão Geral

Este sistema garante que o script do agente Windows (`agent-script-windows.ps1`) esteja sempre sincronizado entre o diretório público (`public/agent-scripts/`) e o diretório compartilhado das Edge Functions (`supabase/functions/_shared/`).

## 🔄 Componentes do Sistema

### 1. **Edge Function de Sincronização** (`sync-agent-script`)

Função dedicada que:
- Lê o script do diretório público via HTTP
- Valida a integridade do conteúdo
- Calcula SHA256 para detectar mudanças
- Atualiza o arquivo `_shared` apenas se necessário

**Endpoint:** `https://[project-id].supabase.co/functions/v1/sync-agent-script`

### 2. **Validador de Integridade** (`_shared/agent-script-validator.ts`)

Módulo compartilhado que executa no startup das Edge Functions:
- **Validação de tamanho**: Mínimo de 1000 bytes
- **Validação de assinaturas**: Verifica presença de funções essenciais (`Write-Log`, `Send-Heartbeat`, `Poll-Jobs`)
- **Validação de placeholders**: Garante que não há templates não preenchidos
- **Cálculo de SHA256**: Para logging e auditoria

### 3. **Startup Validation**

Ambas as Edge Functions (`serve-installer` e `build-agent-exe`) validam o script no startup:

```typescript
const scriptValidation = await validateAgentScript();
if (!scriptValidation.valid) {
  throw new Error(`startup failed: ${scriptValidation.error}`);
}
```

**Benefício:** Falha rápida (fail-fast) se o script estiver corrompido, evitando gerar instaladores inválidos.

## 🚀 Como Usar

### Sincronização Manual

1. **Via cURL:**
```bash
curl -X POST \
  https://[project-id].supabase.co/functions/v1/sync-agent-script \
  -H "Authorization: Bearer [INTERNAL_FUNCTION_SECRET]" \
  -H "Content-Type: application/json"
```

2. **Via Frontend (Admin UI):**
```typescript
const { data, error } = await supabase.functions.invoke('sync-agent-script', {
  headers: {
    Authorization: `Bearer ${INTERNAL_FUNCTION_SECRET}`,
  },
});
```

### Sincronização Automática (Cron)

Para sincronizar automaticamente a cada hora:

```sql
SELECT cron.schedule(
  'sync-agent-script-hourly',
  '0 * * * *', -- A cada hora
  $$
  SELECT net.http_post(
    url := 'https://[project-id].supabase.co/functions/v1/sync-agent-script',
    headers := '{"Authorization": "Bearer [INTERNAL_FUNCTION_SECRET]", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

**Nota:** Substitua `[project-id]` e `[INTERNAL_FUNCTION_SECRET]` pelos valores reais.

### Sincronização via Webhook (CI/CD)

Para sincronizar automaticamente após deploy ou alteração do script:

1. **GitHub Actions Workflow:**
```yaml
name: Sync Agent Script
on:
  push:
    paths:
      - 'public/agent-scripts/cybershield-agent-windows.ps1'

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Sync
        run: |
          curl -X POST \
            https://[project-id].supabase.co/functions/v1/sync-agent-script \
            -H "Authorization: Bearer ${{ secrets.INTERNAL_FUNCTION_SECRET }}" \
            -H "Content-Type: application/json"
```

2. **Pre-commit Hook:**
```bash
#!/bin/bash
# .git/hooks/pre-commit

if git diff --cached --name-only | grep -q "public/agent-scripts/cybershield-agent-windows.ps1"; then
  echo "Agent script modified, triggering sync after push..."
  # Você pode adicionar um post-commit hook para fazer o sync
fi
```

## 🔍 Monitoramento

### Verificar Status da Validação

Os logs das Edge Functions mostram o status da validação no startup:

```
[STARTUP] Agent script validated: {
  size: 52340,
  hash: "abc123...",
  preview: "# CyberShield Agent - Windows PowerShell Script..."
}
```

### Verificar Logs de Sincronização

```bash
# Via Supabase CLI
supabase functions logs sync-agent-script

# Exemplo de log de sucesso:
[abc-123] Successfully synchronized agent script
[abc-123] Old hash: def456...
[abc-123] New hash: abc789...
```

### Métricas de Sincronização

Query SQL para verificar histórico de sincronizações (se você criar uma tabela de logs):

```sql
SELECT 
  function_name,
  duration_ms,
  status_code,
  created_at
FROM performance_metrics
WHERE function_name = 'sync-agent-script'
ORDER BY created_at DESC
LIMIT 10;
```

## ⚠️ Troubleshooting

### Erro: "Source script is too small"

**Causa:** O arquivo `public/agent-scripts/cybershield-agent-windows.ps1` está vazio ou corrompido.

**Solução:**
1. Verifique o conteúdo do arquivo no repositório
2. Confirme que o arquivo tem > 1KB
3. Re-faça o deploy se necessário

### Erro: "Agent script validation failed: missing required signature"

**Causa:** O script não contém funções essenciais (`Write-Log`, `Send-Heartbeat`, `Poll-Jobs`).

**Solução:**
1. Restaure o script a partir do backup
2. Verifique se o arquivo correto foi commitado
3. Execute sync manual após correção

### Erro: "Failed to fetch source script: 404"

**Causa:** O arquivo não está acessível via HTTP no diretório `public/`.

**Solução:**
1. Confirme que o arquivo existe em `public/agent-scripts/`
2. Verifique as permissões de acesso público do bucket
3. Teste o acesso direto via browser: `https://[project-id].supabase.co/agent-scripts/cybershield-agent-windows.ps1`

### Edge Function Falha no Startup

**Sintoma:** Edge Function não inicia e exibe erro de validação.

**Solução:**
1. Execute sync manual imediatamente
2. Verifique logs da função `sync-agent-script`
3. Se persistir, restaure manualmente:
   ```bash
   cp public/agent-scripts/cybershield-agent-windows.ps1 \
      supabase/functions/_shared/agent-script-windows.ps1
   git commit -am "fix: restore agent script"
   git push
   ```

## 📊 Fluxo de Sincronização

```
┌──────────────────────────────────────────────────────────────┐
│  1. Developer modifica agent script em public/agent-scripts/ │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│  2. Commit e push para repositório                            │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│  3a. Manual: Chamar sync-agent-script via cURL/Admin UI      │
│  3b. Auto:   Cron job ou webhook trigger                     │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│  4. sync-agent-script busca script via HTTP                  │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│  5. Valida integridade (tamanho, assinaturas, SHA256)        │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│  6. Compara SHA256 com versão atual em _shared               │
└────────────────────┬─────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
   Sem mudanças              Mudanças detectadas
        │                         │
        ▼                         ▼
   Retorna "já sincronizado"  Atualiza _shared/agent-script-windows.ps1
        │                         │
        └────────────┬────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│  7. Próxima requisição às Edge Functions valida no startup   │
└──────────────────────────────────────────────────────────────┘
```

## 🔐 Segurança

- **Autenticação:** Edge Function requer `INTERNAL_FUNCTION_SECRET` para prevenir chamadas não autorizadas
- **Validação:** Múltiplas camadas de validação impedem scripts corrompidos
- **Fail-Fast:** Edge Functions não iniciam se o script for inválido
- **Auditoria:** Todos os syncs são logados com SHA256 para rastreabilidade

## 📝 Manutenção

### Backup Regular

```bash
# Criar backup antes de modificar
cp supabase/functions/_shared/agent-script-windows.ps1 \
   backups/agent-script-$(date +%Y%m%d_%H%M%S).ps1
```

### Teste de Integridade

```typescript
// Testar validação localmente
import { validateAgentScript } from './supabase/functions/_shared/agent-script-validator.ts';

const result = await validateAgentScript();
console.log(result);
```

### Atualização de Versão

Quando atualizar a versão do script:

1. Modificar `public/agent-scripts/cybershield-agent-windows.ps1`
2. Atualizar comentário de versão no cabeçalho
3. Executar sync manual
4. Verificar logs de validação das Edge Functions
5. Testar geração de instalador

## 📚 Referências

- **Edge Function:** `supabase/functions/sync-agent-script/index.ts`
- **Validador:** `supabase/functions/_shared/agent-script-validator.ts`
- **Script Original:** `public/agent-scripts/cybershield-agent-windows.ps1`
- **Script Sincronizado:** `supabase/functions/_shared/agent-script-windows.ps1`
