# Arquitetura Multi-Provider de IA - CyberShield

## 📋 Visão Geral

O CyberShield implementa uma arquitetura multi-provider de IA com **6 provedores** trabalhando em conjunto através de um sistema de **round-robin com fallback automático**. Esta abordagem otimiza custos, performance e disponibilidade.

**Versão:** 1.0.0  
**Data:** 2025-02-07  
**Status:** ✅ Implementado

---

## 🎯 Provedores Configurados

| # | Provedor | Modelo | Custo | Prioridade | Status |
|---|----------|--------|-------|------------|--------|
| 1 | **Google Gemini** | gemini-2.0-flash | $0.075/M tokens | 1 | ✅ Ativo |
| 2 | **Groq** | llama-3.3-70b-versatile | **$0** (gratuito) | 2 | ✅ Ativo |
| 3 | **OpenRouter** | gemini-2.0-flash-exp:free | **$0** (gratuito) | 3 | ✅ Ativo |
| 4 | **Cloudflare Workers AI** | llama-3.1-8b-instruct | **$0** (10K/dia) | 4 | ✅ Ativo |
| 5 | **Manus** | manus-1 | $0.10/M tokens | 5 | ✅ Ativo |
| 6 | **Lovable AI** | gemini-2.5-flash | $0.15/M tokens | 99 (fallback) | ✅ Ativo |

---

## 🏗️ Arquitetura Técnica

### Componentes Principais

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Edge Functions (Deno)                           │
│  ├── translate-cve                                                  │
│  ├── ai-analyze-agent                                               │
│  ├── analyze-network-anomalies                                      │
│  ├── ai-system-analyzer                                             │
│  └── ai-provider-status                                             │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│              _shared/ai-provider-helper.ts                          │
│  ├── callAI() - Drop-in replacement para chamadas diretas           │
│  ├── callAISimple() - System + User prompt                          │
│  ├── callAIJson() - Extração de JSON estruturado                    │
│  └── callAISanitized() - Com sanitização anti-injection             │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│              _shared/ai-multi-provider.ts                           │
│  ├── PROVIDERS[] - Configuração dos 6 provedores                    │
│  ├── Round-robin selection                                          │
│  ├── Per-provider circuit breakers                                  │
│  ├── Automatic fallback chain                                       │
│  └── Unified response format                                        │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Provedores Externos                              │
│  [Gemini] ←→ [Groq] ←→ [OpenRouter] ←→ [Cloudflare] ←→ [Manus]     │
│                              │                                      │
│                              ▼                                      │
│                    [Lovable AI - Fallback]                          │
└─────────────────────────────────────────────────────────────────────┘
```

### Secrets Necessários

| Secret | Provedor | Obrigatório |
|--------|----------|-------------|
| `GOOGLE_GEMINI_API_KEY` | Google Gemini | Sim |
| `GROQ_API_KEY` | Groq | Sim |
| `OPENROUTER_API_KEY` | OpenRouter | Sim |
| `CLOUDFLARE_AI_API_TOKEN` | Cloudflare | Sim |
| `CLOUDFLARE_AI_ACCOUNT_ID` | Cloudflare | Sim |
| `MANUS_API_KEY` | Manus | Sim |
| `LOVABLE_API_KEY` | Lovable AI | Auto-configurado |

---

## 🔄 Estratégia de Roteamento

### Round-Robin

O sistema utiliza seleção round-robin entre provedores disponíveis, excluindo o fallback:

```typescript
function selectNextProvider(excludeFallback = true): AIProviderConfig | null {
  let providers = getAvailableProviders();
  
  if (excludeFallback) {
    providers = providers.filter(p => p.name !== 'lovable');
  }
  
  const selected = providers[roundRobinIndex % providers.length];
  roundRobinIndex++;
  
  return selected;
}
```

### Fallback Automático

Se um provedor falhar, o sistema tenta automaticamente o próximo na lista:

```
Ordem de Fallback:
1. Provedor selecionado (round-robin)
2. Próximos provedores por prioridade
3. Lovable AI (fallback final)
```

---

## 🔐 Circuit Breaker

Cada provedor possui circuit breaker independente:

| Parâmetro | Valor |
|-----------|-------|
| Threshold de falhas | 3 |
| Tempo de reset | 60 segundos |
| Estados | Closed → Open → Half-Open |

```typescript
// Após 3 falhas consecutivas, o circuit abre
if (circuit.failures >= CIRCUIT_FAILURE_THRESHOLD) {
  circuit.isOpen = true;
}

