

## Plano: Forcar Atualizacao da Frota + Corrigir Associacao de Tenant

### Problema Identificado

Os agentes nas versoes v4.x e v5.0.1/v5.0.2 **nao possuem codigo para processar** o campo `force_update` que o backend envia no response do heartbeat. Isso significa que mesmo com `force_update_version` setado, esses agentes **ignoram** o comando e continuam rodando a versao antiga. A reinstalacao preservada tambem pode falhar silenciosamente em agentes v4.x.

Sobre `genialcred@gmail.com`: o usuario **esta associado** ao tenant "Genial Cred" com role `admin` na tabela `user_roles`. Se ele nao consegue ver o tenant no dashboard, o problema esta no fluxo de claims/JWT, nao na associacao.

### Solucao em 2 Partes

---

### Parte 1: Corrigir o heartbeat para limpar `force_update_version` apos entrega

Atualmente o backend envia o force_update em **todo heartbeat** infinitamente, pois nunca limpa o flag. Precisamos:

1. **Apos enviar force_update no heartbeat**: marcar `force_update_delivered_at` no banco
2. **Apos N entregas sem sucesso (agente nao atualiza versao)**: logar que o agente nao suporta auto-update e limpar o flag para parar o loop

Isso evita que o backend fique enviando payloads de ~250KB em cada heartbeat para agentes que nunca vao processar.

---

### Parte 2: Criar edge function `force-reinstall-fleet` para reinstalacao em massa

Como agentes antigos nao processam force_update, a unica solucao real e a **reinstalacao nuclear remota**. Porem, isso requer acesso fisico ou RMM.

Para facilitar, vamos:

1. **Criar uma nova edge function `force-reinstall-fleet`** que:
   - Recebe `tenant_id` e opcionalmente lista de `agent_ids`
   - Gera os comandos PowerShell de reinstalacao nuclear prontos para copiar/colar
   - Usa a enrollment key ativa do tenant automaticamente
   - Retorna um script "batch" que pode ser distribuido via RMM/GPO

2. **Adicionar no dashboard um botao "Reinstalacao Forcada"** na pagina de Version Sync que:
   - Mostra os agentes stuck (com force_update_version mas versao antiga)
   - Gera o comando PowerShell nuclear com 1 clique
   - Inclui instrucoes claras para o operador

---

### Parte 3: Limpar o estado stuck atual

Apos deploy, executar limpeza:
- Limpar `force_update_version` dos agentes que ja estao em v5.0.3 (redundante)
- Manter `force_update_version` nos que realmente precisam, mas adicionar tracking de entregas

---

### Detalhes Tecnicos

**Arquivos a modificar:**
- `supabase/functions/heartbeat/index.ts` — adicionar logica de tracking de entregas e auto-limpeza do force_update apos X tentativas
- `src/components/admin/AgentVersionSync.tsx` — adicionar secao de "agentes stuck" com botao de reinstalacao nuclear e comando pronto

**Arquivos a criar:**
- `supabase/functions/force-reinstall-fleet/index.ts` — edge function que gera comandos de reinstalacao em massa

**Migracao SQL:**
- Adicionar coluna `force_update_delivered_count` e `force_update_first_delivered_at` na tabela `agents`

**Fluxo:**

```text
Heartbeat chega
  |
  v
force_update_version setado?
  |--- Nao --> Response normal
  |--- Sim --> Agente ja esta nessa versao?
                  |--- Sim --> Limpar flag, response normal
                  |--- Nao --> Incrementar delivered_count
                                |--- count > 50? --> Logar "agente nao suporta", limpar flag
                                |--- count <= 50 --> Enviar force_update no response
```

