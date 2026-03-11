# Protocolo do Fundador Único — CyberShield

| Campo | Valor |
|-------|-------|
| **Documento** | GOV-001 (Governance Protocol) |
| **Versão** | 1.0 |
| **Data Efetiva** | 2026-03-11 |
| **Revisão Obrigatória** | A cada 6 meses ou em evento de sucessão |
| **Classificação** | Confidencial — Governança Interna |

---

## 1. Preâmbulo

Este protocolo estabelece regras de dedicação, governança e sucessão para o CyberShield enquanto operado por um fundador único. Reconhece os riscos inerentes do modelo *single founder* e define mecanismos para mitigá-los, protegendo a empresa, os clientes e a continuidade do serviço.

---

## 2. Definições

| Termo | Definição |
|-------|-----------|
| **Fundador** | Pessoa física responsável única pela operação, desenvolvimento e decisões estratégicas do CyberShield |
| **Evento de Incapacidade** | Situação em que o Fundador não pode exercer suas funções por período > 72 horas |
| **Sucessor Designado** | Pessoa ou entidade previamente escolhida para assumir operações em caso de incapacidade |
| **Modo de Emergência** | Estado operacional mínimo que o sistema mantém autonomamente |
| **Key Person Risk** | Risco sistêmico de depender de uma única pessoa |

---

## 3. Regras de Dedicação

### 3.1 Compromisso Mínimo

| Métrica | Requisito Mínimo | Ideal |
|---------|:-----------------:|:-----:|
| **Horas semanais dedicadas** | 40h | 50h |
| **Disponibilidade para incidentes P0** | 24/7 | 24/7 |
| **Tempo de resposta para P0** | < 30min | < 15min |
| **Tempo de resposta para P1** | < 4h | < 1h |
| **Revisão de métricas** | Diária | Diária |
| **Revisão estratégica** | Semanal | Semanal |
| **Revisão de segurança** | Mensal | Quinzenal |

### 3.2 Divisão de Tempo Recomendada

| Área | % do Tempo | Atividades |
|------|:----------:|------------|
| **Engenharia** | 40% | Desenvolvimento, correção de bugs, infraestrutura |
| **Produto** | 20% | Features, UX, feedback de clientes |
| **Comercial** | 20% | Vendas, onboarding, suporte a clientes |
| **Operações** | 10% | Monitoramento, incidentes, manutenção |
| **Estratégia** | 10% | Captação, parcerias, roadmap, compliance |

### 3.3 Limites de Saúde

O Fundador reconhece que burnout é o principal risco operacional:

- **Obrigatório**: Mínimo 1 dia de descanso completo por semana
- **Obrigatório**: Mínimo 2 semanas de férias por ano (com cobertura do Modo de Emergência)
- **Recomendado**: Nenhuma sessão de trabalho > 12h consecutivas
- **Gatilho de alerta**: Se dedicação > 60h/semana por 3 semanas consecutivas, ativar plano de delegação

---

## 4. Mitigação do Key Person Risk

### 4.1 Automação como Substituto

O CyberShield foi deliberadamente projetado para operar autonomamente:

| Função | Automação Implementada | Dependência do Fundador |
|--------|----------------------|:-----------------------:|
| Monitoramento de agentes | Cron jobs + alertas automáticos | Nenhuma |
| Detecção de ameaças | Engine automática (2.130 eventos/mês) | Nenhuma |
| Resposta a incidentes | Playbooks SOAR + automação rules | Revisão apenas |
| Cobrança | Stripe automatizado | Nenhuma |
| Onboarding | Self-service + trials automáticos | Suporte apenas |
| Geração de relatórios | Cron diário + AI narrativa | Nenhuma |
| Backup de dados | Automático (database + storage) | Nenhuma |

**Capacidade autônoma estimada**: O sistema opera **até 72h** sem intervenção humana mantendo:
- Coleta de telemetria
- Detecção e alertas
- Evidence chain
- Cobrança e trials

### 4.2 Documentação como Seguro

| Ativo | Localização | Status |
|-------|------------|--------|
| Código-fonte | GitHub (repositório privado) | ✅ Atualizado |
| Documentação técnica | `/docs/` (30+ documentos) | ✅ Abrangente |
| ADRs (decisões arquiteturais) | `/docs/adr/` | ✅ 30+ ADRs |
| Runbooks operacionais | `/docs/runbooks/` | ✅ Documentados |
| Procedures de incidente | `/docs/procedures/` | ✅ Documentados |
| Credenciais e acessos | Vault criptografado | ✅ Organizado |
| Contratos de clientes | Sistema jurídico | ✅ Registrados |

### 4.3 Bus Factor Score

**Bus Factor atual: 1** (risco máximo)

Plano de melhoria:

| Milestone | Ação | Bus Factor Alvo |
|-----------|------|:---------------:|
| **MRR R$ 5k** | Contratar 1 dev part-time | 1.5 |
| **MRR R$ 15k** | Contratar 1 dev full-time | 2 |
| **MRR R$ 30k** | Contratar 1 ops + 1 dev | 3 |
| **MRR R$ 50k** | CTO ou co-fundador técnico | 3+ |

