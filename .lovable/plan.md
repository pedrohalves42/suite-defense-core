## Problema
`feature-flags.ts` retorna `true` (fail-open) quando o RPC falha, habilitando automações destrutivas (honeypot, SOAR, remediação) por padrão em caso de erro.

## Plano

### 1. Edge Function: `_shared/feature-flags.ts`
- Adicionar parâmetro `defaultValue` (default: `true` para backward compat)
- Kill switches usam `defaultValue: false` (fail-closed)
- Documentar padrão claramente

### 2. Todos os consumidores de kill switches
- `honeypot-handler/index.ts` → `isFeatureEnabled(..., { defaultOnError: false })`
- `_shared/honeypot/agent-handler.ts` → idem
- Qualquer outro consumidor de flags de segurança

### 3. Frontend: `useTenantFeatures.tsx`
- Já é seguro (retorna `false` por padrão) — sem mudança necessária

### 4. Validação
- Verificar sintaxe de todos os arquivos alterados
