
## Corrigir Comando de Reinstalacao Nuclear (2 problemas)

### Problema 1: URL incorreta - EK como query param em vez de path

O comando gerado coloca a enrollment key como `?ek=CHAVE`, mas a funcao `serve-installer` espera a chave no **path** da URL (`/serve-installer/CHAVE`). Com a EK no query param, o pathname fica `/serve-installer`, que bate com o health check da linha 97, retornando JSON em vez do script PowerShell.

**Resultado:** PowerShell recebe `@{status=healthy; timestamp=...}` e gera ParseException.

### Problema 2: Enrollment keys sem `agent_id`

As chaves geradas pelo `force-reinstall-fleet` nao incluem `agent_id`. A funcao `serve-installer` exige `agent_id` na linha 263 e rejeita chaves sem ele ("Agent not linked to enrollment key").

Para reinstalacao nuclear, a funcao precisa suportar chaves de registro generico (sem `agent_id` pre-definido), criando um novo agente automaticamente.

---

### Solucao

#### 1. Atualizar `serve-installer` para suportar enrollment keys sem agent_id

Quando `agent_id` e NULL na enrollment key, a funcao deve:
- Criar um novo agente usando o hostname fornecido (query param `hostname`) ou gerar um nome automatico
- Gerar novas credenciais (token + HMAC)
- Registrar o agente no banco
- Continuar o fluxo normal de geracao do instalador

Isso transforma a enrollment key em uma "chave de registro aberta" para o tenant.

#### 2. Atualizar `force-reinstall-fleet` para gerar comando com formato correto

Corrigir o `nuclear_reinstall_command` retornado pela funcao `generate-key` para usar o formato de path:
```text
/functions/v1/serve-installer/CHAVE-AQUI
```
em vez de:
```text
/functions/v1/serve-installer?ek=CHAVE-AQUI
```

#### 3. Comandos corrigidos para uso imediato

Apos a correcao, os comandos para os agentes stuck serao:

**Pedro Alves (7 agentes):**
```text
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm "https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/serve-installer/APGO-TVEK-BOP5-8YGG" | iex
```

**Genial Cred:**
```text
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm "https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/serve-installer/VEB1-IWTU-FNX4-UL33" | iex
```

---

### Detalhes Tecnicos da Alteracao em `serve-installer`

No bloco onde `enrollmentData.agent_id` e NULL (linha 263), em vez de rejeitar:

1. Extrair hostname do query param ou gerar automatico (`agent-XXXXX`)
2. Gerar `hmac_secret` (64 chars hex via crypto.getRandomValues)
3. Inserir novo agente na tabela `agents` com tenant_id da enrollment key
4. Gerar token e hash como ja feito no fluxo existente
5. Continuar com o fluxo normal de geracao de script

Isso mantem a seguranca (a chave ainda e validada por hash, rate-limited, e com prazo de expiracao) enquanto permite registros em massa sem pre-cadastro individual de agentes.

### Arquivos a alterar

1. `supabase/functions/serve-installer/index.ts` -- adicionar logica de criacao de agente quando agent_id e NULL
2. `supabase/functions/force-reinstall-fleet/index.ts` -- corrigir formato do comando no `nuclear_reinstall_command`

### Resultado esperado

- Comando PowerShell funciona sem ParseException
- Novos agentes sao criados automaticamente no tenant correto
- Dashboard mostra os agentes recem-instalados
- Chaves de enrollment funcionam para multiplas maquinas (ate o limite de 100 usos)
