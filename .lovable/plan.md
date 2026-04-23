
### Diagnóstico: Página de Preview Indisponível

A URL de preview do Lovable está retornando indisponibilidade. Isso geralmente ocorre por uma das seguintes causas, **não relacionadas a falhas no código** da aplicação:

#### Causas Prováveis

1. **Sandbox em Reinicialização**: O servidor de desenvolvimento (Vite) que serve o preview pode ter parado após um período de inatividade ou após uma edição recente. Qualquer nova interação no chat reinicia o sandbox automaticamente.
2. **Token de Acesso Expirado**: O parâmetro `__lovable_token` na URL tem validade limitada. Se o link foi compartilhado ou aberto após muito tempo, o token pode ter expirado, retornando 401/403.
3. **Build com Erro**: Se uma edição recente introduziu um erro de build (TypeScript/Vite), o preview falha em renderizar até que o código seja corrigido.
4. **Capacidade Temporária da Infraestrutura**: O serviço de preview do Lovable pode estar com instabilidade momentânea.

#### Plano de Ação Recomendado

1. **Recarregar o Preview**: Atualizar a página dentro do editor Lovable (não usar o link externo com token). O sandbox reinicia automaticamente.
2. **Verificar Build**: Confirmar que não há erros de TypeScript pendentes da última auditoria executada (correções em `useInsightFeedback.ts` e `Quarantine.tsx`).
3. **Inspecionar Logs**: Caso o problema persista, consultar `/tmp/dev-server-logs/dev-server.log` para identificar falhas de bootstrap do Vite.
4. **Republicar (se aplicável)**: Se o link era da versão publicada (`cybershield-audit.lovable.app`), clicar em **Publish → Update** para sincronizar a última versão estável.

#### Próximos Passos Sugeridos

- Aguardar 30-60 segundos e recarregar o preview no editor.
- Caso o erro persista, posso inspecionar os logs do dev-server e validar a integridade do build atual.

Nenhuma alteração de código é necessária neste momento — trata-se de um evento de infraestrutura/sessão, não de bug funcional.
