# Plano de Comunicação de Violação de Dados (Breach Communication Plan)

| Campo | Valor |
|-------|-------|
| **Código** | BCP-002 |
| **Versão** | 1.0 |
| **Status** | Aprovado |
| **Responsável** | DPO / Security Officer |
| **Data Efetiva** | 2026-03-05 |
| **Revisão** | 2027-03-05 |
| **Critério SOC 2** | CC7.3, CC7.4 |
| **Critério LGPD** | Art. 48, Art. 49 |

---

## 1. Objetivo

Estabelecer um playbook formal para comunicação de incidentes de violação de dados pessoais, garantindo conformidade com o Art. 48 da LGPD (notificação à ANPD em prazo razoável) e com requisitos SOC 2 de gestão de incidentes.

---

## 2. Escopo

Este plano cobre:
- Violações de dados pessoais (LGPD)
- Vazamento de credenciais ou secrets
- Acesso não autorizado a dados de clientes
- Exfiltração de dados confirmada ou suspeita
- Comprometimento de sistemas que armazenam dados pessoais

---

## 3. Definições

| Termo | Definição |
|-------|-----------|
| **Violação de dados** | Incidente de segurança que resulta em acesso, destruição, perda, alteração ou divulgação não autorizada de dados pessoais |
| **Dado pessoal** | Informação relacionada a pessoa natural identificada ou identificável (LGPD Art. 5º) |
| **ANPD** | Autoridade Nacional de Proteção de Dados |
| **Titular** | Pessoa natural a quem se referem os dados pessoais |
| **Controlador** | Pessoa (física ou jurídica) que toma decisões sobre o tratamento de dados pessoais |
| **Operador** | Pessoa que realiza o tratamento em nome do controlador |

---

## 4. Classificação de Violações

### 4.1 Níveis de Severidade

| Nível | Critérios | Prazo de Notificação | Exemplo |
|:-----:|-----------|:--------------------:|---------|
| **Crítico** | Dados sensíveis expostos, grande volume, risco significativo aos titulares | 24 horas (interno) → 72 horas (ANPD) | Vazamento de banco com dados de todos os clientes |
| **Alto** | Dados pessoais expostos, volume moderado | 48 horas (interno) → 72 horas (ANPD) | Acesso não autorizado a tabela de perfis |
| **Médio** | Dados operacionais expostos, risco limitado | 72 horas (interno) | Exposição de IPs de agentes |
| **Baixo** | Sem dados pessoais afetados, risco mínimo | 5 dias úteis (interno) | Tentativa de acesso bloqueada |

### 4.2 Critérios de Avaliação

Para classificar a severidade, avaliar:
1. **Tipo de dados**: Sensíveis (saúde, biometria) > Pessoais > Operacionais
2. **Volume**: Quantidade de registros/titulares afetados
3. **Reversibilidade**: Dados podem ser recuperados/revogados?
4. **Impacto**: Risco real aos titulares (financeiro, reputacional, discriminação)
5. **Intencionalidade**: Ataque direcionado vs. exposição acidental

---

## 5. Fluxo de Comunicação

### 5.1 Timeline de Resposta

```
T+0h    Detecção do incidente
  ↓
T+1h    Classificação inicial de severidade
  ↓
T+2h    Notificação interna (equipe de resposta)
  ↓
T+4h    Avaliação de impacto sobre dados pessoais
  ↓
T+8h    Decisão sobre notificação à ANPD e titulares
  ↓
T+24h   Preparação da comunicação formal
  ↓
T+48h   Envio da notificação à ANPD (se aplicável)
  ↓
T+72h   Prazo máximo LGPD — notificação à ANPD concluída
  ↓
T+72h+  Notificação aos titulares (se necessário)
  ↓
T+30d   Relatório final de incidente
```

### 5.2 Equipe de Resposta a Violação

