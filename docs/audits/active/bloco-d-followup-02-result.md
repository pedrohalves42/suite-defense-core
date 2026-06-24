# D-FOLLOWUP-02 — Corrigir heartbeat/types.ts

## Escopo
- Arquivo único: `supabase/functions/heartbeat/types.ts`.

## Correção
Removidas duas chaves `}` órfãs nas linhas 99–100 que fechavam blocos inexistentes após `AgentUpdate`. O fechamento correto da interface ficou apenas na linha 98.

Antes:
```ts
  version?: number;
}
}
}

export interface HeartbeatContext {
```

Depois:
```ts
  version?: number;
}

export interface HeartbeatContext {
```

## Preservado
- Todos os exports (`OSInfo`, `SystemMetricsPayload`, `ProcessesPayload`, `ProcessEntry`, `AgentContext`, `AgentUpdate`, `HeartbeatContext`).
- Formato dos tipos existentes.
- Runtime inalterado (arquivo só de tipos).
- `heartbeat/index.ts` não foi tocado — `@ts-nocheck` mantido.

## Validação
- `tsgo --noEmit` → 0 errors
- `bun run lint` → 0 errors (914 warnings pré-existentes)
- `bash scripts/bloco-c-gates.sh` → PASS (3/3)

## Próximo
Liberado para **D3 — remover `@ts-nocheck` de `heartbeat/index.ts`**.
