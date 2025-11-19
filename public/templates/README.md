# ⚠️ Templates Obsoletos - REMOVIDOS

Os templates de instalação foram **movidos para código TypeScript** para garantir 
consistência e evitar divergências entre desenvolvimento e produção.

## Single Source of Truth

Todos os instaladores agora são gerados a partir de:
- **Windows/Linux/macOS**: `supabase/functions/_shared/installer-template.ts`
- **Agent Script Windows**: `supabase/functions/_shared/agent-script-windows-content.ts`

## Por que essa mudança?

1. **Sem duplicação**: Um único arquivo fonte
2. **Sem placeholders quebrados**: Validação em tempo de compilação
3. **Deploy automático**: Edge Functions usam código inline
4. **Versionamento claro**: Git mostra mudanças lado a lado

## Onde editar templates?

- ✅ **Editar**: `supabase/functions/_shared/installer-template.ts`
- ❌ **NÃO editar**: Arquivos `.ps1`/`.sh` nesta pasta
- 🔄 **Sincronizar**: `npm run sync:agent` (apenas para Windows agent script)

## Validação

Para garantir que o agent script está sincronizado:

```bash
npm run validate:sync
```

Este comando verifica se o script em desenvolvimento está alinhado com a versão em produção.
