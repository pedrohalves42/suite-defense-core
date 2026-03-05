# 📖 Guia de Linguagem CyberShield

## 🎯 Princípio Central

> **O sistema nunca pressupõe conhecimento técnico do usuário.**

A UI sempre responde três perguntas:
1. **O que aconteceu?**
2. **É problema?**
3. **Preciso agir?**

---

## 🚫 Palavras Proibidas

| ❌ Proibido | ✅ Use em vez |
|-------------|---------------|
| Agent | Computador |
| Endpoint | Computador |
| Job | Verificação |
| Task | Tarefa |
| Red Team | Teste de resistência |
| Safe Mode | Modo de proteção |
| Isolation | Isolamento de segurança |
| Throttle | Limitação temporária |
| AI Insight | Aviso inteligente |
| AI Action | Ação automática |
| Confidence Gap | Nível de confiança |
| Audit Log | Histórico de segurança |
| Trigger | Ativação |
| Policy | Política |
| Deploy | Instalar |
| Rollback | Reverter |

---

## 📝 Estrutura de Frases

### Regra de Ouro
**Verbo primeiro → Efeito depois → Nunca mecanismo**

### ❌ Errado (técnico disfarçado)
- "A verificação falhou no computador"
- "O job retornou erro de timeout"
- "Endpoint não respondeu ao heartbeat"

### ✅ Correto (humano)
- "Não foi possível verificar este computador agora."
- "A verificação demorou mais que o esperado."
- "Este computador está desconectado."

---

## 🏗️ Arquitetura de Linguagem

### Arquivo Central
```
src/lib/ui-language.ts
```

### Funções Disponíveis

| Função | Uso | Exemplo |
|--------|-----|---------|
| `t(key)` | Termo do dicionário | `t('agent')` → "computador" |
| `menu(key)` | Label de menu | `menu('dashboard')` → "Painel Principal" |
| `section(key)` | Seção de menu | `section('security')` → "Segurança" |
| `sentence(key)` | Frase completa | `sentence('computerOk')` → "Este computador está protegido." |

### Tipagem Estrita
Todas as funções são tipadas. Usar uma chave inexistente gera erro de TypeScript:

```typescript
t('agent')        // ✅ OK
t('agente')       // ❌ Erro de TS - chave não existe
```

---

## ✅ Checklist de PR

Antes de aprovar qualquer PR com texto visível ao usuário:

- [ ] Nenhuma palavra da lista proibida aparece
- [ ] Textos usam funções `t()`, `menu()`, `section()`, `sentence()`
- [ ] Frases seguem estrutura: verbo → efeito → sem mecanismo
- [ ] Mensagens de erro são acionáveis ("tente novamente", "entre em contato")
- [ ] Tooltips explicam o "porquê", não o "como"

---

## 🔄 Toggle Técnico vs Humano

### Comportamento
- **Padrão**: Modo humano (linguagem acessível)
- **Opcional**: Admins podem ativar modo técnico
- **Persistência**: localStorage

### Uso em Componentes
```typescript
import { useLanguageMode } from '@/hooks/useLanguageMode';

function MyComponent() {
  const { showTechnical } = useLanguageMode();
  
  return (
    <span>
      {showTechnical ? 'Agent' : t('agent')}
    </span>
  );
}
```

---

## 📊 Categorias de Texto

### 1. Status (Cards e Badges)
- Sempre positivo primeiro: "Protegido" > "Sem problemas"
- Cores semânticas: verde = ok, amarelo = atenção, vermelho = ação

### 2. Ações (Botões)
- Verbos no infinitivo: "Aprovar", "Reverter", "Verificar"
- Nunca técnico: "Submit", "Execute", "Deploy"

### 3. Orientação (Descrições)
- Sempre dizer o que o usuário GANHA
- Nunca explicar implementação

### 4. Erros (Mensagens)
- O que aconteceu (1 frase)
- O que fazer (1 frase)
- Nunca stack trace ou código de erro

---

## 🎨 Tom de Voz

| Situação | Tom |
|----------|-----|
| Sucesso | Confiante, breve |
| Atenção | Calmo, orientador |
| Erro | Empático, solucionador |
| Ação automática | Transparente, reversível |

### Exemplos por Tom

**Sucesso:**
> "Seu ambiente está protegido."

**Atenção:**
> "Identificamos comportamentos incomuns. O sistema já tomou medidas preventivas."

**Erro:**
> "Não foi possível completar a verificação. Tente novamente em alguns minutos."

**Ação automática:**
> "O sistema bloqueou um acesso suspeito. Você pode revisar essa decisão."

---

## 🔐 Governança

1. **Este guia é LEI** - Nenhum texto novo sem seguir estas regras
2. **ui-language.ts é fonte de verdade** - Nunca hardcode strings
3. **PR Review obrigatório** - Checklist acima deve ser verificado
4. **Atualizações** - Novos termos devem ser adicionados ao dicionário primeiro

---

*Última atualização: Dezembro 2024*
