# Plano de Resposta a Incidentes (PRI)

| Campo | Valor |
|-------|-------|
| **Código** | PRI-001 |
| **Versão** | 1.0 |
| **Status** | Aprovado |
| **Responsável** | CISO / Líder de Resposta a Incidentes |
| **Data Efetiva** | 2025-01-01 |
| **Revisão** | 2026-01-01 |
| **Critério SOC 2** | CC7 |
| **Política Pai** | ISP-001, IRP-004 |

---

## 1. Objetivo

Fornecer um plano tático e operacional para detecção, contenção, erradicação e recuperação de incidentes de segurança, complementando a Política de Resposta a Incidentes (04_incident_response_policy.md).

---

## 2. Equipe de Resposta a Incidentes (CSIRT)

### 2.1 Estrutura

| Papel | Responsável | Contato | Backup |
|-------|-------------|---------|--------|
| **Líder de Incidentes** | CISO | ciso@cybershield.com.br | CTO |
| **Analista de Segurança** | SecOps Lead | secops@cybershield.com.br | Eng. Sênior |
| **Engenheiro de Plataforma** | DevOps Lead | devops@cybershield.com.br | Backend Lead |
| **Comunicação** | Head de Produto | product@cybershield.com.br | CEO |
| **Legal/DPO** | DPO | dpo@cybershield.com.br | Assessoria Jurídica |
| **Suporte ao Cliente** | CS Lead | support@cybershield.com.br | Account Manager |

### 2.2 Cadeia de Escalação

```
Nível 1 (L1) - Analista de Segurança
  ↓ (15 min sem resolução ou Severidade >= Alta)
Nível 2 (L2) - Líder de Incidentes + Engenheiro de Plataforma
  ↓ (30 min sem resolução ou Severidade = Crítica)
Nível 3 (L3) - CSIRT completo + CTO + CEO
  ↓ (Dados pessoais afetados)
Nível 4 (L4) - DPO + Assessoria Jurídica + Notificação ANPD
```

---

## 3. Classificação de Incidentes

### 3.1 Severidade

| Severidade | Critério | SLA de Resposta | SLA de Resolução | Exemplos |
|------------|----------|----------------|-------------------|----------|
| **Crítica (P0)** | Impacto em produção, dados comprometidos, mais de 30% da frota | 15 minutos | 4 horas | Breach de dados, RCE em agentes, supply chain comprometida |
| **Alta (P1)** | Serviço degradado, vulnerabilidade explorada, tenant afetado | 30 minutos | 8 horas | Escalada de privilégio, bypass de RLS, DDoS |
| **Média (P2)** | Vulnerabilidade identificada sem exploração ativa | 4 horas | 48 horas | CVE em dependência, falha de autenticação isolada |
| **Baixa (P3)** | Anomalia sem impacto imediato | 24 horas | 7 dias | Scan de reconhecimento, falha de compliance |

### 3.2 Categorias

| Categoria | Descrição | Playbook |
|-----------|-----------|----------|
| **DATA-BREACH** | Acesso não autorizado a dados pessoais | Playbook A |
| **MALWARE** | Código malicioso detectado nos endpoints | Playbook B |
| **SUPPLY-CHAIN** | Comprometimento de script/binário do agente | Playbook C |
| **TENANT-BREACH** | Violação de isolamento multi-tenant | Playbook D |
| **AUTH-BYPASS** | Bypass de autenticação ou autorização | Playbook E |
| **DDoS** | Negação de serviço | Playbook F |
| **INSIDER** | Ameaça interna (acesso indevido por funcionário/operador) | Playbook G |

---

## 4. Fases de Resposta

### 4.1 Fase 1: Detecção e Identificação (0-15 min)

**Fontes de Detecção:**
- Alertas automáticos do sistema (anomaly detection, circuit breaker)
- Logs de segurança (`security_logs`, `audit_logs`)
- Monitoramento de integridade do agente (TOCTOU)
- Relatórios de operadores MSP
- Canal de Responsible Disclosure

**Ações Imediatas:**
1. Registrar o incidente no sistema (`security_logs`)
2. Classificar severidade e categoria
3. Notificar equipe conforme cadeia de escalação
4. Iniciar registro cronológico (timeline do incidente)

