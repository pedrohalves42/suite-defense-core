# Diagnóstico: Vazamento Multi-Tenant em Buckets de Storage (Insecure Direct Object Reference)

# Contexto Sistêmico
O sistema armazena instaladores de agentes e scripts personalizados em buckets do Supabase Storage. Esses objetos são sensíveis, pois podem conter chaves de pré-autenticação, tokens de registro ou configurações específicas de infraestrutura de cada cliente.

# Evidência Técnica
Query de políticas RLS em `storage.objects`:
```sql
map[policyname:agent_installers_authenticated_read qual:((bucket_id = 'agent-installers'::text) AND (auth.role() = 'authenticated'::text))]
map[policyname:Authenticated users can read agent scripts qual:(bucket_id = 'agent-scripts'::text)]
```

# Fluxo Afetado
Download de instaladores (`.exe`, `.ps1`) e scripts de agentes.

# Impacto Arquitetural
A política concede acesso de leitura a **qualquer usuário autenticado**, independentemente do tenant ao qual ele pertence. Isso quebra o isolamento multi-tenant central do CyberShield. Um usuário do Tenant A pode baixar os artefatos do Tenant B se conseguir adivinhar ou obter o caminho do arquivo (que muitas vezes segue um padrão previsível).

# Impacto em Segurança
**Vazamento de Informações Sensíveis.** Instaladores gerados on-demand frequentemente embutem `enrollment_keys`. O acesso não autorizado permite que um atacante registre agentes maliciosos no tenant da vítima.

# Impacto Multi-Tenant
Comprometimento crítico do isolamento. Dados de clientes estão expostos a outros clientes da mesma plataforma.

# Correção Recomendada
As políticas de storage devem validar a associação do usuário com o tenant proprietário do objeto.
1. Utilizar metadados do objeto para armazenar o `tenant_id`.
2. Validar via RPC ou `get_active_tenant_id()`.
```sql
CREATE POLICY "tenant_isolation_read" ON storage.objects FOR SELECT 
USING (bucket_id = 'agent-installers' AND (storage.foldername(name))[1] = get_active_tenant_id()::text);
```
*(Assumindo que os arquivos são salvos no padrão `tenant_id/file.ext`)*.

# Refatoração Estrutural
Padronizar o uso de caminhos baseados em UUID de tenant para todos os buckets privados e forçar a validação de prefixo no RLS do storage.

# Como Validar
Como usuário do Tenant A, tentar acessar a URL de um instalador pertencente ao Tenant B. Se o download iniciar, a falha persiste.

# Severidade
- ALTO

# Veredito Final
A implementação atual do Storage ignora as regras de isolamento multi-tenant aplicadas ao banco de dados, criando um vetor de ataque direto para roubo de credenciais de instalação.
