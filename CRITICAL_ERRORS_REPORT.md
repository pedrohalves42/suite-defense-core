# Relatório de Erros Críticos - CyberShield
**Data:** 2025-11-11  
**Análise Completa do Sistema**

---

## 🔴 ERROS CRÍTICOS IDENTIFICADOS

### 1. **BUG CRÍTICO: Authentication de Métricas do Sistema**
**Arquivo:** `supabase/functions/submit-system-metrics/index.ts` (Linha 48)  
**Severidade:** 🔴 CRÍTICA

**Problema:**
```typescript
// ERRADO - Linha 48
.eq('agent_name', agentToken)
```

O código está comparando `agent_name` com o `agentToken`, mas deveria buscar o agente através da tabela `agent_tokens` usando o token UUID.

**Impacto:**
- ❌ Nenhum agente consegue enviar métricas do sistema
- ❌ Dashboard de monitoramento não recebe dados
- ❌ Alertas de CPU/RAM/Disco não funcionam
- ❌ Sistema de monitoramento completamente quebrado

**Solução:**
```typescript
// CORRETO - Buscar através da tabela agent_tokens
const { data: tokenData } = await supabase
  .from('agent_tokens')
  .select('agent_id, agents(id, agent_name, tenant_id, hmac_secret)')
  .eq('token', agentToken)
  .eq('is_active', true)
  .single();

if (!tokenData || !tokenData.agents) {
  return new Response(JSON.stringify({ error: 'Invalid agent token' }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const agent = tokenData.agents;
```

---

### 2. **ERRO CRÍTICO: Enrollment Agent - Validação Falhando**
**Arquivo:** `supabase/functions/enroll-agent/index.ts`  
**Severidade:** 🔴 CRÍTICA

**Problema:**
Os logs mostram múltiplos erros de validação Zod:
```
enrollmentKey: "undefined"
agentName: formato inválido
```

**Causas Raiz:**
1. Scripts de instalação gerados em `AgentInstaller.tsx` não estão enviando corretamente os parâmetros para `enroll-agent`
2. Scripts inline são diferentes dos scripts oficiais em `agent-scripts/`
3. Falta sincronização entre os geradores de script e os scripts oficiais

**Impacto:**
- ❌ Agentes não conseguem se registrar
- ❌ Instalação de novos agentes falha silenciosamente
- ❌ Usuários não conseguem adicionar dispositivos ao sistema

---

### 3. **ERRO CRÍTICO: Dessincronia de Scripts**
**Arquivo:** `src/pages/AgentInstaller.tsx`  
**Severidade:** 🔴 CRÍTICA

**Problema:**
O `AgentInstaller.tsx` gera scripts de instalação inline (linhas 148-411) que são diferentes dos scripts oficiais:
- `agent-scripts/cybershield-agent-windows.ps1` (não usado)
- `agent-scripts/cybershield-agent-linux.sh` (não usado)

**Impacto:**
- ❌ Scripts gerados podem estar desatualizados
- ❌ Correções nos scripts oficiais não refletem nos instaladores
- ❌ Manutenção duplicada e propensa a erros
- ❌ Inconsistências entre Windows e Linux

---

### 4. **ERRO DE SEGURANÇA: Múltiplas Falhas de Login**
**Fonte:** Auth Logs  
**Severidade:** 🟡 ALTA

**Problema:**
Logs mostram 80+ tentativas de login falhadas do IP `145.132.100.182` e `52.173.237.213`:
```
400: Invalid login credentials (80+ ocorrências)
```

**Impacto:**
- ⚠️ Possível ataque de força bruta
- ⚠️ Sistema de CAPTCHA não está sendo acionado
- ⚠️ Rate limiting pode não estar funcionando corretamente

---

### 5. **PROBLEMAS DE SEGURANÇA (Database Linter)**
**Fonte:** Supabase Linter  
**Severidade:** 🟡 ALTA

**Problemas Identificados:**

#### a) RLS Habilitado Sem Policies
- Tabelas com RLS ativado mas sem políticas definidas
- Dados podem estar inacessíveis ou expostos indevidamente

#### b) Extensões no Schema Public
- Extensões instaladas no schema `public` ao invés de schema separado
- Risco de segurança e conflitos

#### c) Proteção Contra Senhas Vazadas Desabilitada
- Sistema não valida senhas contra base de dados de senhas comprometidas
- Usuários podem usar senhas conhecidamente inseguras

---

### 6. **ERRO DE ARQUITETURA: Scripts Não Estão Sincronizados**
**Severidade:** 🟡 ALTA

**Problema:**
Os scripts gerados no frontend estão hardcoded e não utilizam os scripts oficiais da pasta `agent-scripts/`:

**Scripts Oficiais (não usados):**
- `agent-scripts/cybershield-agent-windows.ps1` (1013 linhas)
- `agent-scripts/cybershield-agent-linux.sh` (700 linhas)

