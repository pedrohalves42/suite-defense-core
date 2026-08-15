# Relatório de Inventário — Banco de Dados + Edge Functions (pré-migração)

Objetivo: produzir um dossiê único, versionado no repositório, com tudo que é necessário para planejar a saída da plataforma atual com exatidão (schema, volume, segurança, auth, funções, storage, realtime, frontend, custo).

## Estado atual verificado

- 79 diretórios em `supabase/functions` (inclui `_shared`).
- 100 arquivos de migração em `supabase/migrations`.
- `supabase/config.toml` declara 206 blocos `[functions.*]`; a maior parte dos crons está marcada como DISABLED por otimização de custo — os schedules ativos precisam ser extraídos um a um.
- Tipos gerados (`src/integrations/supabase/types.ts`) têm ~52k linhas — fonte confiável de tabelas/colunas/enums/funções expostas caso o banco fique indisponível.
- **Acesso direto ao banco está falhando agora** (`psql` sem credenciais válidas e as consultas de leitura retornam timeout de conexão). Nenhuma métrica de linhas, tamanho, RLS ou `hmac_secret` foi coletada ainda.

## Entregáveis

Um documento principal mais anexos de dados brutos:

```text
docs/audits/active/inventory/
├── README.md                     # relatório consolidado (seções 1–8 + checklist)
├── db-schema.md                  # tabelas, colunas, PK/UK, FKs, índices, defaults, enums/checks
├── db-volume.csv                 # linhas aproximadas + tamanho em disco por tabela
├── db-security.md                # RLS por tabela, texto das policies, grants por role, colunas sensíveis
├── db-programmability.md         # views, matviews, functions (SECURITY DEFINER), triggers, extensões
├── edge-functions.csv            # 1 linha por função: auth, chamador, tabelas, service role, cron, MVP sim/não
├── auth-identity.md              # provedores, users/profiles/membership, claims JWT, MFA, SCIM, convites
└── storage-realtime.md           # buckets, tamanho, política de acesso; canais realtime; filas/jobs
```

## Execução

1. **Restabelecer leitura do banco.** Reexecutar as consultas de inventário; se o timeout persistir, gerar as seções de schema a partir de `types.ts` + migrações e marcar explicitamente cada número ausente como `PENDENTE — banco indisponível`, em vez de estimar.
2. **Seção 1 — Banco.** Rodar as consultas de catálogo (tabelas, colunas, FKs, índices, `pg_policies`, `pg_stat_user_tables`, `pg_total_relation_size`, `pg_proc`, triggers, extensões) e exportar os resultados para os anexos.
3. **Seção 1.4 — Dados sensíveis.** Contagem de `hmac_secret` ausente/inválido em `agents`, mapa de colunas com PII (e-mail, nome, IP) e volume das tabelas de auditoria/telemetria com a política de retenção atual.
4. **Seção 2 — Auth.** Levantar provedores realmente configurados, o par `auth.users` ↔ perfis ↔ vínculo de tenant, claims customizados, exigência de AAL2 e as funções de SAML/FIDO2/SCIM/convites presentes no repositório.
5. **Seção 3 — Edge Functions.** Para cada função: modo de autenticação (HMAC de agente, JWT, interno, anônimo), quem chama (UI, agente, cron, webhook), tabelas acessadas, uso de service role, schedule ativo no `config.toml` e classificação MVP / fase 2. Volume por função vem dos logs, com janela declarada no relatório.
6. **Seções 4–6.** Buckets de storage e uso, canais realtime, modelo de fila de jobs, e o mapa do frontend (chamadas diretas ao cliente, variáveis de ambiente, alvos Electron/Capacitor, CORS).
7. **Seções 7–8 + checklist.** Montar o quadro final de decisão com os 12 itens do checklist, cada um marcado como coletado ou dependente de resposta do usuário.

## Restrições respeitadas

- Trabalho 100% somente leitura: nenhuma migração, nenhum `pg_dump`, nenhuma alteração de runtime. Compatível com o congelamento pré-produção vigente.
- Segredos nunca são impressos: colunas sensíveis são inventariadas por nome, formato e contagem de validade, jamais por valor.

## Informações que só você pode fornecer

Estas entram no relatório como campos de decisão e ficam em branco até você responder:

- Fatura mensal atual, quebrada por serviço, e teto de custo alvo.
- Ambientes existentes (só produção, ou dev/staging/prod) e SLA exigido.
- Migrar os dados de produção ou partir de banco zerado.
- Preferência final de destino: Postgres próprio, Mongo ou híbrido.
- Quem administra a operação depois do cutover (um dev ou time).