| Papel | Responsabilidade | Contato |
|-------|-----------------|---------|
| **DPO** | Líder da comunicação, interface com ANPD | dpo@cybershield.com |
| **Security Officer** | Análise técnica, contenção | security@cybershield.com |
| **CTO** | Decisões técnicas, recursos | cto@cybershield.com |
| **Jurídico** | Avaliação legal, revisão de comunicações | legal@cybershield.com |
| **Comunicação** | Comunicados públicos, FAQ | comms@cybershield.com |
| **CEO** | Aprovação final de comunicações externas | ceo@cybershield.com |

---

## 6. Notificação à ANPD

### 6.1 Requisitos (LGPD Art. 48 §1º)

A notificação à ANPD deve conter:

| Item | Descrição | Obrigatório |
|------|-----------|:-----------:|
| 1 | Natureza dos dados pessoais afetados | ✅ |
| 2 | Informações sobre os titulares envolvidos | ✅ |
| 3 | Indicação das medidas técnicas e de segurança utilizadas | ✅ |
| 4 | Riscos relacionados ao incidente | ✅ |
| 5 | Motivos da demora (se não imediata) | ✅ |
| 6 | Medidas adotadas para reverter ou mitigar os efeitos | ✅ |

### 6.2 Template de Notificação à ANPD

```
NOTIFICAÇÃO DE INCIDENTE DE SEGURANÇA COM DADOS PESSOAIS

1. IDENTIFICAÇÃO DO CONTROLADOR
   - Razão Social: [CyberShield / Cliente MSP]
   - CNPJ: [XX.XXX.XXX/XXXX-XX]
   - DPO: [Nome], [Email], [Telefone]

2. DESCRIÇÃO DO INCIDENTE
   - Data/hora da detecção: [DD/MM/AAAA HH:MM]
   - Data/hora estimada da ocorrência: [DD/MM/AAAA HH:MM]
   - Tipo de incidente: [Acesso não autorizado / Vazamento / Perda / etc.]
   - Descrição resumida: [Texto]

3. DADOS PESSOAIS AFETADOS
   - Tipos de dados: [Nome, email, IP, etc.]
   - Categorias de titulares: [Clientes, funcionários, etc.]
   - Volume estimado: [Número de registros/titulares]
   - Dados sensíveis envolvidos: [Sim/Não — especificar]

4. MEDIDAS DE SEGURANÇA EXISTENTES
   - Criptografia: [AES-256, TLS 1.3]
   - Controle de acesso: [RBAC, RLS, MFA]
   - Monitoramento: [Logs de auditoria, alertas]

5. IMPACTO E RISCOS
   - Risco aos titulares: [Alto/Médio/Baixo]
   - Possíveis consequências: [Texto]

6. MEDIDAS DE CONTENÇÃO E MITIGAÇÃO
   - Ações imediatas tomadas: [Texto]
   - Ações planejadas: [Texto]
   - Cronograma: [Texto]

7. COMUNICAÇÃO AOS TITULARES
   - Realizada: [Sim/Não]
   - Meio utilizado: [Email, publicação, etc.]
   - Data: [DD/MM/AAAA]
```

---

## 7. Notificação aos Titulares

### 7.1 Quando Notificar

Notificação aos titulares é obrigatória quando:
- O incidente pode acarretar risco ou dano relevante
- Dados sensíveis foram expostos
- A ANPD determinar a comunicação
- Há risco de dano financeiro, discriminação ou roubo de identidade

### 7.2 Conteúdo da Notificação

A comunicação aos titulares deve ser:
- Em linguagem clara e acessível
- Enviada por canal direto (email preferencial)
- Contendo:
  - O que aconteceu (sem jargão técnico)
  - Quais dados foram afetados
  - O que estamos fazendo para resolver
  - O que o titular pode fazer para se proteger
  - Canal de contato para dúvidas

### 7.3 Template de Notificação ao Titular

