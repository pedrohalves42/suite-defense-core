
# Eliminação de Riscos Críticos Remanescentes

## INÍCIO — Validação do Estado Atual

### 1. Auditoria de Correções Ativas (sem regressão)
- Executar scan de segurança para confirmar que storage policies, circuit breaker, fallback crypto, RLS em partições e CORS estão ativos
- Consultar linter do banco para detectar tabelas/partições sem RLS
- Verificar que `buildCorsHeaders` está sendo usado em todas as edge functions (sem wildcards)

### 2. Agentes Legados v3/v4
- Consulta SQL em `agents` para identificar agentes com versão < v5.0.15
- Verificar bucket `agent-installers` para scripts legados remanescentes
- Confirmar que `enroll-agent` rejeita agentes sem HMAC quando `enforce_hmac_enrollment` está habilitado

### 3. Auditoria de Deno.serve sem Middleware
- Executar `ci/validate-middleware.sh` para listar funções usando raw `Deno.serve()` fora da lista de exceções
- Executar `scripts/inventory_deno_serve.py` para classificar funções migráveis
- Migrar funções classificadas como "migratable" para `serveTenant`/`serveAgent`/`servePublic`/`serveInternal`

## MEIO — Hardening e Automação

### 4. Testes de Integração contra Ataques
- Criar testes Deno para simular: replay HMAC (nonce reutilizado), CORS bypass (origin não autorizada), injeção de payload malformado
- Validar que circuit breaker bloqueia em modo fail-closed
- Testar blast radius (>10% da frota bloqueado)

### 5. CI/CD Security Gates Automatizados
- Garantir que `ci/validate-middleware.sh` roda no pipeline e bloqueia PRs com `Deno.serve` não autorizado
- Garantir que `ci/validate-zod-coverage.sh` roda e bloqueia funções sem validação Zod
- Adicionar step de `supabase--linter` no workflow de segurança para detectar RLS ausente

### 6. Expansão da Validação Zod (31 → 184 funções)
- Verificar cobertura atual com `ci/validate-zod-coverage.sh`
- Identificar funções que aceitam body JSON mas não têm `safeParse`/`z.object`
- Adicionar schemas Zod nas funções descobertas

## FIM — Critérios de Aceitação (Zero Tolerance)

### 7. Validação Final
- ✅ Zero funções sem validação de entrada (Zod gate passa 100%)
- ✅ Zero agentes em versões < v5.0.15 (consulta SQL retorna 0 registros)
- ✅ Todas as funções raw (exceto webhooks/streaming aprovados) migradas para middlewares
- ✅ CI bloqueia qualquer nova função sem validação e detecta regressões de segurança
- ✅ Scan de segurança sem findings críticos
