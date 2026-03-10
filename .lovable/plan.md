

# Plano: Configurar API Key do Abuse.ch

## O que será feito

1. **Armazenar o secret `ABUSE_CH_API_KEY`** com o valor fornecido (`80c688c5...`) de forma segura no backend
2. **Atualizar a Edge Function `sync-threat-feeds`** para usar a API key autenticada nos requests JSON do MalwareBazaar e URLhaus, eliminando os 401s e mantendo o fallback CSV como backup

## Alterações técnicas

### 1. Novo secret
- Nome: `ABUSE_CH_API_KEY`
- Acessível pela Edge Function via `Deno.env.get('ABUSE_CH_API_KEY')`

### 2. Edge Function (`supabase/functions/sync-threat-feeds/index.ts`)
- Ler `ABUSE_CH_API_KEY` no início da função
- **MalwareBazaar** (linha ~25): adicionar header `Auth-Key` no POST para `mb-api.abuse.ch/api/v1/`
- **URLhaus** (linha ~123): adicionar header `Auth-Key` no POST para `urlhaus-api.abuse.ch/v1/urls/recent/`
- Manter fallback CSV caso a key esteja ausente ou a API retorne erro

## Resultado esperado
- JSON API autenticada → dados mais ricos e estruturados
- Fallback CSV preservado para resiliência
- Zero breaking changes