**Checklist de Identificação:**
- [ ] O que foi afetado? (sistema, dados, endpoints)
- [ ] Quantos tenants/agentes impactados?
- [ ] Dados pessoais comprometidos? (gatilho LGPD)
- [ ] Vetor de ataque identificado?
- [ ] Ataque ainda ativo?

### 4.2 Fase 2: Contenção (15-60 min)

**Contenção Imediata (Short-term):**

| Cenário | Ação de Contenção |
|---------|-------------------|
| Agente comprometido | Revogar tokens (rotação nuclear), quarentenar agente |
| Breach de tenant | Desabilitar sessões ativas, revogar API keys |
| Supply chain | Pausar entregas de atualização, ativar circuit breaker |
| Auth bypass | Revogar tokens, forçar re-autenticação global |
| DDoS | Ativar rate limiting, bloquear IPs (`ip_blocklist`) |

**Contenção de Longo Prazo:**
1. Isolar sistemas afetados sem destruir evidências
2. Aplicar patches ou workarounds temporários
3. Redirecionar tráfego se necessário
4. Preservar logs e snapshots forenses

### 4.3 Fase 3: Erradicação (1-24 horas)

**Ações:**
1. Identificar e remover causa raiz
2. Atualizar RLS policies se violação de isolamento
3. Rotacionar todas as chaves criptográficas comprometidas (Ed25519, HMAC)
4. Atualizar agent releases com patches
5. Verificar integridade de todos os registros de auditoria (hash encadeado)
6. Validar que nenhum backdoor persiste

**Validação:**
- [ ] Causa raiz identificada e documentada
- [ ] Vetor de ataque eliminado
- [ ] Chaves e credenciais rotacionadas
- [ ] Integridade de logs verificada
- [ ] Testes de penetração focados executados

### 4.4 Fase 4: Recuperação (4-48 horas)

**Ações:**
1. Restaurar serviços para operação normal
2. Monitoramento intensificado por 72 horas
3. Verificar dados restaurados contra backups
4. Reativar agentes em quarentena após validação
5. Confirmar isolamento de tenant restaurado

**Critérios de Saída:**
- [ ] Todos os serviços operacionais
- [ ] Nenhum indicador de comprometimento (IoC) ativo
- [ ] Monitoramento intensificado ativo
- [ ] Clientes afetados notificados

### 4.5 Fase 5: Lições Aprendidas (até 7 dias após)

**Post-Mortem Obrigatório:**
1. Timeline completa do incidente
2. O que funcionou e o que falhou
3. Gaps identificados nos controles
4. Ações corretivas com responsáveis e prazos
5. Atualização de playbooks e runbooks
6. Treinamento adicional se necessário

---

## 5. Playbooks

### Playbook A: Data Breach (Violação de Dados Pessoais)

```
TRIGGER: Acesso não autorizado a dados pessoais confirmado

1. CONTER
   - Revogar acessos comprometidos
   - Isolar sistemas afetados
   - Preservar evidências (snapshot de logs)

2. AVALIAR IMPACTO LGPD
   - Quais dados pessoais foram afetados?
   - Quantos titulares?
   - Risco aos titulares (alto/moderado/baixo)?

3. NOTIFICAR (se risco alto)
   - ANPD: em até 2 dias úteis (Art. 48)
   - Titulares afetados: sem demora injustificada
   - Conteúdo: natureza, dados afetados, medidas, contato DPO

4. REMEDIAR
   - Corrigir vulnerabilidade explorada
   - Rotacionar credenciais afetadas
   - Intensificar monitoramento

5. DOCUMENTAR
   - Registro completo para compliance
   - Post-mortem com ações corretivas
```

### Playbook C: Supply Chain Attack

```
TRIGGER: Assinatura Ed25519 inválida OU hash SHA256 divergente em release

1. CONTER IMEDIATAMENTE
   - Ativar circuit breaker global
   - Pausar ALL releases e force_updates
   - Bloquear endpoint serve-installer

2. VERIFICAR EXTENSÃO
   - Quantos agentes receberam a versão comprometida?
   - Verificar agent_releases para adulteração
   - Comparar hashes do GitHub Actions vs banco de dados

3. ROLLBACK
   - Identificar última versão confiável (assinatura válida)
   - Forçar update para versão segura
   - Revogar assinatura da versão comprometida

4. ERRADICAR
   - Auditar pipeline CI/CD completo
   - Rotacionar chave Ed25519 (nova keypair)
   - Verificar integridade de todos os scripts armazenados

5. COMUNICAR
   - Notificar todos os MSPs afetados
   - Publicar advisory de segurança
```

