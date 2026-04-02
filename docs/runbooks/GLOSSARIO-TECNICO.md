# Glossário de Termos Técnicos — CyberShield

> **Versão:** 1.0 | **Última atualização:** 2026-04-02

---

| Termo | Definição |
|-------|-----------|
| **AES-GCM** | Advanced Encryption Standard com Galois/Counter Mode. Algoritmo de criptografia simétrica autenticada usado para proteger dados em repouso. Implementado em `HmacCryptoAdapter.ts`. |
| **Agente** | Software instalado no endpoint (Windows, Linux ou macOS) que se comunica com o backend CyberShield para reportar telemetria, executar jobs e aplicar remediações. |
| **Baseline Comportamental** | Perfil estatístico (média, desvio padrão) do comportamento normal de um agente, usado para detectar anomalias. Armazenado em `agent_behavioral_baseline`. |
| **Blast Radius** | Limite de impacto de uma automação. Impede que uma ação afete mais de 10% da frota simultaneamente. Configurado em `adaptive_blast_radius_config`. Verificado via RPC `check_blast_radius`. |
| **Circuit Breaker** | Padrão de resiliência que bloqueia requisições a serviços degradados após um número configurável de falhas, evitando cascatas. Implementado em `src/lib/circuit-breaker.ts`. |
| **Clock Skew** | Diferença de relógio entre o agente e o servidor. O CyberShield tolera ±5 minutos para validação de nonce HMAC. |
| **CORS** | Cross-Origin Resource Sharing. Mecanismo de segurança do navegador que controla quais origens podem acessar a API. |
| **CVE** | Common Vulnerabilities and Exposures. Identificador único para vulnerabilidades de segurança conhecidas. |
| **DLQ (Dead-Letter Queue)** | Fila de mensagens mortas. Armazena jobs que falharam após todas as retentativas para análise e reprocessamento. Tabela: `failed_jobs_dlq`. |
| **Despachante Tipado** | Mecanismo que restringe a execução de comandos a uma whitelist predefinida, impedindo execução arbitrária de código nos agentes. Função: `Invoke-AgentJob`. |
| **Drift** | Desvio da configuração ou estado de um sistema em relação ao baseline esperado. O motor de detecção de drift monitora políticas de RLS, MFA e auditoria. |
| **ECDSA P-256** | Elliptic Curve Digital Signature Algorithm com curva P-256. Usado pelo agente Linux/macOS para assinar resultados de execução. Implementado em `agents/unix/lib/crypto.sh`. |
| **EDR** | Endpoint Detection and Response. Categoria de soluções de segurança que detecta e responde a ameaças em endpoints. O CyberShield é uma plataforma EDR. |
| **Edge Function** | Função serverless executada no runtime Deno, próxima ao banco de dados. Processa requisições de agentes e do dashboard. |
| **Enrollment** | Processo de registro inicial de um agente no sistema CyberShield. Utiliza chaves de enrollment (`enrollment_keys`) para autenticação inicial. |
| **EPP** | Endpoint Protection Platform. Plataforma de proteção de endpoints que previne, detecta e remedia ameaças. |
| **Fail-closed** | Modo de operação onde, em caso de falha ou incerteza, o sistema bloqueia a ação por padrão. Oposto de "fail-open". Usado no circuit breaker global. |
| **Fingerprint** | Hash SHA-256 da chave pública de um agente, usado como identificador único da chave para rotação e verificação. |
| **FSM** | Finite State Machine (Máquina de Estados Finita). Modelo que define os 9 estados possíveis de um job: PENDING, DISPATCHED, EXECUTING, COMPLETED, FAILED, CANCELLED, EXPIRED, RETRYING, DEAD_LETTER. |
| **Heartbeat** | Sinal periódico enviado pelo agente ao backend para indicar que está ativo e operacional. Contém métricas básicas de saúde. |
| **HMAC-SHA256** | Hash-based Message Authentication Code usando SHA-256. Mecanismo de autenticação que garante integridade e autenticidade das requisições dos agentes. |
| **Isolamento Multi-tenant** | Garantia de que dados de um inquilino (tenant) nunca são acessíveis por outro. Implementado via RLS com `get_active_tenant_id()`. |
| **Job** | Unidade de trabalho despachada para um agente. Pode ser um scan, remediação, coleta de inventário, ou atualização. Segue FSM de 9 estados. |
| **JWT** | JSON Web Token. Token de autenticação usado pelo dashboard e APIs administrativas. Contém claims do usuário e tenant. |
| **Kerckhoffs (Princípio de)** | Princípio de segurança que estabelece que um sistema deve ser seguro mesmo que tudo sobre ele, exceto as chaves, seja de conhecimento público. |
| **LGPD** | Lei Geral de Proteção de Dados. Legislação brasileira de proteção de dados pessoais. O CyberShield segue os requisitos da LGPD conforme Política 10. |
| **Mutex** | Mutual Exclusion. Mecanismo que impede múltiplas instâncias do agente de executarem simultaneamente. Usado no orquestrador `main.ps1`. |
| **Nonce** | Number used once. Valor único incluído em cada requisição HMAC para prevenir ataques de replay. |
| **Playbook** | Conjunto de ações automatizadas executadas em resposta a um evento de segurança. Parte do motor SOAR. |
| **Quarentena** | Estado de um agente isolado do sistema por motivo de segurança (anomalia, vulnerabilidade crítica, comportamento suspeito). Armazenado em `agent_quarantine`. |
| **RLS** | Row-Level Security. Mecanismo do PostgreSQL que restringe o acesso a linhas de uma tabela com base em políticas definidas. Garante isolamento multi-tenant. |
| **Rollback** | Processo de reverter uma alteração para o estado anterior. Aplicável a atualizações de agentes e ações de remediação. |
| **RPO** | Recovery Point Objective. Quantidade máxima de dados que pode ser perdida em caso de desastre. CyberShield: < 15 minutos. |
| **RTO** | Recovery Time Objective. Tempo máximo para restaurar o sistema após um desastre. CyberShield: < 4 horas. |
| **service_role** | Role do PostgreSQL com acesso irrestrito às tabelas, sem passar por RLS. Usado apenas por edge functions no backend. |
| **SOAR** | Security Orchestration, Automation and Response. Motor que automatiza respostas a incidentes de segurança com base em regras configuráveis. |
| **SOC 2** | Service Organization Control 2. Framework de conformidade que avalia controles de segurança, disponibilidade e confidencialidade. O CyberShield visa conformidade com CC6.1 e CC7.2. |
| **Tenant** | Inquilino. Organização cliente que utiliza o CyberShield. Cada tenant tem dados isolados via RLS. |
| **timingSafeEqual** | Função de comparação de strings que leva tempo constante independente da posição da diferença, prevenindo ataques de timing. Usada na verificação de HMAC. |
| **Trace ID** | Identificador único de rastreamento associado a uma requisição ou operação, permitindo correlacionar logs entre componentes. |
| **TTL** | Time to Live. Tempo máximo que um job pode ficar ativo antes de expirar. Padrão: 4 horas. |
| **Whitelist** | Lista de comandos/ações permitidos. O despachante tipado do agente só executa comandos presentes na whitelist, bloqueando tudo o mais. |
| **Zero Trust** | Modelo de segurança que não confia em nenhuma entidade por padrão, exigindo verificação contínua de identidade e autorização. |

---

**Referências:**
- Documentação completa: `docs/runbooks/`
- Políticas de segurança: `docs/policies/`