// Após 60s, entra em half-open para teste
if (Date.now() - circuit.lastFailure > CIRCUIT_RESET_MS) {
  return true; // Permite chamada de teste
}
```

---

## 📊 Monitoramento

### Endpoint de Status

```
GET /functions/v1/ai-provider-status
```

**Resposta:**
```json
{
  "timestamp": "2025-02-07T12:00:00Z",
  "healthScore": 100,
  "summary": {
    "totalProviders": 6,
    "enabledProviders": 6,
    "healthyProviders": 6,
    "unhealthyProviders": 0
  },
  "activeProviders": ["google-gemini", "groq", "openrouter", "cloudflare", "manus"],
  "providers": [...]
}
```

### Reset de Circuit

```
POST /functions/v1/ai-provider-status
Body: { "provider": "groq", "action": "reset_circuit" }
```

---

## 📈 Métricas

O sistema registra métricas estruturadas para cada chamada:

```typescript
{
  type: 'ai_inference_metrics',
  timestamp: '...',
  function_name: 'translate-cve',
  model: 'llama-3.3-70b-versatile',
  latency_ms: 210,
  success: true,
  tenant_id: '...',
  tokens_prompt: 150,
  tokens_completion: 200,
  tokens_total: 350,
  used_fallback: false
}
```

---

## 🔒 Segurança

### Sanitização de Inputs

Todos os inputs passam por sanitização contra prompt injection:

```typescript
const result = sanitizeForAI(userInput);
if (result.blocked) {
  // Padrões maliciosos detectados
  console.warn('Prompt injection blocked:', result.blockedPatterns);
}
```

### Padrões Bloqueados

- `[IGNORE.*INSTRUCTIONS]`
- `<script>`, `</script>`
- Tokens e API keys
- Caracteres de escape suspeitos

---

## 🚀 Uso nas Edge Functions

### Migração de Chamadas Diretas

**Antes:**
```typescript
const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {...});
```

**Depois:**
```typescript
import { callAI } from '../_shared/ai-provider-helper.ts';

const result = await callAI(messages, { 
  maxTokens: 1024, 
  functionName: 'my-function',
  tenantId 
});
```

### Exemplos de Uso

```typescript
// Simples (system + user)
const result = await callAISimple(
  'Você é um analista de segurança.',
  'Analise este log: ...',
  { functionName: 'analyze-log' }
);

// JSON estruturado
const { data, result } = await callAIJson<MyType>(
  'Retorne um JSON com os campos...',
  'Dados: ...',
  { functionName: 'extract-data' }
);

// Com sanitização
const result = await callAISanitized(
  'Você é um assistente.',
  userInputPotentiallyMalicious,
  { functionName: 'user-chat' }
);
```

---

## 📋 Edge Functions Integradas

| Função | Uso de IA | Status |
|--------|-----------|--------|
| `translate-cve` | Tradução de vulnerabilidades | ✅ Migrado |
| `ai-analyze-agent` | Análise de saúde de agentes | ✅ Migrado |
| `analyze-network-anomalies` | Detecção de anomalias | ✅ Migrado |
| `ai-system-analyzer` | Análise do sistema | ✅ Migrado |
| `ai-provider-status` | Monitoramento | ✅ Novo |

---

## 📚 Referências

- `supabase/functions/_shared/ai-multi-provider.ts` - Lógica principal
- `supabase/functions/_shared/ai-provider-helper.ts` - Helper de integração
- `supabase/functions/_shared/ai-circuit-breaker.ts` - Circuit breaker
- `supabase/functions/_shared/ai-metrics.ts` - Sistema de métricas
- `supabase/functions/_shared/ai-sanitizer.ts` - Sanitização de inputs
- `docs/AI_GOVERNANCE_POLICY.md` - Política de governança

---

**Mantido por:** Equipe CyberShield  
**Última atualização:** 2025-02-07
