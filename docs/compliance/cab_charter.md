# CAB Charter — Change Advisory Board

| Campo | Valor |
|-------|-------|
| **Código** | CAB-001 |
| **Versão** | 1.0 |

---

## 1. Objetivo

Formalizar o processo de avaliação e aprovação de mudanças significativas na plataforma CyberShield.

---

## 2. Composição

| Papel | Responsável | Voto |
|-------|-------------|:----:|
| CTO (Chair) | Líder técnico | ✅ |
| CISO | Segurança | ✅ |
| DevOps Lead | Infraestrutura | ✅ |
| Product Lead | Impacto ao cliente | ✅ |
| Engineering Lead | Viabilidade técnica | ✅ |

**Quórum mínimo:** 3 membros (incluindo CTO ou CISO)

---

## 3. Classificação de Mudanças

| Tipo | Exemplos | Aprovação |
|------|----------|-----------|
| **Standard** | Bug fix, atualização de dependência menor | Automática (CI/CD) |
| **Normal** | Nova feature, mudança de schema, nova Edge Function | CAB (maioria simples) |
| **Emergency** | Hotfix de segurança P0, patch de vulnerabilidade crítica | CTO + CISO (pode ser retroativa) |
| **Major** | Mudança de arquitetura, migração de infraestrutura | CAB unanimidade |

---

## 4. Processo

### 4.1 Mudança Normal
```
1. RFC (Request for Change) criado pelo solicitante
2. ADR documentado (se arquitetural)
3. Revisão pelo CAB na reunião semanal
4. Votação (maioria simples)
5. Implementação + code review
6. Deploy em staging → testes
7. Deploy em produção
8. Post-implementation review
```

### 4.2 Mudança Emergency
```
1. Identificação do problema (P0/P1)
2. Aprovação verbal CTO + CISO
3. Implementação imediata
4. Documentação retroativa (RFC + ADR)
5. Post-mortem em 48h
```

---

## 5. Critérios de Avaliação

| Critério | Peso |
|----------|:----:|
| Impacto na segurança (RLS, criptografia, auth) | Alto |
| Impacto na disponibilidade (SLA) | Alto |
| Impacto nos dados (schema, migrations) | Alto |
| Reversibilidade (pode fazer rollback?) | Médio |
| Impacto no cliente (breaking changes) | Médio |
| Complexidade técnica | Baixo |

---

## 6. Reuniões

- **Frequência:** Semanal (terças, 10:00 BRT)
- **Duração:** 30-60 minutos
- **Formato:** Revisão de RFCs pendentes + status de mudanças em andamento
- **Ata:** Registrada e arquivada

---

## 7. Registro

Todas as decisões do CAB são registradas em `audit_logs` com:
- ID da mudança
- Decisão (aprovado/rejeitado/adiado)
- Justificativa
- Votantes

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2025-01-01 | CyberShield Engineering | Versão inicial |