**Scripts Inline (usados):**
- `AgentInstaller.tsx` (linhas 148-411 para Linux)
- `AgentInstaller.tsx` (linhas 413-1547 para Windows)

---

### 7. **AUSÊNCIA DE VALIDAÇÃO DE INTEGRIDADE**
**Severidade:** 🟡 MÉDIA

**Problema:**
- Não há checksum/hash dos scripts gerados
- Não há validação de integridade após download
- Scripts podem ser modificados sem detecção

---

## 📋 PLANO DE AÇÃO DETALHADO

### **FASE 1: CORREÇÕES CRÍTICAS (PRIORIDADE MÁXIMA)**

#### ✅ **Ação 1.1: Corrigir Authentication de Métricas**
**Arquivo:** `supabase/functions/submit-system-metrics/index.ts`

**Passos:**
1. Substituir busca por agent_name por busca via agent_tokens
2. Implementar join correto com tabela agents
3. Validar que token está ativo e não expirado
4. Adicionar logs detalhados para debugging

**Tempo Estimado:** 30 minutos  
**Risco:** Baixo  
**Teste:** Enviar métricas de teste e validar no banco

---

#### ✅ **Ação 1.2: Corrigir Enrollment de Agentes**
**Arquivos:** 
- `supabase/functions/enroll-agent/index.ts`
- `agent-scripts/cybershield-agent-windows.ps1`
- `agent-scripts/cybershield-agent-linux.sh`

**Passos:**
1. Adicionar logging extensivo no enroll-agent para identificar exatamente onde os dados estão sendo perdidos
2. Validar formato dos dados enviados pelos scripts
3. Verificar se HMAC está sendo gerado corretamente
4. Testar enrollment com dados mockados primeiro

**Tempo Estimado:** 1-2 horas  
**Risco:** Médio  
**Teste:** Executar script de enrollment em ambiente de teste

---

#### ✅ **Ação 1.3: Refatorar Geração de Scripts**
**Arquivo:** `src/pages/AgentInstaller.tsx`

**Arquitetura Nova:**
```
agent-scripts/               (Scripts oficiais - fonte da verdade)
  ├── cybershield-agent-windows.ps1
  └── cybershield-agent-linux.sh

public/templates/            (Templates para substituição)
  ├── install-windows.ps1
  └── install-linux.sh

src/pages/AgentInstaller.tsx (Usa templates, faz substituição de vars)
```

**Passos:**
1. Mover scripts oficiais para serem templates
2. Criar função que lê templates e substitui variáveis
3. Remover código inline de geração de scripts
4. Adicionar validação de integridade (SHA256)
5. Gerar hash do script junto com o download

**Tempo Estimado:** 3-4 horas  
**Risco:** Médio-Alto  
**Teste:** Gerar scripts e validar hash + executar em VMs

---

### **FASE 2: CORREÇÕES DE SEGURANÇA**

#### ✅ **Ação 2.1: Implementar Rate Limiting Efetivo para Login**
**Arquivos:**
- `src/pages/Login.tsx`
- `supabase/functions/record-failed-login/index.ts`

**Passos:**
1. Verificar se `record-failed-login` está sendo chamado corretamente
2. Implementar CAPTCHA após 3 tentativas falhadas
3. Bloquear IP após 5 tentativas por 30 minutos
4. Adicionar logging de ataques de força bruta

**Tempo Estimado:** 2 horas  
**Risco:** Baixo

---

#### ✅ **Ação 2.2: Corrigir Problemas de RLS**
**Arquivos:** Migration SQL

**Passos:**
1. Identificar tabelas sem policies (via linter)
2. Criar policies apropriadas para cada tabela
3. Validar que admin/super_admin tem acesso correto
4. Testar com usuários de diferentes roles

**Tempo Estimado:** 1-2 horas  
**Risco:** Alto (pode quebrar acesso existente)

---

#### ✅ **Ação 2.3: Habilitar Proteção de Senhas Vazadas**
**Arquivo:** Supabase Auth Config

**Passos:**
1. Ativar leaked password protection no Supabase Auth
2. Forçar reset de senhas comprometidas
3. Notificar usuários afetados

**Tempo Estimado:** 30 minutos  
**Risco:** Baixo

---

### **FASE 3: MELHORIAS DE ARQUITETURA**

#### ✅ **Ação 3.1: Criar Sistema de Versionamento de Scripts**
**Arquivos:** Novos

**Estrutura:**
```
agent-scripts/
  ├── versions/
  │   ├── v2.0.0/
  │   │   ├── windows.ps1
  │   │   └── linux.sh
  │   └── v2.1.0/
  │       ├── windows.ps1
  │       └── linux.sh
  ├── checksums.json
  └── CHANGELOG.md
```

