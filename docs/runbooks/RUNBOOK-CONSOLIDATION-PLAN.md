# Plano de Consolidacao de Roteadores

| Campo | Valor |
|-------|-------|
| **Codigo** | CONS-001 |
| **Versao** | 1.0 |
| **Status** | Em Avaliacao |
| **Data** | 2026-03-31 |
| **Prioridade** | Baixa (nao bloqueia auditoria) |

---

## 1. Estado Atual

### 1.1 Roteadores Existentes

| Roteador | Funcao | Metodo |
|----------|--------|--------|
| `ops-router` | Meta-roteador: cleanup + notify + automation | Proxy HTTP interno |
| `cleanup-router` | Limpeza de dados | Handlers inlinados |
| `notification-router` | Notificacoes multi-canal | Handlers inlinados |
| `evaluate-automation-rules` | Avaliacao de regras SOAR | Funcao independente |
| `collect-router` | Coleta de dados do agente | Handlers inlinados |
| `submit-router` | Submissao de telemetria | Handlers inlinados |
| `report-router` | Geracao de relatorios | Handlers inlinados |
| `ai-router` | Roteamento de modelos AI | Handlers inlinados |

### 1.2 Proxies Legacy (Backward Compatibility)

| Proxy | Destino | Middleware |
|-------|---------|-----------|
| `cleanup-stuck-jobs` | cleanup-router | serveInternal |
| `auto-cleanup-jobs` | cleanup-router | serveInternal |
| `cleanup-jobs` | cleanup-router | serveTenant |
| `notification-dispatcher` | notification-router | Proxy |

### 1.3 Arquitetura do ops-router

```
ops-router
  ├── cleanup:* → HTTP proxy → cleanup-router
  ├── notify:*  → HTTP proxy → notification-router
  └── automation:* → HTTP proxy → evaluate-automation-rules
```

**Restricao tecnica**: Deno nao permite import entre funcoes irmas (sibling functions), forçando o modelo de proxy HTTP.

---

## 2. Analise de Consolidacao

### 2.1 O que JA esta consolidado

- **cleanup-router**: Centraliza todas as operacoes de limpeza
- **notification-router**: Centraliza email, Telegram, WhatsApp, webhooks
- **ops-router**: Unifica cleanup + notify + automation via namespace
- **collect-router**: Centraliza coleta de certificados e USB
- **submit-router**: Centraliza submissao de telemetria
- **ai-router**: Centraliza roteamento de modelos AI

### 2.2 O que PODE ser consolidado

| Candidato | Destino | Risco | Beneficio |
|-----------|---------|-------|-----------|
| Proxies legacy (cleanup-stuck-jobs, auto-cleanup-jobs, cleanup-jobs) | Remover, usar ops-router direto | Baixo (se callers atualizados) | -3 funcoes, -3 cold starts |
| notification-dispatcher | Remover, usar ops-router direto | Baixo | -1 funcao |

### 2.3 O que NAO deve ser consolidado

| Funcao | Motivo |
|--------|--------|
| `heartbeat` | Hot path, precisa de cold start minimo |
| `poll-jobs` | Hot path, latencia critica |
| `enroll-agent` | Seguranca, isolamento de trust boundary |
| `stripe-webhook` | Requer verificacao de assinatura especifica |
| `saml-sso` | Complexidade de raw body / XML |
| `scim-provisioning` | Protocolo padrao, complexidade propria |
| `soar-engine` | Complexidade de estado e rollback |

---

## 3. Plano de Execucao

### Fase 1 — Limpeza de Proxies (Semana 1, Risco: Baixo)

**Objetivo**: Remover proxies redundantes cujos callers ja podem usar ops-router.

1. **Auditar callers** de cada proxy legacy:
   ```bash
   grep -r "cleanup-stuck-jobs\|auto-cleanup-jobs\|cleanup-jobs\|notification-dispatcher" \
     supabase/functions/ src/ .github/ --include="*.ts" --include="*.yml"
   ```

2. **Atualizar callers** para usar `ops-router` com namespace:
   - `cleanup-stuck-jobs` → `ops-router` com `{ action: "cleanup:stuck-jobs" }`
   - `auto-cleanup-jobs` → `ops-router` com `{ action: "cleanup:auto-cleanup-jobs" }`
   - `cleanup-jobs` → `ops-router` com `{ action: "cleanup:jobs" }`
   - `notification-dispatcher` → `ops-router` com `{ action: "notify:dispatch" }`

3. **Manter proxies como aliases** por 30 dias (deprecation period)

4. **Remover proxies** apos 30 dias sem chamadas

### Fase 2 — Avaliacao de Novos Namespaces (Semana 2-3, Risco: Medio)

Avaliar se vale adicionar ao ops-router:

| Namespace Potencial | Funcoes | Decisao |
|--------------------|---------|---------|
| `report:*` | report-router handlers | Avaliar volume de chamadas |
| `collect:*` | collect-router handlers | Baixo volume, manter separado |
| `submit:*` | submit-router handlers | Hot path, manter separado |

### Fase 3 — Documentacao e Deprecation (Semana 4)

1. Atualizar docs/api/API_DOCUMENTATION.md com endpoints consolidados
2. Atualizar docs/EDGE_FUNCTIONS.md com mapa de roteadores
3. Marcar funcoes deprecated no codigo
4. Adicionar metricas de uso por roteador

---

## 4. Metricas de Sucesso

| Metrica | Antes | Meta |
|---------|-------|------|
| Total de Edge Functions | 248 | 244 (-4 proxies) |
| Cold starts redundantes | ~12/hora | ~0/hora |
| Funcoes com `Deno.serve` bruto | 47 | 43 |
| Documentacao de endpoints | Parcial | Completa |

---

## 5. Riscos

| Risco | Probabilidade | Impacto | Mitigacao |
|-------|---------------|---------|-----------|
| Caller nao atualizado | Media | Jobs falhando | Manter proxy por 30 dias |
| Latencia adicional do proxy HTTP | Baixa | +50ms por hop | Hot paths nao passam por ops-router |
| Cold start do ops-router | Baixa | +200ms primeiro request | Pre-warm via health check |

---

## 6. Decisao

**Recomendacao**: Executar Fase 1 (limpeza de proxies). Fases 2-3 sao opcionais e nao bloqueiam SOC 2.

A consolidacao adicional alem do ops-router traz ganho marginal versus risco de quebra. O sistema ja esta logicamente consolidado via roteadores de dominio.

---

## Historico

| Versao | Data | Autor | Alteracoes |
|--------|------|-------|------------|
| 1.0 | 2026-03-31 | CyberShield Engineering | Versao inicial |
