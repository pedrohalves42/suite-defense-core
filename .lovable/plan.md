
Objetivo
- Fazer o agente atualizar para a versão mais recente de forma previsível (principalmente em cenários de “agente offline” e “reinstalação manual”), e reduzir erros de operação como o do print (URL digitada como comando no PowerShell).

O que o print indica (causa imediata mais provável)
- No PowerShell, colar apenas a URL não “baixa/executa” nada; o PowerShell tenta interpretar a URL como se fosse um comando e retorna “não é reconhecido…”.
- Isso costuma acontecer quando a pessoa deveria ter usado o formato “baixar e executar” (download + pipe para execução) e acabou colando só a URL.

Diagnóstico rápido do estado do backend (o que já verifiquei)
- Existe uma release Windows “stable” ativa e mais recente: v5.0.2.
- A política de rollout para Windows está habilitada e em 100% (não está bloqueando update).

Plano de correção (sem depender do usuário “adivinhar” o comando)
1) Melhorar a experiência no painel (UI) para “Reinstalar / Recuperar agente” (principal)
   - Onde: `src/pages/admin/DiagnosticsCenter.tsx` (já tem seção para baixar o script “clean reinstall”).
   - O que adicionar:
     - Uma nova seção “Reinstalação preservando credenciais (recomendado)”.
     - Um bloco “Copiar comando” (botão) com o one‑liner correto para Windows (baixar e executar).
     - Um segundo botão “Copiar comando alternativo” para ambientes com proxy/restrições (fallback via WebClient/IWR), também pronto para colar.
     - Texto curto e claro:
       - “Abrir PowerShell como Administrador”
       - “Cole o comando (não cole apenas a URL)”
       - “Aguarde finalizar e confirme a versão exibida no final”
   - Por que isso resolve:
     - Remove o erro humano (colar só a URL) e dá um caminho guiado dentro do produto.

2) Incluir “Ações de atualização” mais visíveis para agentes online (secundário, mas útil)
   - Onde: reforçar navegação/CTA para páginas que já existem:
     - `src/pages/admin/AgentVersionMonitor.tsx` (já permite “Forçar update” por agente e em massa).
     - `src/pages/admin/AgentReleases.tsx` (já tem “Atualizar Computadores”, que aciona `process-agent-updates`).
   - O que mudar:
     - Adicionar links/CTAs no Diagnostics Center e/ou na página principal de agentes para:
       - “Forçar atualização para a versão mais recente”
       - “Abrir Monitoramento de Versões”
     - (Opcional) Exibir um banner quando houver agentes “ativos” fora da versão mais recente (não só v3.x), reaproveitando o padrão de `src/components/OutdatedAgentsBanner.tsx`.

3) Robustez extra no script “preserve reinstall” (backend function que serve o .ps1)
   - Onde: `supabase/functions/_shared/reinstall-preserve-script-content.ts`
   - O que ajustar (mantendo o script compacto para não estourar bundle):
     - Melhorar mensagens de erro (quando download falha) para orientar o operador:
       - “Você precisa executar via ‘baixar e executar’ (irm/iwr), não colar a URL”
     - Adicionar fallback de download mais compatível com ambientes corporativos:
       - Tentar também via `Invoke-WebRequest -UseBasicParsing` e/ou WebClient com proxy padrão, caso `Invoke-RestMethod` falhe.
     - Garantir que, ao falhar em baixar a versão nova, o script mostre claramente:
       - qual etapa falhou (rede, TLS, proxy, parsing)
       - e qual comando alternativo usar (que a UI também vai exibir).
   - Por que isso ajuda:
     - Mesmo quando a pessoa executar corretamente, o script terá “planos B” para redes com proxy e erro de parsing.

4) (Opcional) Telemetria/observabilidade para saber “por que não atualizou”
   - Registrar (no backend) eventos simples quando:
     - um “reinstall preserve” foi iniciado e qual estratégia usou (public / fallback).
     - um force_update foi enviado via heartbeat e se foi confirmado (já existe `confirm-force-update` no backend).
   - Isso facilita diferenciar:
     - “não executaram o comando”
     - “executaram, mas o download falhou”
     - “executaram, mas a aplicação do update falhou”.

Sequência de implementação (ordem para reduzir risco)
1) UI no Diagnostics Center: adicionar seção “preserve reinstall” com botões de copiar comando e instruções claras.
2) Ajustes pequenos no script `reinstall-preserve-script-content.ts` (fallback + mensagens), mantendo-o curto para evitar timeouts de bundle.
3) Melhorias de navegação/CTAs para forçar update (AgentVersionMonitor / AgentReleases) e banner de “agentes desatualizados” para versões modernas.
4) (Opcional) Telemetria adicional.

Como vamos validar (testes)
- Teste UI:
  - Abrir Diagnostics Center e verificar:
    - botões copiam o comando esperado
    - texto deixa explícito que não é para colar apenas URL
- Teste “fim a fim” de reinstalação:
  - Em uma VM Windows: colar o comando copiado do painel e confirmar que:
    - o script baixa e executa
    - no final, a “Versão” reportada não fica como “existing”
- Teste de atualização online:
  - No Monitoramento de Versões:
    - marcar um agente como force_update_version e confirmar que o agente aplica e confirma (mudança de versão no painel)

Riscos e cuidados
- Bundle generation timed out: manter o script embutido pequeno; evitar colocar conteúdo grande adicional em `_shared/*-script-content.ts`.
- Não expor detalhes internos na conversa: a UI exibirá o comando pronto; aqui no chat não precisamos repetir URLs completas.

Arquivos que provavelmente serão alterados
- `src/pages/admin/DiagnosticsCenter.tsx` (nova seção + copy buttons + instruções)
- `src/components/OutdatedAgentsBanner.tsx` (opcional: ampliar para versões modernas)
- `supabase/functions/_shared/reinstall-preserve-script-content.ts` (fallback e mensagens, mantendo compacto)