**Tempo Estimado:** 2 horas

---

#### ✅ **Ação 3.2: Implementar Testes E2E de Instalação**
**Arquivos:**
- `e2e/agent-installation.spec.ts` (expandir)
- `e2e/linux-agent-installation.spec.ts` (expandir)

**Testes a Adicionar:**
1. Teste de enrollment completo (gerar + instalar + heartbeat)
2. Teste de métricas (envio + recepção + alertas)
3. Teste de jobs (criar + poll + executar + ack)
4. Teste de reconexão após falha
5. Teste de atualização de credenciais

**Tempo Estimado:** 4-6 horas

---

#### ✅ **Ação 3.3: Dashboard de Saúde do Sistema**
**Arquivo:** Novo - `src/pages/admin/SystemHealth.tsx`

**Features:**
- Status de todos os edge functions
- Métricas de rate limiting
- Alertas de segurança em tempo real
- Monitoramento de enrollment/heartbeat
- Gráficos de performance

**Tempo Estimado:** 4-6 horas

---

## 🧪 PLANO DE TESTES

### **Testes Obrigatórios Antes de Deploy:**

1. **Teste de Métricas do Sistema**
   - [ ] Agente Windows envia métricas
   - [ ] Agente Linux envia métricas
   - [ ] Alertas são gerados corretamente
   - [ ] Dashboard exibe dados em tempo real

2. **Teste de Enrollment**
   - [ ] Gerar credenciais via auto-generate-enrollment
   - [ ] Instalar agente Windows com credenciais
   - [ ] Instalar agente Linux com credenciais
   - [ ] Validar heartbeat após instalação
   - [ ] Validar que agente aparece no dashboard

3. **Teste de Jobs**
   - [ ] Criar job para agente
   - [ ] Agente recebe job via poll
   - [ ] Agente executa job
   - [ ] Agente faz ACK do job
   - [ ] Job marcado como concluído

4. **Teste de Segurança**
   - [ ] Rate limiting funciona
   - [ ] CAPTCHA aparece após 3 falhas
   - [ ] IP bloqueado após 5 falhas
   - [ ] RLS policies bloqueiam acesso indevido

5. **Teste E2E Completo**
   - [ ] Executar `npx playwright test`
   - [ ] Todos os testes passam
   - [ ] Nenhum erro crítico nos logs

---

## ⚠️ RISCOS IDENTIFICADOS

1. **Risco Alto:** Mudanças no authentication podem quebrar agentes em produção
   - **Mitigação:** Deploy gradual, manter versão antiga funcionando temporariamente

2. **Risco Médio:** Refatoração de scripts pode introduzir novos bugs
   - **Mitigação:** Testes extensivos em VMs limpas antes de deploy

3. **Risco Médio:** Mudanças em RLS podem bloquear usuários existentes
   - **Mitigação:** Testar com todos os roles antes de aplicar

4. **Risco Baixo:** Performance pode degradar com validações extras
   - **Mitigação:** Adicionar índices no banco, otimizar queries

---

## 📊 MÉTRICAS DE SUCESSO

- [ ] 0 erros no `enroll-agent` edge function
- [ ] 100% dos agentes enviando métricas com sucesso
- [ ] Todos os testes E2E passando
- [ ] 0 problemas críticos no Supabase Linter
- [ ] Tempo de resposta < 500ms em todos os endpoints
- [ ] Rate limiting bloqueando 100% dos ataques de força bruta

---

## 🚀 CRONOGRAMA RECOMENDADO

**Dia 1 (Hoje):**
- ✅ Ação 1.1: Corrigir Authentication de Métricas (30 min)
- ✅ Ação 1.2: Corrigir Enrollment de Agentes (2h)
- ✅ Ação 2.1: Rate Limiting de Login (2h)

**Dia 2:**
- ✅ Ação 1.3: Refatorar Geração de Scripts (4h)
- ✅ Ação 2.2: Corrigir RLS (2h)

**Dia 3:**
- ✅ Ação 2.3: Proteção de Senhas (30 min)
- ✅ Ação 3.2: Testes E2E Expandidos (4h)

**Dia 4:**
- ✅ Ação 3.1: Versionamento de Scripts (2h)
- ✅ Ação 3.3: Dashboard de Saúde (4h)

**Dia 5:**
- ✅ Testes finais completos
- ✅ Deploy para produção

---

## 📝 PRÓXIMOS PASSOS IMEDIATOS

1. **AGORA:** Corrigir bug crítico de autenticação de métricas
2. **EM SEGUIDA:** Corrigir enrollment de agentes
3. **DEPOIS:** Implementar rate limiting efetivo
4. **FINALMENTE:** Refatorar sistema de geração de scripts

---

**Relatório gerado automaticamente**  
**Última atualização:** 2025-11-11
