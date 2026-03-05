# Política de Governança de IA - CyberShield

## 📋 Sumário Executivo

Este documento estabelece as políticas, controles e procedimentos de governança para todos os sistemas de Inteligência Artificial utilizados pela plataforma CyberShield.

**Versão:** 1.0.0  
**Última Atualização:** 2025-01-15  
**Responsável:** Equipe de Segurança CyberShield

---

## 🎯 Princípios Fundamentais

### 1. Transparência
- Todos os prompts AI são versionados com hash SHA256
- Logs estruturados de todas as inferências
- Rastreabilidade completa de decisões AI

### 2. Segurança
- Sanitização de inputs contra prompt injection
- Circuit breakers para proteção contra falhas
- Isolamento de dados por tenant

### 3. Responsabilidade
- Humanos sempre no loop para ações críticas
- Auditoria completa de todas as ações AI
- Rollback disponível para todas as mudanças

### 4. Privacidade
- Anonimização de dados sensíveis antes do envio para AI
- Nenhum dado PII enviado para modelos externos
- Retenção mínima necessária

---

## 🤖 Inventário de Modelos e Provedores

O sistema utiliza arquitetura **multi-provider com 6 IAs** em round-robin:

| # | Provedor | Modelo | Custo | Uso Principal |
|---|----------|--------|-------|---------------|
| 1 | **Google Gemini** | gemini-2.0-flash | $0.075/M | Análise geral, tradução CVE |
| 2 | **Groq** | llama-3.3-70b | **$0** | Consultas rápidas (~210ms) |
| 3 | **OpenRouter** | gemini-2.0-flash-exp:free | **$0** | Testes, prototipagem |
| 4 | **Cloudflare** | llama-3.1-8b | **$0** (10K/dia) | Batch processing |
| 5 | **Manus** | manus-1 | $0.10/M | Análises alternativas |
| 6 | **Lovable AI** | gemini-2.5-flash | $0.15/M | Fallback confiável |

### Critérios de Seleção de Provedor
- **Velocidade crítica**: Groq (latência ~210ms)
- **Custo zero**: Groq, OpenRouter, Cloudflare
- **Análises profundas**: Google Gemini, Manus
- **Fallback garantido**: Lovable AI (prioridade 99)

### Documentação Técnica
Ver: `docs/architecture/AI_MULTI_PROVIDER_ARCHITECTURE.md`

---

## 🔐 Controles de Segurança

### Prompt Injection Prevention
```typescript
// Padrões bloqueados automaticamente:
- [IGNORE.*INSTRUCTIONS]
- <script>, </script>
- Palavras-chave de controle de fluxo
- Caracteres de escape suspeitos
```

### Input Sanitization
- Limite de 10KB por input
- Remoção de tokens, secrets, chaves API
- Anonimização de nomes de agentes (hash curto)

### Circuit Breaker
- Timeout: 10-15 segundos
- Threshold: 3 falhas consecutivas
- Reset: 60 segundos

### Rate Limiting
- Por tenant: 100 requests/hora
- Por função: 20 requests/minuto
- Global: 1000 requests/hora

---

## 📊 Métricas e Monitoramento

### KPIs Obrigatórios
| Métrica | SLO | Alerta |
|---------|-----|--------|
| Latência P95 | < 5000ms | > 8000ms |
| Taxa de Sucesso | > 95% | < 90% |
| Circuit Breaker Trips | < 5/hora | > 10/hora |
| Tokens/Hora | < 100K | > 150K |

### Dashboard de Observabilidade
- Latência por função e modelo
- Taxa de sucesso em tempo real
- Uso de tokens por tenant
- Estado dos circuit breakers
- Erros e fallbacks

---

## 📝 Registro de Prompts

### Versionamento
Todos os prompts são registrados em `ai-prompt-registry.ts`:

```typescript
{
  id: 'agent-analyzer',
  version: '1.0.0',
  hash: 'sha256:...',
  content: '...',
  description: 'Analyzes individual agent health',
  created_at: '2025-01-15T00:00:00Z',
  deprecated: false
}
```

### Processo de Mudança de Prompt
1. Criar nova versão no registry
2. Computar hash SHA256
3. Deploy em ambiente de staging
4. Validar com conjunto de testes
5. Deploy em produção
6. Deprecar versão anterior (manter por 30 dias)

---

## 🚨 Resposta a Incidentes AI

### Níveis de Severidade

| Nível | Descrição | Resposta |
|-------|-----------|----------|
| P0 | Vazamento de dados, comportamento malicioso | Desabilitar imediatamente |
| P1 | Falhas em cascata, circuit breaker permanente | Investigar em 1h |
| P2 | Degradação de performance, erros esporádicos | Investigar em 24h |
| P3 | Logs anômalos, métricas fora do normal | Monitorar |

### Playbook de Incidente
1. **Detectar**: Alertas automáticos ou reporte manual
2. **Isolar**: Ativar circuit breaker manualmente se necessário
3. **Investigar**: Analisar logs estruturados
4. **Remediar**: Rollback de prompt ou modelo
5. **Documentar**: Post-mortem obrigatório para P0/P1

---

## 💰 Gestão de Custos

### Tracking por Tenant
- Tokens consumidos por tenant/mês
- Custo estimado por modelo
- Alertas de uso anômalo

### Limites de Custo
| Tier | Limite Mensal AI | Ação |
|------|------------------|------|
| Trial | 10K tokens | Rate limit severo |
| Starter | 50K tokens | Alerta em 80% |
| Business | 200K tokens | Alerta em 80% |
| Scale | 500K tokens | Sem limite hard |

### Otimização de Custos
- Usar modelos lite para tarefas simples
- Cache de respostas idênticas
- Batch processing quando possível

---

## 📋 Checklist de Compliance

### LGPD
- [ ] Dados anonimizados antes do envio
- [ ] Logs não contêm PII
- [ ] Retenção máxima de 30 dias
- [ ] Direito ao esquecimento implementado

### SOC 2
- [ ] Controles de acesso documentados
- [ ] Auditoria de todas as ações
- [ ] Criptografia em trânsito
- [ ] Monitoramento contínuo

### ISO 27001
- [ ] Política de segurança documentada
- [ ] Gestão de riscos AI
- [ ] Controles técnicos implementados
- [ ] Revisão periódica (trimestral)

---

## 🔄 Ciclo de Revisão

| Frequência | Atividade |
|------------|-----------|
| Diária | Revisar métricas de performance |
| Semanal | Analisar logs de erro |
| Mensal | Revisar custos e uso |
| Trimestral | Audit completo de governança |
| Anual | Revisão de política |

---

## 📚 Referências

- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
- [EU AI Act Guidelines](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)
- [OWASP LLM Top 10](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
- Documentação interna: `docs/SECURITY_ARCHITECTURE.md`

---

**Aprovado por:** Equipe de Segurança CyberShield  
**Data de Vigência:** 2025-01-15
