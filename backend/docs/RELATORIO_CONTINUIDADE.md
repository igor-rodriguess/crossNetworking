# Relatório de Estado — Backend Plataforma Cross

**Última atualização:** 15/07/2026
**Branch:** `main` (sincronizada com o GitHub)
**Estado geral:** ✅ **Todos os módulos de negócio implementados** — 193 rotas REST, 50 dos 51 RF, 10 suítes de integração verdes contra o Supabase real.

---

## 1. O que está pronto

### Banco de dados (Supabase)

24 migrations versionadas com checksum SHA-256, todas aplicadas. Regras críticas garantidas por triggers, não só pela aplicação:

| Regra | Onde vive |
|---|---|
| RN026 — parceria exige decisão aprovada **e** Paper validado | `trg_parceria_validar_aprovacao` |
| RN022 — Score Card exige validação de Paper aprovada | `trg_avaliacao_validar_validacao_aprovada` |
| RN023 — score = Σ pontuações + potencial disruptivo | `fn_validar_score_total` (constraint trigger diferida) |
| RN034 — um encerramento por projeto/parceria | `uq_encerramento_*` (migration 024) |
| RN037 — auditoria imutável | `REVOKE UPDATE, DELETE` sobre `cross_governance.auditoria` |

### API REST (193 rotas Express, todas testadas)

| Módulo | RFs | Rotas |
|---|---|---:|
| Partes | RF004–009 | 12 |
| Documentos | RF009 | 2 |
| Clientes & Contratos | RF016–018 | 13 |
| Admin & Catálogos | RF002 | 6 |
| Projetos | RF019–023 | 16 |
| Frentes & Candidaturas | RF024–026 | 11 |
| Metodologias (Crossability, Paper, Score Card) | RF027–033 | 26 |
| Parcerias | RF034–037 | 15 |
| Execução | RF038–042 | 26 |
| Resultados & Acompanhamento | RF043–047 | 18 |
| Inteligência Estratégica | RF010–015 | 37 |
| Governança & IA | RF048–051 | 9 |
| Docs (OpenAPI/Swagger) | — | 1 |

Cada módulo segue o mesmo formato de 6 arquivos: `schema` (zod) → `repository` (SQL) → `service` (regras + transação) → `controller` (HTTP) → `routes` (rotas + OpenAPI) → `test` (Supertest contra o Supabase real).

---

## 2. O que falta (escopo consciente)

1. **RF001 — Autenticação real.** É a única lacuna funcional. O middleware `autorizar(...personas)` já declara as personas exigidas por rota; falta plugar a verificação de identidade quando o login existir. Nenhuma rota precisa ser reescrita para isso.
2. **Vínculos de documento a entidades** (`projeto_documento`, `paper_documento`, …). As tabelas existem; faltam as rotas de vínculo/desvínculo. Baixa prioridade.
3. **Especialização parcial no PATCH de Parte** (atualizar `organizacao{}`/`pessoa{}` junto do PATCH base).

---

## 3. Como rodar

```powershell
# Node é portátil — sempre prefixe o PATH
$env:Path = "$env:LOCALAPPDATA\node-portable\node-v24.18.0-win-x64;$env:Path"
cd c:\Users\IgorRodrigues-CrossN\Documents\CrossNetworking\crossNetworking\backend

npm run typecheck      # tsc --noEmit
npm test               # suíte de integração (contra o Supabase)
npm run dev            # http://localhost:3000/v1/docs (Swagger UI)
npm run db:migrate     # aplicar migrations pendentes
```

### Receita para um novo módulo (padrão consolidado)

1. Leia o DDL real: `awk '/^CREATE TABLE/,/^\);/' database/migrations/0XX_*.sql`
2. Leia os seeds do vocabulário: `grep -A8 "nome_da_tabela (codigo" database/migrations/019_seed_reference_data.sql`
3. Escreva os 6 arquivos copiando o padrão de `src/modules/execucao/` (o mais completo).
4. Monte o router em `src/app.ts` **antes** do `errorHandler`.
5. `npm run typecheck && npx vitest run src/modules/<modulo>`
6. Commit + push.

---

## 4. Armadilhas já pagas (não repita)

| Armadilha | Como evitar |
|---|---|
| A tabela `parte` mora em **`cross_core`**, não em `cross_parties` | Confira o schema real antes do JOIN |
| Helper de teste `async` quebra o `.expect()` do Supertest | Devolva o objeto `Test` (sem `async`), não uma Promise |
| `$9 IS NULL` em `CASE` → "could not determine data type" | Faça cast explícito: `$9::uuid` |
| `npm run build` gera `dist/` e o Vitest testava os `.js` | `vitest.config.ts` exclui `**/dist/**` |
| `information_schema` **trava** no Supabase em loops DDL | Use `pg_catalog` |
| Conexão direta do Supabase é **IPv6-only** (não funciona na Inteli) | Use o *Session pooler* (`aws-1-us-east-2…`), já no `.env` |
| `Paginacao` expõe `limit`/`offset` | Não invente `limite`/`deslocamento` |
| Enum vs. texto no Postgres | Cast explícito: `p.tipo::text = $2` |

---

## 5. Pendência externa (bloqueada em você)

O workflow de CI `.github/workflows/db.yml` **existe localmente mas não sobe**: o GitHub rejeita o push porque o seu Personal Access Token não tem o escopo `workflow`.

**Como resolver:** GitHub → Settings → Developer settings → Personal access tokens → marque `workflow` → atualize o token. Depois: `git add .github && git commit && git push`.

---

## 6. Convenções mantidas em todo o backend

- **Commits no seu nome apenas** (`igor.rodrigues@sou.inteli.edu.br`), sem *co-author*.
- **Idioma:** código, rotas e mensagens de erro em português.
- **Erro:** envelope `{ codigo, erro, mensagem, detalhes, requisicao_id }`.
- **Concorrência:** todo `PATCH` exige `If-Match` (ETag = `xmin`) → `428` se ausente, `409` se desatualizado.
- **Exclusão é lógica** (`arquivado_em`), nunca `DELETE` físico em entidade de negócio (RN035).
- **Dados calculados** (ROI, score) derivam no servidor — nunca aceitos do cliente (RN039).
