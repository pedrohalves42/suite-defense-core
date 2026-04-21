

# Auditoria de erros ocultos — varredura completa

Para responder com precisão "o que falta resolver", preciso executar uma varredura sistemática em 6 camadas do projeto. Como estou em modo somente-leitura, este é o plano que executarei assim que aprovado.

## Escopo da auditoria

### 1. Erros de compilação TypeScript
- Rodar `tsc --noEmit` para listar todos os erros de tipo silenciados
- Verificar imports quebrados, módulos faltantes, tipos incompatíveis
- Foco em arquivos recentemente alterados (`agentReinstallCommand.ts`, `CustomizableDashboard.tsx`)

### 2. Erros de lint / qualidade de código
- Rodar ESLint com a config do projeto (`config/eslint.config.js`)
- Identificar `any` fora de mappers, `@ts-ignore`, `dangerouslySetInnerHTML`, `console.log` em edge functions — violações dos padrões core do projeto

### 3. Erros de runtime no frontend
- Inspecionar console logs do preview (já vi: só auth INITIAL_SESSION, sem erros aparentes)
- Inspecionar runtime errors knowledge file
- Checar dev-server.log em `/tmp/dev-server-logs/dev-server.log` para warnings de Vite/HMR

### 4. Erros do backend (Supabase)
- Rodar `supabase--linter` (RLS, search_path, security definer)
- Rodar `security--run_security_scan` (findings de segurança pendentes)
- Consultar `postgres_logs` recentes (últimas 24h) para erros SQL
- Consultar `function_edge_logs` para 5xx em edge functions

### 5. Testes quebrados
- Rodar suíte de testes unitários (vitest)
- Rodar testes de edge functions (deno test)
- Listar testes pulados (`.skip`) ou marcados como TODO

### 6. Gates de CI
- Rodar `ci/validate-zod-coverage.sh` (cobertura Zod em edge functions)
- Rodar `ci/security_gate.sh` (invariantes críticas)
- Rodar `ci/validate-middleware.sh`
- Verificar asserts SQL em `tools/tests/assert_*.sql`

## Entrega

Relatório consolidado agrupado por severidade:

| Camada | Crítico | Alto | Médio | Baixo |
|--------|---------|------|-------|-------|
| TypeScript | … | … | … | … |
| Lint | … | … | … | … |
| Runtime | … | … | … | … |
| Backend/RLS | … | … | … | … |
| Testes | … | … | … | … |
| CI gates | … | … | … | … |

Para cada item: arquivo, linha, descrição curta e ação recomendada. Sem aplicar correções nesta passada — só diagnóstico. Em seguida você decide o que priorizar.

## Tempo estimado
3–5 minutos de varredura paralela.

