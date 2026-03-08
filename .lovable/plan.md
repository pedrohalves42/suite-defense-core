

# Problemas Prioritarios do CyberShield

Baseado na analise completa do banco de dados, logs de agentes, linter do backend e codigo-fonte, aqui estao os problemas em ordem de prioridade:

---

## P0 - Criticos (Impacto Imediato na Operacao)

### 1. Frota quase inteiramente offline (13/14 agentes offline)
Apenas **PC-Servidor-Planalto** esta ativo. Os outros 13 agentes estao offline. A atualizacao forcada (`force_update_at`) foi disparada para todos, mas como estao offline, nenhum recebeu o script corrigido. Quando voltarem online, o `force_update_at` pode ja ter sido limpo pelo cron `cleanup-stale-updates` (threshold de algumas horas).

**Acao:** Garantir que o `cleanup-stale-updates` nao limpe as flags antes dos agentes voltarem online. Considerar aumentar o threshold ou implementar persistencia da flag ate confirmacao.

### 2. Assinatura de resultados quebrada em toda a frota
O erro `ImportPkcs8PrivateKey` afeta **todos os agentes** com o script antigo. Resultados de jobs sao enviados **sem assinatura criptografica**, quebrando a cadeia de evidencia forense (INV-002/INV-005) e invalidando provas para LGPD/ISO 27001.

**Acao:** O script canonico v5.0.13 no `agent_releases` ja contem o fix multi-algoritmo. O problema e a entrega (item 1).

### 3. Deteccao de anomalias de processos desabilitada
O erro `duplicate key 'first_seen'` no baseline de processos impede a deteccao de malware/atacantes em **todos os agentes** com script antigo. E a principal camada de deteccao proativa.

**Acao:** O script canonico ja contem auto-heal do baseline. Mesmo problema de entrega.

---

## P1 - Seguranca (Vulnerabilidades Estruturais)

### 4. View com SECURITY DEFINER no banco
O linter do backend detectou **1 view** com `SECURITY DEFINER` (executa com permissoes do criador, nao do usuario). Isso pode permitir bypass de RLS.

**Acao:** Identificar a view e recriar com `security_invoker = on`.

### 5. Duas funcoes sem `search_path` definido
`enforce_job_state_transitions` e `ensure_completed_at_on_terminal` nao tem `SET search_path`, permitindo potencial schema injection.

**Acao:** Recriar com `SET search_path = public`.

### 6. Duas politicas RLS permissivas (USING true / WITH CHECK true)
Detectadas pelo linter em operacoes INSERT/UPDATE/DELETE. Podem permitir escrita nao autorizada.

**Acao:** Identificar as tabelas e restringir as politicas com filtros de `tenant_id` e `auth.uid()`.

---

## P2 - Qualidade Operacional

### 7. Alta taxa de falha em jobs (461 failed / 1505 total = 30%)
Nos ultimos 7 dias, 30% dos jobs falharam. Tipos mais afetados: `collect_certificates` (79), `software_inventory_collect` (78), `collect_antivirus_status` (76). Provavelmente relacionado aos agentes rodando scripts antigos.

**Acao:** Apos entrega do script corrigido, monitorar se a taxa cai. Se persistir, investigar falhas especificas por tipo.

### 8. 6 jobs stuck em "pending"
Criados hoje (08/03), provavelmente para agentes offline que nao podem busca-los.

**Acao:** O cron `cleanup_stuck_pending_jobs` deveria cancelar estes automaticamente. Verificar se esta ativo.

### 9. Caracteres nao-ASCII em arquivos sensiveis (guardian-report)
4 erros em `cybershield-agent-windows-v3.ps1` e `agent-script-windows-content.ts` com acentos em comentarios. Pode causar problemas de encoding em sistemas legados.

**Acao:** Substituir caracteres acentuados por ASCII puro nos comentarios.

### 10. Lint e validate:all falhando
`npm run lint` e `npm run validate:all` estao quebrando. Impede CI/CD e qualidade de codigo.

**Acao:** Investigar e corrigir erros de lint.

---

## Resumo de Prioridades

```text
Prioridade   Problema                              Status
─────────────────────────────────────────────────────────
P0-CRIT  1.  Frota offline (13/14)                Aguardando maquinas ligarem
P0-CRIT  2.  Assinatura quebrada                  Fix pronto, pendente entrega
P0-CRIT  3.  Deteccao anomalias OFF               Fix pronto, pendente entrega
P1-SEC   4.  View SECURITY DEFINER                Precisa correcao
P1-SEC   5.  Funcoes sem search_path              Precisa correcao
P1-SEC   6.  RLS permissivas                      Precisa correcao
P2-OPS   7.  30% jobs falhando                    Monitorar pos-fix
P2-OPS   8.  6 jobs stuck pending                  Verificar cron
P2-OPS   9.  Non-ASCII em scripts                 Correcao simples
P2-OPS   10. Lint/validate falhando               Investigar
```

### Recomendacao Imediata

O bloqueio principal e a **entrega do script** (itens 1-3). Uma vez que as maquinas voltem online, o `force_update` deve funcionar -- mas e preciso garantir que o `cleanup-stale-updates` nao limpe as flags antes disso. Apos resolver a entrega, os itens P1-SEC (4-6) devem ser corrigidos por serem vulnerabilidades de seguranca estruturais.

