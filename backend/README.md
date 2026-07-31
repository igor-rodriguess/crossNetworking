# Backend – Plataforma Cross

Backend da Plataforma Cross (Node.js + Express + TypeScript) e implementação do banco de dados **PostgreSQL 16** (hospedado no Supabase), conforme o Modelo Físico do [WAD](../WAD.MD) (seção 7.4).

## Estrutura

```
backend/
├── src/
│   ├── config/            # variáveis de ambiente e pool de conexão (pg)
│   ├── routes/            # rotas da API (health check)
│   ├── app.ts / server.ts # Express
├── scripts/
│   ├── migrate.ts         # runner de migrations (+ subcomando "status")
│   ├── test-db.ts         # testes de integridade (WAD 7.4.24)
│   ├── db-health.ts       # observabilidade (WAD 7.4.28)
│   └── db-backup.ts       # backup lógico via COPY (WAD 7.4.27)
├── database/
│   ├── migrations/        # 001–023, na ordem de dependência (WAD 7.4.22)
│   └── tests/             # integridade.sql (14 cenários; rollback ao final)
├── .env.example
└── package.json
```

## Conexão (dois papéis — privilégio mínimo)

A aplicação e as migrations usam **papéis diferentes** (segurança — WAD 7.4.20). Copie `.env.example` para `.env` e preencha:

- `DATABASE_URL` → papel de aplicação **`cross_app`** (só `SELECT/INSERT/UPDATE/DELETE`, sem DDL/superusuário). Usado pela API e pelos testes.
- `MIGRATION_DATABASE_URL` → papel administrativo **`postgres`**. Usado apenas pelo `db:migrate`.

> Use sempre a string do **Session pooler** do Supabase (IPv4). A *Direct connection* é IPv6-only e não funciona em redes IPv4.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run db:migrate` | Aplica migrations pendentes (transacional, idempotente). Verifica checksums das já aplicadas (detecta adulteração — WAD 7.4.22). |
| `npm run db:status` | Lista migrations aplicadas/pendentes e sinaliza `ADULTERADA!` se um arquivo aplicado foi alterado. |
| `npm run db:test` | Roda os 14 cenários de integridade (nada é persistido). |
| `npm run db:health` | Painel de saúde: tamanho, conexões, queries lentas, locks, maiores tabelas, índices sem uso, cache hit ratio. |
| `npm run db:backup` | Backup lógico dos dados (COPY + gzip) em `backups/<timestamp>/`. O schema está versionado nas migrations. |
| `npm test` | Executa a suíte automatizada (API, regras de negócio e agentes) com rollback dos dados de teste. |
| `npm run typecheck` | Verifica o contrato TypeScript sem gerar arquivos. |
| `npm run dev` | Sobe a API. |

### Sondas operacionais

| Rota | Finalidade |
|---|---|
| `GET /health` | Liveness da API. |
| `GET /health/db` | Conectividade real com o PostgreSQL. |
| `GET /health/ai` | Disponibilidade do Ollama e presença do modelo configurado. Retorna `503` quando o serviço ou modelo não estiverem prontos. |
| `GET /readyz` | Readiness para deploy: só retorna sucesso quando a API não está drenando e o banco responde. |
| `GET /metrics` | Métricas Prometheus, protegidas por `Authorization: Bearer <METRICS_TOKEN>`. |

### Restauração de backup (banco já migrado)

Por tabela (exemplo com `psql`):

```bash
gunzip -c backups/<ts>/<schema>.<tabela>.copy.gz \
  | psql "<MIGRATION_DATABASE_URL>" -c "COPY <schema>.<tabela> FROM STDIN"
```

Para DR de produção, combine este backup com os **backups gerenciados do Supabase** (automáticos / PITR) e um **restore testado** num ambiente separado.

## Migrations (WAD 7.4.22)

`001`–`019`: fundação (extensões, schemas, domínios, tabelas por domínio, constraints, índices, funções, triggers, papéis, seeds).
Reforços posteriores:

| Arquivo | Conteúdo |
|---|---|
| `020_business_rules.sql` | Parceria só após aprovação + Paper validado; avaliação só sobre validação aprovada; únicos parciais de contrato/responsável ativos |
| `021_integrity_hardening.sql` | Formatos (CPF/CNPJ/e-mail/hash), texto não-vazio, faixas de versão/ordem/peso, e-mail case-insensitive |
| `022_audit_coverage.sql` | Auditoria técnica ampliada às demais entidades de negócio |
| `023_security_privileges.sql` | Auditoria imutável e histórico append-only para `cross_app` (revoke de UPDATE/DELETE) |

## Integração Contínua

`.github/workflows/db.yml` sobe um PostgreSQL 16 descartável a cada push/PR, aplica as migrations, verifica o status e roda os testes de integridade — sem depender do Supabase.

## Convenções do banco

- UUID (`gen_random_uuid()`), tabelas no singular em `snake_case`.
- Exclusão **lógica** via `arquivado_em` + índices únicos parciais (`WHERE arquivado_em IS NULL`).
- Vocabulários controlados em tabelas de referência (`codigo` estável, rótulo mutável).
- Entidades estratégicas versionadas com no máximo uma versão `vigente` ativa.
- Score Card calculado pela aplicação e **validado deterministicamente por triggers**.
- Auditoria técnica em `cross_governance.auditoria` (imutável para a aplicação); usuário propagado via `SET LOCAL app.usuario_id = '<uuid>'`.
- Migrations aplicadas nunca são modificadas; mudanças geram novos arquivos.
