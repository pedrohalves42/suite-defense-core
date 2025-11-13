# Arquitetura do Sistema de Instalação do Agente

## 🎯 Visão Geral
O sistema de instalação do CyberShield Agent é composto por múltiplos componentes que trabalham em conjunto para gerar, distribuir e instalar agentes de forma segura em servidores Windows e Linux.

## 🔄 Fluxo Completo End-to-End

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. FRONTEND (AgentInstaller.tsx)                                │
│    - Validação de nome do agente (debounce + API)               │
│    - Seleção de plataforma (Windows/Linux)                      │
│    - Circuit Breaker para proteção contra falhas                │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. EDGE FUNCTION: auto-generate-enrollment                      │
│    - Gera enrollment_key único                                  │
│    - Cria agent_token (autenticação)                            │
│    - Gera hmac_secret (integridade)                             │
│    - Valida quotas do tenant                                    │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. EDGE FUNCTION: serve-installer                               │
│    - Busca credenciais geradas                                  │
│    - Injeta variáveis no template compartilhado                 │
│    - Calcula SHA256 do script gerado                            │
│    - Valida conteúdo (tamanho mínimo, placeholders)             │
│    - Retorna script para download                               │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. VALIDAÇÃO CLIENT-SIDE (validatePs1Content)                   │
│    - Verifica placeholders não substituídos                     │
│    - Valida tamanho mínimo (50KB Windows, 5KB Linux)            │
│    - Valida estrutura PowerShell/Bash                           │
│    - Exibe toast de erro se inválido                            │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. DOWNLOAD E VALIDAÇÃO SHA256                                  │
│    - Usuário baixa script (.ps1 ou .sh)                         │
│    - Frontend calcula SHA256 do arquivo                         │
│    - Compara com hash armazenado no banco                       │
│    - Alerta crítico se mismatch                                 │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. EXECUÇÃO NO SERVIDOR ALVO                                    │
│    - Usuário executa script (requer admin/root)                 │
│    - Script baixa agente Python via curl/wget                   │
│    - Cria Scheduled Task (Windows) ou Cron Job (Linux)          │
│    - Agente inicia heartbeat para backend                       │
└─────────────────────────────────────────────────────────────────┘
```

## 🛡️ Componentes de Segurança

### Circuit Breaker
- **Objetivo:** Proteger contra falhas em cascata
- **Threshold:** 5 falhas consecutivas (ajustado de 3 para 5)
- **Timeout:** 30s (reduzido de 60s para 30s - mais ágil)
- **Reset manual:** Botão "Resetar Bloqueio" no frontend
- **Localização:** `src/lib/circuit-breaker.ts` + `src/pages/AgentInstaller.tsx`

### HMAC Authentication
- **Gerado em:** `auto-generate-enrollment`
- **Armazenado em:** `agents.hmac_secret` (64 chars hex)
- **Usado em:** Todas as comunicações agente→backend (heartbeat, jobs, metrics)
- **Validação:** Edge Functions verificam HMAC antes de processar requisições

### SHA256 Integrity
- **Calculado em:** Edge Functions (serve-installer, build-agent-exe)
- **Armazenado em:** `enrollment_keys.installer_sha256`
- **Validado em:** Frontend (antes de executar) e Agent (auto-update)
- **Algoritmo:** SHA-256 (256 bits = 64 caracteres hexadecimais)

### Validação Client-Side
- **Placeholders:** Regex `/\{\{[A-Z_]+\}\}/g`
- **Tamanho mínimo:** 50KB (Windows), 5KB (Linux)
- **Estrutura:** Verifica presença de funções essenciais
- **Implementação:** `validatePs1Content()` em `AgentInstaller.tsx`

## ⚙️ Variáveis de Ambiente Críticas

### Edge Functions
```bash
SUPABASE_URL=https://iavbnmduxpxhwubqrzzn.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sk_***
FORCE_LOGGING=true  # Habilita logs detalhados em produção
```

### Frontend (.env)
```bash
VITE_SUPABASE_URL=https://iavbnmduxpxhwubqrzzn.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ***
VITE_SUPABASE_PROJECT_ID=iavbnmduxpxhwubqrzzn
```

## 📊 Monitoramento (APM - FASE 4.1)

### Métricas Coletadas
- **Função:** Nome da Edge Function
- **Operação:** `edge_function`, `database_query`, `external_api`
- **Duração:** Tempo de execução em ms
- **Status:** 200 (sucesso), 500 (erro)
- **Erro:** Mensagem de erro se houver
- **Tenant ID:** Identificação do tenant (quando aplicável)
- **Metadata:** Dados contextuais adicionais

### Edge Functions Instrumentadas
1. `auto-generate-enrollment` ✅ (já instrumentado)
2. `serve-installer` ✅ (FASE 4.1)
3. `build-agent-exe` ✅ (FASE 4.1)
4. `check-agent-name-availability` ✅ (FASE 4.1)

### Alertas Configurados
- **Operações lentas:** > 2000ms (2 segundos)
- **Taxa de erro:** > 5% em janela de 5min
- **Circuit breaker:** Aberto por > 1min
- **Monitor:** `monitor-slow-operations` executado a cada 5min via cron

### Como Funciona o APM

```typescript
// Exemplo de uso do withAPM
import { withAPM } from '../_shared/apm.ts';

