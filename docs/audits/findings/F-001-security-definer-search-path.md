# Diagnóstico: Vulnerabilidade de Seqüestro de Search Path em Funções SECURITY DEFINER

# Contexto Sistêmico
O sistema utiliza extensivamente funções de banco de dados (`public.*`) para lógica de segurança, isolamento multi-tenant e automação. Muitas dessas funções são marcadas como `SECURITY DEFINER`, o que significa que rodam com os privilégios do proprietário (normalmente `postgres` ou um super-usuário), ignorando as permissões do usuário que as chamou.

# Evidência Técnica
O linter do Supabase reportou:
`WARN 1: Function Search Path Mutable - Detects functions where the search_path parameter is not set. Categories: SECURITY`

Exemplo de função afetada identificada via `pg_proc`:
- `collect_soc2_evidence_all_tenants`
- `recalculate_tenant_risk_score`
- `cleanup_expired_hmac_signatures`

# Fluxo Afetado
Qualquer operação que dispare gatilhos (triggers) ou chame funções de manutenção (cron jobs) no banco de dados.

# Impacto Arquitetural
A falta de um `search_path` fixo permite que um atacante que consiga criar um objeto (ex: uma tabela ou função maliciosa) em um esquema com prioridade na busca possa interceptar chamadas de sistema, resultando em execução de código arbitrário com privilégios de super-usuário.

# Impacto em Segurança
**Vulnerabilidade Crítica de Escalada de Privilégios.** Atacantes podem subverter a lógica de isolamento de dados e auditoria.

# Impacto Multi-Tenant
Comprometimento total. Se um atacante escalar privilégios via `search_path`, ele poderá acessar dados de todos os tenants do sistema, ignorando completamente o RLS.

# Correção Recomendada
Todas as funções `SECURITY DEFINER` devem declarar explicitamente o `search_path` seguro.
```sql
ALTER FUNCTION public.nome_da_funcao() SET search_path = public, pg_catalog, pg_temp;
```

# Refatoração Estrutural
Implementar um hook de pré-commit ou auditoria automatizada que bloqueie a criação de funções `SECURITY DEFINER` sem o parâmetro `search_path` definido.

# Como Validar
Executar a query:
```sql
SELECT proname FROM pg_proc WHERE prosecdef = true AND proconfig IS NULL;
```
O resultado deve ser vazio.

# Severidade
- CRÍTICO

# Veredito Final
A arquitetura de banco de dados atual possui uma falha estrutural clássica de segurança de PostgreSQL que anula as garantias de isolamento em caso de exploração.
