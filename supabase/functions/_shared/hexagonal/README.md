# Arquitetura Hexagonal no Projeto

Este documento descreve como utilizamos a arquitetura hexagonal (Ports and Adapters) nas Edge Functions do Supabase para manter o código testável, desacoplado e tipado.

## Estrutura de Pastas

```text
_shared/hexagonal/
├── ports.ts          # Interfaces (Contratos)
├── repositories/     # Implementações de persistência (Adapters de Saída)
├── use-cases/        # Lógica de negócio (Application Core)
├── types.ts          # Tipos específicos do domínio hexagonal
└── adapters.ts       # Fábricas e utilitários de adaptadores
```

## 1. Como adicionar uma nova tabela e regenerar tipos

O projeto utiliza o CLI do Supabase para gerar tipos TypeScript baseados no esquema do banco de dados.

1.  **Crie a migração**: Adicione sua nova tabela via `supabase--migration`.
2.  **Atualização automática**: Os tipos em `supabase/functions/_shared/database.types.ts` são geralmente atualizados automaticamente após a execução bem-sucedida de uma migração no ambiente Lovable Cloud.
3.  **Uso nos Repositórios**:
    ```typescript
    import { Database } from '../../database.types.ts';
    type Tables = Database['public']['Tables'];
    export type MinhaTabela = Tables['minha_tabela']['Row'];
    ```

## 2. Como criar um repositório e um use case

### Criando um Repositório (Adapter)

Siga o padrão do `CheckRepository`:
1.  Defina a interface no repositório (ou em `ports.ts`).
2.  Implemente a classe usando o `SupabaseClient<Database>`.
3.  **Evite `as any`**: Use as tipagens do `Database` para garantir segurança.

```typescript
// supabase/functions/_shared/hexagonal/repositories/meu.repository.ts
export class SupabaseMeuRepository implements IMeuRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async buscarDados(id: string): Promise<MeuTipo> {
    const { data, error } = await this.supabase
      .from('minha_tabela')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }
}
```

### Criando um Use Case (Application Service)

O Use Case deve depender apenas de interfaces (Ports), nunca de implementações concretas (como o cliente Supabase diretamente).

```typescript
// supabase/functions/meu-modulo/use-cases/meu.use-case.ts
export class MeuUseCase {
  constructor(private readonly repository: IMeuRepository) {}

  async execute(payload: any) {
    // Lógica de negócio aqui
    return await this.repository.buscarDados(payload.id);
  }
}
```

## 3. Como escrever testes com mocks

Utilizamos o Deno Test e objetos mock para isolar a lógica de negócio da infraestrutura.

### Exemplo de Teste Unitário

```typescript
// supabase/functions/__tests__/meu-use-case.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MeuUseCase } from "../meu-modulo/use-cases/meu.use-case.ts";

Deno.test("MeuUseCase - deve processar dados corretamente", async () => {
  // 1. Setup Mock
  const mockRepo = {
    buscarDados: (id: string) => Promise.resolve({ id, nome: "Teste" }),
  } as any;

  const useCase = new MeuUseCase(mockRepo);

  // 2. Execução
  const result = await useCase.execute({ id: "123" });

  // 3. Asserção
  assertEquals(result.nome, "Teste");
});
```

### Dicas para Testes Críticos
-   **Mocks de Repositório**: Use `as any` ou `as ICheckRepository` nos mocks para simular apenas os métodos necessários para aquele teste específico.
-   **Casos de Erro**: Sempre teste o comportamento quando o repositório falha (lança erro) ou retorna dados nulos.
-   **Independência**: Testes unitários não devem fazer chamadas de rede ou banco de dados real.
