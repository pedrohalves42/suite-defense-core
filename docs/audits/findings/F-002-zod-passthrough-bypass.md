# Diagnóstico: Bypass de Validação Zod em Gateways e Routers (Passthrough Exploit)

# Contexto Sistêmico
O sistema implementa uma camada de "Routers" (ex: `submit-router`, `api-gateway`) que deveria centralizar a validação de contratos de dados (Zod) antes de despachar para os handlers específicos.

# Evidência Técnica
Arquivo `supabase/functions/submit-router/index.ts`:
```typescript
const SubmitRouterSchema = z.object({
  type: z.string().min(1).max(50),
}).passthrough(); // <--- FALHA: Aceita qualquer payload sem validar estrutura
```

Arquivo `supabase/functions/api-gateway/index.ts`:
```typescript
const RouterSchema = z.object({
  action: z.string().min(1).max(80),
  payload: z.record(z.unknown()).optional().default({}), // <--- FALHA: Payload não validado aqui
});
```

# Fluxo Afetado
Todo o fluxo de submissão de telemetria de agentes e chamadas administrativas via gateway.

# Impacto Arquitetural
A camada de validação centralizada é puramente cosmética para o payload. Ela delega a responsabilidade para os handlers, mas não garante que os handlers a executem. Isso quebra o princípio de "Defesa em Profundidade".

# Impacto em Segurança
Permite que atacantes enviem payloads malformados, campos injetados ou tipos inesperados que podem causar erros não tratados nos handlers, vazamento de logs internos ou ataques de injeção de lógica em handlers que usam o objeto `payload` diretamente.

# Impacto Multi-Tenant
Risco de injeção de `tenant_id` ou outros campos de controle em handlers que não revalidam o payload contra o contexto da sessão (JWT).

# Correção Recomendada
Remover o `.passthrough()` dos routers. Cada `type` ou `action` deve estar mapeado para um schema Zod específico já na camada de entrada do gateway/router.

# Refatoração Estrutural
Mover todos os schemas de `src/lib/validations/system-schemas.ts` para um local compartilhado entre Frontend e Edge Functions (`supabase/functions/_shared/schemas/`) e forçar a validação estrita no `api-gateway`.

# Como Validar
Tentar enviar um payload com campos extras ou tipos errados para o `submit-router`. Se o router aceitar e repassar para o handler, a falha persiste.

# Severidade
- ALTO

# Veredito Final
A validação Zod atual é incompleta e oferece uma falsa sensação de segurança, deixando o sistema vulnerável a dados inconsistentes e potenciais explorações de lógica.