---

## 5. Protocolo de Sucessão

### 5.1 Cenários de Ativação

| Cenário | Gatilho | Ação |
|---------|---------|------|
| **Incapacidade temporária** (< 30 dias) | Fundador não responde em 72h | Ativar Modo de Emergência |
| **Incapacidade prolongada** (30-180 dias) | Confirmação médica ou legal | Ativar Sucessor Designado |
| **Incapacidade permanente** | Falecimento ou invalidez | Transferir propriedade conforme Seção 5.3 |
| **Saída voluntária** | Decisão do Fundador | Executar transição planejada (90 dias) |
| **Venda da empresa** | Acordo de M&A | Executar plano de transição conforme contrato |

### 5.2 Modo de Emergência (72h sem Fundador)

**Ações automáticas:**
1. Sistema continua operando autonomamente (seção 4.1)
2. Alertas P0 são escalados para contato de emergência
3. Novos trials e onboarding permanecem ativos
4. Nenhuma mudança de código ou infraestrutura

**Ações do contato de emergência:**
1. Notificar clientes Business/Enterprise sobre operação reduzida
2. Monitorar status page (status.cybershield.com.br)
3. NÃO realizar mudanças técnicas
4. Contactar Sucessor Designado se situação persistir > 72h

### 5.3 Cadeia de Sucessão

| Prioridade | Perfil | Responsabilidades |
|:----------:|--------|-------------------|
| **1º** | Sucessor Designado (a definir) | Operação técnica completa |
| **2º** | Advogado/Contador do Fundador | Gestão financeira e jurídica |
| **3º** | Familiar designado em testamento | Decisão sobre venda ou continuidade |

### 5.4 Pacote de Transição

O Fundador mantém atualizado um "Envelope de Emergência" contendo:

- [ ] Acesso ao repositório GitHub (token ou credenciais)
- [ ] Acesso ao painel de banco de dados (Lovable Cloud)
- [ ] Acesso ao Stripe (cobrança)
- [ ] Acesso ao domínio e DNS
- [ ] Acesso ao email corporativo
- [ ] Lista de clientes ativos com contratos
- [ ] Chaves de API e secrets
- [ ] Este documento de protocolo
- [ ] Instruções de operação do dia-a-dia (runbook simplificado)
- [ ] Contato do advogado e contador

**Localização do envelope**: Cofre digital + cópia física com pessoa de confiança

**Revisão obrigatória**: A cada 6 meses, verificar que todas as credenciais estão atualizadas.

---

## 6. Regras de Governança Solo

### 6.1 Decisões que Requerem "Cool-off Period"

Decisões que o Fundador NÃO pode tomar imediatamente (aguardar 48h):

| Decisão | Cool-off | Justificativa |
|---------|:--------:|---------------|
| Pivotar o produto | 7 dias | Evitar decisão emocional |
| Alterar pricing para baixo | 48h | Impacto em unit economics |
| Aceitar investimento | 14 dias | Due diligence mínima |
| Demitir (futuro) | 48h | Evitar impulsividade |
| Desligar feature em produção | 24h | Impacto em clientes |
| Mudar stack tecnológica | 7 dias | Custo de migração |

### 6.2 Conselho Consultivo Virtual

Até que haja board formal, o Fundador mantém:

| Papel | Frequência de Consulta | Escopo |
|-------|:----------------------:|--------|
| **Mentor técnico** | Mensal | Arquitetura, escalabilidade |
| **Mentor de negócios** | Mensal | Estratégia, fundraising |
| **Advogado** | Trimestral | Contratos, LGPD, societário |
| **Contador** | Mensal | Financeiro, fiscal |

### 6.3 Registro de Decisões Estratégicas

Toda decisão estratégica significativa é registrada como ADR (Architecture Decision Record) em `/docs/adr/` com:
- Contexto e problema
- Opções consideradas
- Decisão tomada e justificativa
- Consequências esperadas

---

## 7. Compromissos Éticos

O Fundador se compromete a:

1. **Transparência**: Nunca manipular métricas de segurança apresentadas aos clientes
2. **Privacidade**: Nunca acessar dados de clientes sem justificativa documentada
3. **Continuidade**: Manter o sistema operacional mesmo durante dificuldades financeiras pessoais (mínimo 90 dias após decisão de encerramento)
4. **Notificação**: Informar clientes Enterprise com 90 dias de antecedência em caso de encerramento
5. **Portabilidade**: Garantir que clientes possam exportar seus dados a qualquer momento

---

## 8. Revisão e Vigência

- Este protocolo entra em vigor na data de assinatura
- Revisão obrigatória a cada 6 meses
- Atualização obrigatória após qualquer evento de sucessão
- Atualização obrigatória ao atingir cada milestone de Bus Factor (seção 4.3)

---

## Histórico

| Versão | Data | Alterações |
|--------|------|------------|
| 1.0 | 2026-03-11 | Versão inicial |

---

**Assinatura do Fundador:**

_____________________________

Nome:

Data:

*Este documento é juridicamente informativo. Para validade legal, consultar advogado para formalização.*