const result = await withAPM(
  'serve-installer',       // Nome da função
  'edge_function',         // Tipo de operação
  async () => {
    // Lógica da função aqui
    return generatedScript;
  },
  { 
    tenantId: user.tenant_id,
    metadata: { platform: 'windows', agentId: 'abc123' }
  }
);
```

## 🔧 Template Compartilhado

**Localização:** `supabase/functions/_shared/installer-template.ts`

**Placeholders suportados:**
- `{{SUPABASE_URL}}` - URL do Supabase
- `{{AGENT_TOKEN}}` - Token de autenticação do agente
- `{{HMAC_SECRET}}` - Secret para validação HMAC
- `{{AGENT_NAME}}` - Nome único do agente
- `{{AGENT_SCRIPT_CONTENT}}` - Script Python/Bash embutido
- `{{TIMESTAMP}}` - Data/hora de geração

**Usado por:**
- `serve-installer/index.ts`
- `build-agent-exe/index.ts`

**Benefício:** Uma única fonte de verdade para o template, evitando inconsistências.

## 🚨 Pontos Críticos de Falha

| Ponto de Falha | Mitigação | Status |
|----------------|-----------|--------|
| **Placeholder não substituído** | Validação client-side impede download | ✅ Implementado |
| **SHA256 mismatch** | Alerta crítico no frontend | ✅ Implementado |
| **Circuit breaker aberto** | Botão de reset manual disponível | ✅ Implementado |
| **Build EXE timeout** | Retry automático (até 2x) | ✅ Implementado |
| **Operação lenta** | APM registra + alerta se > 2s | ✅ FASE 4.1 |
| **Edge Function 500** | Logs detalhados com `FORCE_LOGGING` | ✅ Implementado |

## 📝 Logs Estruturados

### Níveis de Log
- **DEBUG:** Apenas em dev ou com `FORCE_LOGGING=true`
- **INFO:** Operações normais (em prod apenas com `FORCE_LOGGING`)
- **WARN:** Problemas não-críticos (sempre logado)
- **ERROR:** Erros críticos (sempre logado, sanitizado em prod)

### Exemplo de Log (Edge Function)
```json
{
  "level": "info",
  "timestamp": "2025-11-13T19:00:00.000Z",
  "function": "serve-installer",
  "message": "Script generated successfully",
  "metadata": {
    "tenantId": "uuid",
    "agentId": "uuid",
    "platform": "windows",
    "scriptSize": 52340,
    "sha256": "abc123..."
  }
}
```

### Como Habilitar Logs Detalhados
```bash
# No Supabase Dashboard -> Settings -> Secrets
FORCE_LOGGING=true

# Desabilitar após debug
FORCE_LOGGING=false
```

## 🧪 Testes End-to-End

**Localização:** `e2e/complete-installer-flow.spec.ts`

**Cenários cobertos:**
1. ✅ Geração de instalador Windows (comando one-click)
2. ✅ Geração de instalador Linux (script bash)
3. ✅ Validação de nome do agente (disponibilidade + caracteres)
4. ✅ Comportamento do Circuit Breaker (aberto/fechado/reset)
5. ✅ Mensagens de erro claras (nome curto, caracteres inválidos)
6. ✅ Interface de EXE Build

**Executar testes:**
```bash
npm run test:e2e -- e2e/complete-installer-flow.spec.ts
```

## 📚 Documentação Adicional

- [Troubleshooting do Instalador](./TROUBLESHOOTING_INSTALLER.md)
- [Arquitetura de Segurança](./SECURITY_ARCHITECTURE.md)
- [Especificação HMAC](./HMAC_SPECIFICATION.md)
- [Guia de Deployment](../DEPLOYMENT_CHECKLIST.md)

## 🔍 Debugging Tips

### Verificar logs das Edge Functions
```bash
# Acessar Lovable Cloud -> Edge Functions -> [nome-função] -> Logs
# Ou via Supabase Dashboard
```

### Testar conectividade com backend
```bash
curl -X GET "https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/auto-generate-enrollment" \
  -H "Authorization: Bearer YOUR_ANON_KEY"

# Resposta esperada: 200 com { status: "healthy" }
```

### Validar hash SHA256 de um instalador
```powershell
# PowerShell (Windows)
Get-FileHash -Algorithm SHA256 install-windows.ps1

# Bash (Linux/macOS)
sha256sum install-linux.sh
```

## 🚀 Performance Benchmarks

| Operação | Tempo Médio | Threshold | Status |
|----------|------------|-----------|--------|
| Validação de nome | 150ms | 500ms | ✅ OK |
| Geração de enrollment key | 800ms | 2000ms | ✅ OK |
| Geração de instalador PS1 | 1200ms | 2000ms | ✅ OK |
| Build EXE (GitHub Actions) | 120s | 300s | ✅ OK |
| Validação SHA256 (frontend) | 50ms | 200ms | ✅ OK |

---

**Última atualização:** 2025-11-13  
**Versão:** 4.1 (APM Implementation)
