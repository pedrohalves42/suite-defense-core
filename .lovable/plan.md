
# Plano: Registrar e Deployar Novas Versões dos Agentes

## Problema Identificado

Os scripts dos agentes foram atualizados com correções críticas (FSM Enterprise v2.0), mas as novas versões **não foram registradas no banco** e os agentes em produção **ainda rodam versões antigas**.

### Discrepância Atual

| Plataforma | Versão no Script | Versão Registrada | Versão nos Agentes |
|------------|------------------|-------------------|-------------------|
| Windows | v3.10.41-AUTO-RECOVERY | v4.2.2 | v4.2.2 (14 agentes) |
| Linux | v4.4.0 | v4.2.1 | Nenhum ativo |
| macOS | v4.4.0 | v4.2.1 | Nenhum ativo |

### Correções Incluídas na v4.4.0 (Linux/macOS)

1. **SHUTDOWN Hard Block** - `exit 1` quando em estado SHUTDOWN (linha 369-374)
2. **Update Lock** - `flock -n 9` para evitar race conditions (linha 716-725)
3. **FSM Enterprise v2.0** - Estados determinísticos completos
4. **Observabilidade** - `write_log_dedup`, `write_health_snapshot`

---

## Plano de Implementação

### Fase 1: Registrar Novas Releases no Banco (5min)

Registrar as novas versões via Edge Function `register-agent-release`:

**Linux v4.4.0:**
- Ler conteúdo do script `public/agent-scripts/cybershield-agent-linux-v4.sh`
- Calcular SHA256 do conteúdo normalizado
- Chamar Edge Function com `version: 'v4.4.0'`, `platform: 'linux'`

**macOS v4.4.0:**
- Ler conteúdo do script `public/agent-scripts/cybershield-agent-macos-v4.sh`
- Calcular SHA256 do conteúdo normalizado
- Chamar Edge Function com `version: 'v4.4.0'`, `platform: 'macos'`

### Fase 2: Disparar Force Update (3min)

Para agentes Linux/macOS online (se houver):

```sql
UPDATE agents 
SET 
  force_update_version = 'v4.4.0',
  force_update_reason = 'FSM Enterprise v2.0 - SHUTDOWN hard block + update lock',
  force_update_at = NOW()
WHERE 
  status = 'active' 
  AND os_type IN ('linux', 'macos')
  AND agent_version != 'v4.4.0'
  AND last_heartbeat > NOW() - INTERVAL '10 minutes';
```

### Fase 3: Verificar Windows (5min)

O script Windows tem uma discrepância de nomenclatura:
- Parâmetro default: `v3.10.41-AUTO-RECOVERY`
- Banco registra: `v4.2.2`
- Agentes reportam: `v4.2.2`

Isso indica que o parâmetro no script é sobrescrito pelo processo de update. Verificar se as correções da FSM estão presentes no script Windows atual.

---

## Arquivos a Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| Banco: `agent_releases` | INSERT | Registrar v4.4.0 para Linux e macOS |
| Banco: `agents` | UPDATE | Disparar force_update para agentes desatualizados |

---

## Validação Pós-Implementação

1. **Releases registradas:** Query `agent_releases` deve mostrar v4.4.0 para Linux/macOS
2. **Force update disparado:** Agentes online recebem no próximo heartbeat
3. **Agentes atualizados:** Após ~2 minutos, `agent_version` muda para v4.4.0

---

## Resultado Esperado

- Todas as plataformas com versões mais recentes registradas
- Correções de segurança (SHUTDOWN, update lock) deployadas
- Sistema pronto para produção com agentes sincronizados