```
Assunto: Aviso Importante sobre Segurança dos Seus Dados

Prezado(a) [Nome],

Estamos escrevendo para informá-lo(a) sobre um incidente de segurança 
que pode ter afetado seus dados pessoais.

O QUE ACONTECEU
[Descrição simples e transparente do incidente]

QUAIS DADOS FORAM AFETADOS
[Lista dos tipos de dados: nome, email, etc.]

O QUE ESTAMOS FAZENDO
[Medidas tomadas e planejadas]

O QUE VOCÊ PODE FAZER
- Altere sua senha em [link]
- Ative autenticação em dois fatores
- Monitore atividades suspeitas em suas contas
- [Outras recomendações específicas]

CONTATO
Para dúvidas ou mais informações:
- Email: dpo@cybershield.com
- [Outros canais]

Pedimos sinceras desculpas pelo inconveniente.

Atenciosamente,
[Nome do DPO]
Encarregado de Proteção de Dados
CyberShield
```

---

## 8. Notificação a Clientes MSP (Operador → Controlador)

### 8.1 Obrigações como Operador

Quando o CyberShield atua como operador para clientes MSP:

| Ação | Prazo | Responsável |
|------|:-----:|------------|
| Notificar cliente (controlador) | 24 horas | DPO |
| Fornecer relatório técnico | 48 horas | Security Officer |
| Apoiar investigação do cliente | Contínuo | Equipe de segurança |
| Fornecer evidências para ANPD do cliente | Sob demanda | DPO + Jurídico |

### 8.2 Conteúdo da Notificação ao Cliente MSP

- Descrição técnica do incidente
- Dados do tenant afetado
- Timeline detalhada
- Medidas de contenção tomadas
- Indicadores de compromisso (IOCs)
- Recomendações de ação

---

## 9. Comunicação Pública

### 9.1 Critérios para Comunicação Pública

Comunicação pública é necessária quando:
- Grande número de titulares afetados
- Incidente com repercussão na mídia
- ANPD determinar publicidade
- Transparência proativa é a melhor estratégia

### 9.2 Canais

| Canal | Uso | Aprovação |
|-------|-----|-----------|
| Status page | Atualização de disponibilidade | CTO |
| Blog corporativo | Post-mortem público | CEO |
| Email em massa | Notificação direta a afetados | DPO |
| Redes sociais | Direcionamento para canais oficiais | Comunicação + CEO |

---

## 10. Pós-Incidente

### 10.1 Relatório Final

Dentro de 30 dias, produzir relatório contendo:
- Cronologia completa do incidente
- Causa raiz (root cause analysis)
- Dados afetados (tipos, volumes, titulares)
- Efetividade das medidas de contenção
- Lições aprendidas
- Plano de ação corretivo com prazos

### 10.2 Melhorias

- Atualizar políticas de segurança conforme lições aprendidas
- Implementar controles adicionais identificados
- Atualizar runbooks e playbooks
- Conduzir treinamento adicional se necessário

---

## 11. Registro e Documentação

Todos os incidentes de violação devem ser registrados em:

| Registro | Localização | Retenção |
|----------|------------|----------|
| Audit log | `audit_logs` | 7 anos |
| Security events | `security_events` | 7 anos |
| Relatório de incidente | Documentação interna | 10 anos |
| Comunicações enviadas | Arquivo de compliance | 10 anos |
| Decisões de notificação | Ata documentada | 10 anos |

---

## 12. Evidências Técnicas

| Controle | Implementação | Evidência |
|----------|--------------|-----------|
| Detecção | Monitoramento + alertas | `security_events`, `alert_rules` |
| Classificação | Playbook de severidade | Este documento |
| Notificação ANPD | Template padronizado | Seção 6.2 |
| Notificação titulares | Template padronizado | Seção 7.3 |
| Auditoria | Registro imutável | `audit_logs` |
| Pós-incidente | Relatório obrigatório | Procedimento documentado |

---

## Referências

- [Plano de Resposta a Incidentes](../procedures/incident_response_plan.md) (PRI-001)
- [Política de Privacidade LGPD](../policies/10_privacy_lgpd_policy.md) (PDP-001)
- [DPIA / RIPD](./DPIA_RIPD.md)
- [Runbook: Modo de Emergência](../runbooks/RUNBOOK-EMERGENCY-MODE.md)
- LGPD — Lei nº 13.709/2018, Art. 48 e 49

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2026-03-05 | CyberShield Security | Versão inicial |
