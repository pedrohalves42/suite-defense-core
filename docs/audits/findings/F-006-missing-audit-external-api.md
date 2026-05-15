# Diagnóstico: Ausência de Trilhas de Auditoria em Handlers de API Externa

# Contexto Sistêmico
O sistema oferece uma API para integrações externas autenticada via API Keys. Handlers no `api-gateway` processam essas requisições para fornecer estatísticas e informações do tenant.

# Evidência Técnica
Arquivo `supabase/functions/api-gateway/handlers/tenant-api.ts`:
Os handlers `handleTenantFeatures`, `handleTenantInfo` e `handleTenantStats` realizam consultas sensíveis mas não invocam `createAuditLog`.

# Fluxo Afetado
Acesso administrativo via integrações de terceiros.

# Impacto Arquitetural
Ações realizadas via API Key são invisíveis para o dashboard de auditoria do administrador. Se uma chave for vazada ou abusada para coleta de inteligência (scraping de estatísticas), não haverá rastro histórico do abuso na tabela `audit_logs`.

# Impacto em Segurança
**Ponto Cego de Monitoramento.** A falta de logs impede a detecção proativa de vazamento de chaves ou reconhecimento de infraestrutura por atacantes.

# Impacto Multi-Tenant
Dificulta a conformidade (compliance) de clientes que exigem rastreabilidade total de acessos aos seus dados.

# Correção Recomendada
Invocar `createAuditLog` em todos os handlers da API externa, registrando o `apiKeyId` como o ator da ação.

# Refatoração Estrutural
Implementar um decorador ou middleware de auditoria automática no orquestrador do `api-gateway` para ações de leitura e escrita.

# Como Validar
Realizar uma chamada à API de estatísticas do tenant usando uma API Key válida e verificar se um novo registro surge na tabela `audit_logs` vinculando a ação à chave utilizada.

# Severidade
- MÉDIO

# Veredito Final
A API externa do CyberShield opera fora do radar do sistema de governança central, criando um risco de conformidade e segurança operacional.
