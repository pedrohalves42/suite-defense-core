# Contract Tests — Security & Integrity

Este repositório garante que:
- Schemas não sofram drift silencioso
- Edge functions respeitem contratos de dados
- Jobs não falhem silenciosamente
- Kill switch funcione de verdade
- Nenhuma regressão como `actor_type` entre em produção

## 🚨 Regra de Ouro

**Se qualquer teste falhar, o deploy DEVE ser bloqueado.**

## Estrutura

```
contracts/
├── schemas/           # Contratos de schema (colunas requeridas/proibidas)
├── edge/              # Testes específicos por Edge Function
├── invariants/        # Testes de invariantes de segurança
└── utils/             # Utilitários compartilhados
```

## Como Executar

```bash
cd contracts
npm install
npx playwright test
```

## Contratos Implementados

### Schema Contracts
- `audit_logs` - Logs de auditoria (proíbe `actor_type`)
- `system_alerts` - Alertas do sistema
- `agents` - Agentes registrados

### Edge Function Contracts
- `action-center-feed` - Feed de ações
- `security-alert-dispatcher` - Dispatcher de alertas

### Invariants
- No unsafe SECURITY DEFINER functions
- No direct access to sensitive tables
- Kill switch enforcement

## Integração CI

```yaml
- name: Contract Tests
  run: |
    cd contracts
    npm ci
    npx playwright test
```

## Referência

- ADR-027: Edge Contracts
- ADR-023: RLS Hardening
- SECURITY_INVARIANTS.md
