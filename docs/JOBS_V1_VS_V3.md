# Jobs v1 vs v3 - Migração de Protocolo

## Visão Geral

Este documento detalha a migração do protocolo de jobs do CyberShield de **v1** para **v3**.

## Diferenças Principais

### Jobs v1 (Legado - ack-job)
- **Endpoint**: `/functions/v1/ack-job`
- **Status final**: `done`
- **Campos preenchidos**: Apenas `status`, `completed_at`
- **Output**: Não existe (NULL)
- **Detalhes de execução**: Não rastreados

### Jobs v3 (Atual - submit-job-result)
- **Endpoint**: `/functions/v1/submit-job-result`
- **Status final**: `completed` ou `failed`
- **Campos preenchidos**: `status`, `output` (JSON), `error_message`, `started_at`, `finished_at`, `execution_time_seconds`
- **Output**: Estruturado (JSON com detalhes da execução)
- **Detalhes de execução**: Completos e rastreáveis

## Compatibilidade Durante Migração

### View `jobs_normalized`
Criada para fornecer compatibilidade entre v1 e v3:
- Mapeia `status='done'` → `normalized_status='completed'`
- Flag `is_v3` indica se job tem output estruturado
- Campo `duration_seconds` calculado automaticamente

### Agente Híbrido
O agente PowerShell v3 suporta:
1. **Tentativa v3** (submit-job-result) - Prioridade
2. **Fallback v1** (ack-job) - Se v3 falhar

## Estratégia de Rollout

### Fase 1: Backend Ready (✅ Completo)
- Colunas v3 adicionadas ao banco
- Edge Function `submit-job-result` implementada
- Dashboard atualizado para aceitar v1 + v3

### Fase 2: Agente Híbrido (🔄 Em Progresso)
- Função `Submit-JobResult` adicionada ao agente PowerShell
- Fallback automático para v1 se v3 falhar
- Rollout controlado por agente

### Fase 3: Monitoramento (🔄 Ativo)
- Dashboard `/admin/jobs-v3-migration` monitora adoção
- Guardian valida % de jobs v3
- Identificação de agentes ainda em v1

## Métricas de Sucesso

- **Fase 2**: >50% jobs usam v3 após 1 semana
- **Fase 3**: >80% jobs usam v3 após 3 semanas
- **Fase 4**: >95% jobs usam v3 (pronto para deprecar v1)

## Rollback

Se necessário, reverter agente para v1:
1. Comentar chamadas `Submit-JobResult`
2. Usar apenas `Ack-Job-Fallback`
3. Backend continua funcionando (aceita ambos)

## Status Atual

**Data**: 2025-01-17  
**Fase**: Migração Híbrida  
**Adoção v3**: Verificar em `/admin/jobs-v3-migration`