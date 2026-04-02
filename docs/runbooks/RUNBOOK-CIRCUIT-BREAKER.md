# Runbook: Circuit Breaker

> **Versão:** 1.0 | **Última atualização:** 2026-04-02 | **Autor:** Equipe CyberShield  
> **Arquivo:** `src/lib/circuit-breaker.ts`

---

## Índice

1. [Objetivo](#objetivo)
2. [Pré-requisitos](#pré-requisitos)
3. [Visão Geral](#visão-geral)
4. [Estados do Circuit Breaker](#estados-do-circuit-breaker)
5. [Configuração](#configuração)
6. [Monitoramento](#monitoramento)
7. [Passo a Passo: Diagnóstico](#passo-a-passo-diagnóstico)
8. [Reset Manual](#reset-manual)
9. [Impacto Operacional](#impacto-operacional)
10. [Troubleshooting](#troubleshooting)

---

## Objetivo

Documentar o funcionamento, monitoramento e resolução de incidentes relacionados ao **Circuit Breaker** do CyberShield, que protege o sistema contra falhas em cascata bloqueando requisições para serviços degradados.

## Pré-requisitos

- Acesso aos logs da aplicação (nível `WARN` e `ERROR`)
- Conhecimento básico do padrão Circuit Breaker
- Acesso administrativo ao sistema para reset manual (se necessário)

## Visão Geral

O Circuit Breaker é implementado na classe `CircuitBreaker` em `src/lib/circuit-breaker.ts`. Ele monitora chamadas a serviços externos e, ao detectar um número excessivo de falhas, bloqueia temporariamente novas requisições para evitar sobrecarga e falhas em cascata.

### Instanciação

```typescript
import { CircuitBreaker } from '@/lib/circuit-breaker';

const cb = new CircuitBreaker({
  name: 'api-externa',
  failureThreshold: 5,      // Falhas para abrir
  successThreshold: 2,       // Sucessos para fechar (em HALF_OPEN)
  timeout: 60000,            // 60s antes de tentar recuperação
});

const resultado = await cb.execute(() => chamarServicoExterno());
```

## Estados do Circuit Breaker

| Estado | Comportamento | Transição |
|--------|--------------|-----------|
| **CLOSED** | Operação normal. Requisições passam normalmente. | → OPEN (após `failureThreshold` falhas consecutivas) |
| **OPEN** | Requisições bloqueadas imediatamente com erro. | → HALF_OPEN (após `timeout` expirar) |
| **HALF_OPEN** | Permite requisições de teste para verificar recuperação. | → CLOSED (após `successThreshold` sucessos) ou → OPEN (qualquer falha) |

### Diagrama de Transição

```
CLOSED ──(falhas >= threshold)──► OPEN
  ▲                                  │
  │                              (timeout)
  │                                  ▼
  └──(sucessos >= threshold)── HALF_OPEN
                                     │
                               (1 falha)
                                     ▼
                                   OPEN
```

## Configuração

| Parâmetro | Padrão | Descrição |
|-----------|--------|-----------|
| `failureThreshold` | 5 | Número de falhas consecutivas para abrir o circuito |
| `successThreshold` | 2 | Número de sucessos em HALF_OPEN para fechar |
| `timeout` | 60.000ms (1 min) | Tempo antes de tentar recuperação |
| `name` | `'default'` | Identificador único do circuit breaker |

> **Nota sobre o Global Circuit Breaker (ADR-042):** Existe um circuit breaker global que pausa todas as remediações automáticas se >30% da frota for afetada em 10 minutos. Opera em modo **fail-closed**: se a verificação falhar, a execução é bloqueada.

## Monitoramento

### Logs Gerados

| Evento | Nível | Mensagem |
|--------|-------|----------|
| Requisição bloqueada | `WARN` | `Circuit breaker is OPEN, rejecting request` |
| Transição para HALF_OPEN | `INFO` | `Circuit breaker transitioning to HALF_OPEN` |
| Recuperação (CLOSED) | `INFO` | `Circuit breaker CLOSED after recovery` |
| Abertura por falhas | `ERROR` | `Circuit breaker OPENED due to failures` |
| Reabertura de HALF_OPEN | `WARN` | `Circuit breaker opened from HALF_OPEN` |
| Reset manual | `INFO` | `Circuit breaker manually reset` |

### Exemplo de Log de Abertura

```json
{
  "level": "error",
  "message": "Circuit breaker OPENED due to failures",
  "data": {
    "circuit": "agent-heartbeat",
    "failures": 5,
    "nextAttempt": "2026-04-02T15:30:00.000Z"
  }
}
```

### Métricas a Monitorar

- Taxa de erros `Circuit breaker is OPEN` por minuto
- Frequência de transições CLOSED → OPEN
- Tempo médio em estado OPEN
- Número de resets manuais

## Passo a Passo: Diagnóstico

### 1. Identificar que o Circuit Breaker foi acionado

```bash
# Buscar nos logs por circuitos abertos
grep -i "circuit breaker" /var/log/cybershield/app.log | grep -i "OPEN"
```

### 2. Identificar qual circuito está afetado

Verifique o campo `circuit` no log para identificar o serviço degradado:
- `agent-heartbeat` → Serviço de heartbeat dos agentes
- `job-dispatch` → Despacho de jobs
- `external-api` → API externa integrada

### 3. Verificar o serviço de destino

```bash
# Testar conectividade com o serviço
curl -s -o /dev/null -w "%{http_code}" https://api.servico.com/health

# Verificar DNS
nslookup api.servico.com

# Verificar latência
curl -w "tempo_total: %{time_total}s\n" -o /dev/null -s https://api.servico.com/health
```

### 4. Verificar se o serviço se recuperou

Aguarde o `timeout` configurado. O circuit breaker transitará automaticamente para HALF_OPEN e testará o serviço.

### 5. Verificação de Sucesso

- Log `Circuit breaker CLOSED after recovery` aparece
- Requisições voltam a ser processadas normalmente
- Taxa de erros retorna ao baseline

## Reset Manual

O circuit breaker pode ser resetado programaticamente:

```typescript
circuitBreaker.reset();
// Log gerado: "Circuit breaker manually reset"
```

> ⚠️ **Atenção:** Resetar manualmente sem resolver a causa raiz pode causar nova abertura imediata e sobrecarga do serviço degradado.

## Impacto Operacional

Quando o circuit breaker está **OPEN**:

| Impacto | Descrição |
|---------|-----------|
| **Jobs pausados** | Jobs dependentes do serviço afetado não são despachados |
| **Heartbeats rejeitados** | Agentes podem aparecer como "offline" temporariamente |
| **Automações bloqueadas** | Remediações automáticas são suspensas |
| **Dados atrasados** | Coleta de telemetria é interrompida até recuperação |

## Troubleshooting

| Sintoma | Causa Provável | Ação |
|---------|---------------|------|
| Circuit breaker abre repetidamente | Serviço destino instável | Verificar saúde do serviço, aumentar `timeout` |
| Circuit breaker nunca fecha | `successThreshold` muito alto | Reduzir threshold ou investigar falhas intermitentes |
| Falsos positivos (abre sem falha real) | Timeouts de rede | Ajustar timeout da requisição, verificar firewall |
| Reset manual não resolve | Causa raiz não foi corrigida | Investigar e corrigir o serviço antes de resetar |

---

**Referências:**
- `src/lib/circuit-breaker.ts` — Implementação
- `src/lib/__tests__/circuit-breaker.test.ts` — Testes unitários
- ADR-042 — Salvaguardas de Automação e Governança
