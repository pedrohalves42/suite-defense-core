
## Gerar Novas Enrollment Keys para Pedro Alves e Genial Cred

### O que sera feito

Gerar 2 novas enrollment keys (uma por tenant) com validade de 30 dias e 100 usos cada. As chaves serao geradas via migracao SQL usando a mesma logica de hash SHA-256 usada pelo sistema.

**Importante:** Como as chaves sao armazenadas apenas como hash no banco (SEC-001), o valor em texto puro so aparece **uma vez** -- no output da migracao. Voce precisara anotar as chaves geradas.

### Tenant IDs

| Tenant | ID |
|--------|-----|
| Pedro Alves | `3adc67e6-8908-4d98-b85b-5e93be4673a1` |
| Genial Cred | `2584d2cd-8b99-4ca7-a8e2-b61256e82b3e` |

### Abordagem Tecnica

Como o hash SHA-256 nao pode ser feito puramente em SQL de forma simples, vamos usar a edge function `generate-enrollment-key` existente chamando-a diretamente para cada tenant. Porem, como isso requer JWT de usuario autenticado, a alternativa mais pratica e:

1. **Criar uma edge function temporaria `admin-generate-keys`** que aceita service role e gera chaves para tenants especificos
2. **OU** usar a funcao `auto-renew-enrollment-keys` ja existente -- mas ela nao retorna o valor em texto puro

**Melhor abordagem:** Criar as chaves diretamente na edge function `force-reinstall-fleet` que ja existe, adicionando um modo `generate-key` que:
- Gera uma chave criptograficamente segura (XXXX-XXXX-XXXX-XXXX)
- Calcula o hash SHA-256
- Insere no banco com 30 dias de validade e 100 usos
- Retorna o valor em texto puro (visibilidade unica)

### Implementacao

**Modificar `supabase/functions/force-reinstall-fleet/index.ts`:**
- Adicionar um modo `action: "generate-key"` que aceita `tenant_id`
- Gera a chave, insere hash no banco, retorna texto puro
- Requer autenticacao (admin/operator/super_admin)

**Apos deploy, chamar a funcao 2 vezes:**
1. Para Pedro Alves: `{ "action": "generate-key", "tenant_id": "3adc67e6-..." }`
2. Para Genial Cred: `{ "action": "generate-key", "tenant_id": "2584d2cd-..." }`

### Comandos de Reinstalacao

Com as novas chaves geradas, o comando de reinstalacao nuclear para cada maquina sera:

```text
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ek="CHAVE-AQUI"; irm "https://<url>/functions/v1/serve-installer?ek=$ek&platform=windows" | iex
```

Este comando faz instalacao limpa (nao preservada) -- substitui completamente o agente, gerando novas credenciais. Use apenas como fallback se a reinstalacao preservada falhar.

### Resultado Esperado

- 2 novas enrollment keys ativas (30 dias, 100 usos cada)
- Chaves em texto puro fornecidas para uso imediato
- Comandos PowerShell prontos para reinstalacao nuclear dos 7 agentes stuck
