# Arquitetura Ponta a Ponta CyberShield

## 1. Fluxo de Dados e Interações

```text
[ AGENTE (Endpoint) ] <---(HTTPS/HMAC)---> [ SUPABASE EDGE FUNCTIONS ] <---(PostgreSQL)---> [ SUPABASE DB ]
      ^                                          |                                         |
      |                                          |                                     (Realtime)
      |                                          v                                         |
      +---(Jobs/Config)--- [ API GATEWAY (Internal) ] <---(JWT/Auth)--- [ DASHBOARD (React) ]
```

### Componentes Principais:
- **Agente (Go/Rust/PS1):** Instalado no computador do cliente. Executa coletas e jobs.
- **Edge Functions (Deno):** Gateway de segurança, processamento de heartbeats e execução de lógica pesada.
- **Supabase Realtime:** Notifica o Dashboard instantaneamente sobre novos alertas ou mudanças de status.
- **API Gateway:** Camada unificada que roteia chamadas do frontend para funções específicas ou banco de dados.

## 2. Mapa de Rotas e Eventos

### Rotas de Interface (Frontend)
| Rota | Descrição | Requisito |
| :--- | :--- | :--- |
| `/login` | Acesso ao sistema | Público |
| `/dashboard` | Visão geral da frota e alertas | Autenticado |
| `/admin/agent-center` | Lista detalhada de computadores | Admin/Operator |
| `/admin/vulnerabilities` | Relatórios de segurança | Analyst/Admin |
| `/admin/settings` | Configurações de Tenant | Admin |

### Endpoints de API (Edge Functions)
| Endpoint | Namespace | Função | Autenticação |
| :--- | :--- | :--- | :--- |
| `/heartbeat` | Public | Sinal de vida e métricas | HMAC + Token |
| `/enroll-agent` | Public | Registro inicial de computador | Enrollment Key |
| `/api-gateway` | Platform | CRUD de usuários, jobs, etc. | JWT (Auth) |
| `/billing` | Platform | Gestão de assinaturas Stripe | JWT (Auth) |

### Eventos de Tempo Real (Realtime)
- **Tabela `system_alerts`**: Notifica o Dashboard sobre ameaças críticas.
- **Tabela `agents`**: Atualiza o status (Online/Offline) no mapa da frota.
- **Tabela `jobs`**: Mostra o progresso de execução de tarefas (ex: scan de vírus).

## 3. Matriz de Validação (Zod)

Todas as entradas críticas estão agora mapeadas em `src/lib/validations/system-schemas.ts`, garantindo que:
1. **Frontend:** Formulários validam dados antes de enviar para a API.
2. **API (Edge):** Payloads são validados via `safeParse` antes de tocar o banco de dados.
3. **Database:** Constraints e RLS garantem a integridade final.
