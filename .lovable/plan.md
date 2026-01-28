

# 🔧 Plano de Correção: Bug Crítico em evaluate-software-risk

## 🔴 Problema Encontrado

A Edge Function `evaluate-software-risk` está falhando com erro **"column does not exist" (42703)** porque:

- **Código atual**: `select('name, version, publisher')`
- **Schema real**: A coluna se chama `vendor`, não `publisher`

Este bug impede **100% das avaliações de risco de software**, causando:
- `vuln_findings` tabela vazia (0 registros)
- 14 agentes com software vulnerável não detectados
- Playbooks de vulnerabilidade nunca ativam

## 📊 Impacto Atual

| Métrica | Valor |
|---------|-------|
| Agentes com WinRAR vulnerável (4.20/5.80) | 8 |
| Agentes com 7-Zip vulnerável (19.00/22.01) | 6 |
| vuln_findings registros | 0 |
| Cron evaluate-software-risk execuções com sucesso | 0 |

## 🛠️ Correção Necessária

### Arquivo: `supabase/functions/evaluate-software-risk/index.ts`

**Linha 175** - Alterar:

```typescript
// DE:
.select('name, version, publisher')

// PARA:
.select('name, version, vendor')
```

### Código Completo da Correção (linhas 173-177):

```typescript
      const { data: inventory, error: invError } = await supabase
        .from('software_inventory')
        .select('name, version, vendor')
        .eq('agent_id', agent_id)
        .order('name');
```

## ✅ Resultado Esperado

Após a correção:
1. **Função executará com sucesso** para todos os agentes
2. **14+ vulnerabilidades serão detectadas** em WinRAR/7-Zip
3. **vuln_findings será populada** com severidade critical/high
4. **Playbooks de vulnerabilidade poderão executar**

## 🧪 Validação Pós-Deploy

```sql
-- 1. Verificar vuln_findings populadas
SELECT severity, COUNT(*) FROM vuln_findings GROUP BY severity;

-- 2. Verificar software com risk_level atualizado
SELECT name, version, risk_level FROM software_inventory 
WHERE risk_level IN ('high', 'critical');
```

## 📋 Sequência de Implementação

1. Corrigir a Edge Function `evaluate-software-risk/index.ts`
2. Aguardar deploy automático
3. Testar manualmente para um agente vulnerável
4. Aguardar próximo cron (Job #72) às 06:00

