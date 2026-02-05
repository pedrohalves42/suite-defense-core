
# Plano: Reimplantar Edge Functions Críticas

## Diagnóstico

Baseado nos logs de analytics, várias Edge Functions estão retornando **404 (Not Found)**:

| Função | Status | Impacto |
|--------|--------|---------|
| `heartbeat` | 404 | Agentes não conseguem reportar status |
| `submit-agent-evidence` | 404 | Evidências de segurança não são salvas |
| `action-center-feed` | 404 | Dashboard fica vazio |
| `get-reinstall-preserve-script` | ✅ 200 | Corrigido após último deploy |

## Causa Raiz

O erro **SUPABASE_CODEGEN_ERROR (Bundle generation timed out)** nas edições anteriores pode ter corrompido o estado de deploy de múltiplas funções. Quando o bundler falha, as funções afetadas não são reimplantadas.

## Solução

Reimplantar as funções críticas que estão retornando 404:

```text
Funções a reimplantar:
├── heartbeat                 (crítico - heartbeat dos agentes)
├── submit-agent-evidence     (crítico - logs de evidência)
├── action-center-feed        (alto - dashboard)
├── get-latest-agent-script   (alto - atualização de agentes)
└── serve-agent-update        (alto - distribuição de updates)
```

## Passos

1. **Reimplantar funções críticas** - Executar deploy das 5 funções que estão dando 404

2. **Verificar funcionamento** - Testar cada endpoint com curl para confirmar status 200

3. **Validar agentes** - Confirmar que agentes voltam a aparecer como online após heartbeat bem-sucedido

## Detalhes Técnicos

As funções existem no código (`supabase/functions/*/index.ts`) mas não estão ativas no runtime. O deploy irá:
- Compilar cada função com Deno
- Fazer upload para o edge runtime do Supabase
- Ativar os endpoints para receber requests

## Resultado Esperado

Após o deploy:
- Agentes voltam a enviar heartbeats com sucesso
- Dashboard carrega o Action Center Feed
- Script de reinstalação consegue baixar versões atualizadas
