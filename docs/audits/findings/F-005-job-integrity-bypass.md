# Diagnóstico: Loophole de Integridade em Jobs via Endpoints Legados (Legacy Bypass)

# Contexto Sistêmico
O CyberShield migrou para um novo orquestrador de resultados de jobs (`submit-job-result`) que implementa "Zero Trust side-effects" — validando e persistindo telemetria crítica antes de marcar o job como concluído.

# Evidência Técnica
Arquivo `supabase/functions/ack-job/index.ts` (Endpoint legado):
```typescript
// Update job status diretamente
const { error: updateError } = await supabase
  .from('jobs')
  .update({ status: 'completed', completed_at: new Date().toISOString() })
  .eq('id', validatedJobId)
  .eq('agent_name', agentName);
```

# Fluxo Afetado
Ciclo de vida de jobs e auditoria de telemetria.

# Impacto Arquitetural
A existência do endpoint `ack-job` (ativo até Junho de 2026) permite que agentes subvertam a integridade dos dados. Jobs que deveriam obrigatoriamente reportar inventário de software ou atividades web via `submit-job-result` podem ser "finalizados" sem esses dados através do `ack-job`.

# Impacto em Segurança
**Quebra de Auditoria e Conformidade.** Um agente comprometido pode "limpar" o job no servidor sem enviar a telemetria que revelaria a invasão, explorando a falta de enrijecimento de endpoints por tipo de job.

# Impacto Multi-Tenant
Inconsistência nos relatórios de governança entre diferentes clientes.

# Correção Recomendada
1. Desativar imediatamente o `ack-job` para tipos de jobs críticos (security scans, software inventory).
2. Adicionar uma validação no banco de dados (trigger) que impeça a mudança para `status = 'completed'` se o job for de um tipo que exige side-effects e estes não estiverem presentes.

# Refatoração Estrutural
Mover a lógica de transição de estado para uma Stored Procedure centralizada que valide as pré-condições de cada tipo de job antes de permitir a conclusão.

# Como Validar
Simular a finalização de um job do tipo `collect_web_activity` via `ack-job`. Se o job for marcado como `completed` sem os registros de atividade web na tabela correspondente, a vulnerabilidade está confirmada.

# Severidade
- ALTO

# Veredito Final
A manutenção de compatibilidade com agentes legados via `ack-job` criou uma brecha de integridade que anula os benefícios de segurança do novo orquestrador.