### Playbook D: Tenant Isolation Breach

```
TRIGGER: Dados de tenant A acessíveis por tenant B

1. CONTER
   - Suspender TODAS as sessões ativas
   - Desabilitar queries públicas
   - Ativar modo de manutenção

2. INVESTIGAR
   - Verificar RLS policies em todas as tabelas
   - Auditar views (security_invoker, security_barrier)
   - Verificar RPCs SECURITY DEFINER
   - Revisar logs de security_logs para cross-tenant attempts

3. CORRIGIR
   - Aplicar RLS fix via migração emergencial
   - Executar assert_rls_hardening.sql
   - Validar com testes de isolamento

4. VERIFICAR
   - Executar suite completa de testes de tenant isolation
   - Confirmar que nenhum dado vazou
   - Auditoria forense dos acessos

5. NOTIFICAR
   - Tenants afetados (obrigatório)
   - ANPD se dados pessoais envolvidos
```

---

## 6. Comunicação Durante Incidentes

### 6.1 Comunicação Interna

| Audiência | Canal | Frequência |
|-----------|-------|-----------|
| CSIRT | Slack/Teams #incident-response | Tempo real |
| Liderança | Email + briefing | A cada 2 horas (P0/P1) |
| Engineering | Canal interno | Conforme necessidade |

### 6.2 Comunicação Externa

| Audiência | Canal | Timing | Responsável |
|-----------|-------|--------|-------------|
| MSPs afetados | Email + Dashboard notification | Após contenção inicial | CS Lead |
| ANPD | Portal ANPD | Até 2 dias úteis (data breach) | DPO |
| Titulares | Email direto | Sem demora injustificada | DPO |
| Público | Status page | Se serviço público afetado | Comunicação |

### 6.3 Templates de Comunicação

**Template: Notificação Inicial ao MSP**
```
Assunto: [CyberShield] Incidente de Segurança - Atualização #1

Prezado(a) [Nome],

Identificamos um incidente de segurança em [data/hora] que pode ter 
afetado [descrição geral]. 

Status: [Contido/Em investigação/Resolvido]
Impacto: [Descrição do impacto no MSP]
Ações tomadas: [Resumo das ações]
Próximos passos: [O que será feito]

Manteremos atualizações a cada [frequência].

Equipe de Segurança CyberShield
```

---

## 7. Ferramentas e Recursos

| Ferramenta | Uso |
|-----------|-----|
| `security_logs` | Registro de eventos de segurança |
| `audit_logs` | Trilha de auditoria imutável |
| `ip_blocklist` | Bloqueio de IPs maliciosos |
| Circuit Breaker (`check_global_circuit_breaker`) | Pausa automática de automação |
| `assert_rls_hardening.sql` | Validação de RLS pós-incidente |
| Break Glass Procedure | Acesso emergencial com auditoria total |

---

## 8. Exercícios e Testes

### 8.1 Tabletop Exercises
- Frequência: Trimestral
- Cenários: Rodízio entre playbooks A-G
- Participantes: CSIRT completo

### 8.2 Simulações Técnicas
- Frequência: Semestral
- Escopo: Teste de contenção e recuperação em ambiente controlado
- Métricas: MTTD (Mean Time to Detect), MTTR (Mean Time to Respond)

### 8.3 Métricas de Performance

| Métrica | Meta P0 | Meta P1 | Meta P2 |
|---------|---------|---------|---------|
| MTTD (Detecção) | < 5 min | < 15 min | < 4h |
| MTTR (Resposta) | < 15 min | < 30 min | < 4h |
| MTTC (Contenção) | < 1h | < 4h | < 24h |
| MTTR (Resolução) | < 4h | < 8h | < 48h |

---

## 9. Integração com Políticas

| Documento | Integração |
|-----------|-----------|
| Política de Resposta a Incidentes (IRP-004) | Política mãe — PRI é o plano tático |
| Break Glass Procedure | Acesso emergencial durante P0 |
| Política de Privacidade (PDP-001) | Notificação ANPD/titulares |
| Política de Logging (LMP-005) | Fontes de detecção |
| Disaster Recovery Plan | Recuperação de infraestrutura |

---

## Histórico do Documento

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2025-01-01 | CyberShield Security Team | Versão inicial com 7 playbooks |
