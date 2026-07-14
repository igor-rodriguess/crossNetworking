# Relatório de Continuidade — Backend Plataforma Cross

**Data:** 14/07/2026
**Branch:** `main` (sincronizada com o GitHub até `7c5328e`)
**Estado geral:** 128 rotas implementadas e testadas · 118 testes de integração verdes · typecheck limpo

---

## 1. Onde o projeto está

### Banco de dados (Supabase — 100% pronto)

24 migrations aplicadas, todas versionadas com checksum SHA-256. A última (`024_closure_uniqueness.sql`) foi aplicada hoje e fecha a RN034 (no máximo um encerramento por projeto/parceria) e o período das medições (RN030).

O banco carrega as regras críticas como triggers, não só a aplicação:

| Regra | Onde vive |
|---|---|
| RN026 — parceria exige decisão aprovada **e** Paper validado | `trg_parceria_validar_aprovacao` |
| RN022 — Score Card exige validação de Paper aprovada | `trg_avaliacao_validar_validacao_aprovada` |
| RN023 — score = Σ pontuações + potencial disruptivo | `fn_validar_score_total` (constraint trigger diferida) |
| RN037 — auditoria imutável | `REVOKE UPDATE, DELETE` sobre `cross_governance.auditoria` |

### Rotas implementadas (128)

| Módulo | Rotas | RFs | Testes |
|---|---:|---|---|
| Partes | 12 | RF004–008 | ✅ |
| Documentos | 2 | RF009 | ✅ |
| Clientes & Contratos | 13 | RF016–018 | ✅ |
| Admin & Catálogos | 6 | RF002, RN018 | ✅ |
| Projetos | 16 | RF019–023 | ✅ |
| Frentes & Candidaturas | 11 | RF024–026 | ✅ |
| Metodologias | 26 | RF027–033 | ✅ |
| Parcerias | 15 | RF034–037 | ✅ |
| Execução | 26 | RF038–042 | ✅ |
| Docs (OpenAPI/Swagger) | 1 | — | — |

Cada módulo segue o mesmo formato de 6 arquivos: `schema.ts` (zod) → `repository.ts` (SQL) → `service.ts` (regras + transação) → `controller.ts` (HTTP) → `routes.ts` (rotas + OpenAPI) → `test.ts` (Supertest contra o Supabase real).

---

## 2. O que falta (≈51 rotas, 3 módulos)

### 2.1 Resultados & Acompanhamento (RF043–047) — **EM ANDAMENTO**

⚠️ **Existe um arquivo já escrito e não commitado:** `backend/src/modules/resultados/resultados.schema.ts`. Ele está completo e válido — é o ponto de partida. Faltam os outros 5 arquivos do módulo.

Tabelas-alvo (schema `cross_analytics`, já criadas no banco): `acompanhamento`, `indicador`, `parceria_indicador`, `medicao_indicador`, `resultado`, `calculo_roi`, `encerramento_projeto`, `encerramento_parceria`.

Rotas planejadas (18):

```
POST/GET   /v1/parcerias/:id/acompanhamentos          RF043
POST/GET   /v1/indicadores                            RF044
POST/GET   /v1/parcerias/:id/indicadores              RF044 (vínculo + meta)
DELETE     /v1/parcerias/:id/indicadores/:indicadorId RF044
POST/GET   /v1/parcerias/:id/medicoes                 RF044
POST/GET   /v1/parcerias/:id/resultados               RF045
POST/GET   /v1/parcerias/:id/calculos-roi             RF046
GET        /v1/calculos-roi/:id                       RF046
POST/GET   /v1/projetos/:id/encerramento              RF047
POST/GET   /v1/parcerias/:id/encerramento             RF047
```

**Cuidado importante (RN033 + RN039):** o campo `roi` **não pode ser aceito do cliente**. O servidor calcula `roi = (retorno − investimento) / investimento`, usando os valores *realizados* quando existirem, senão os *estimados*. O schema já reflete isso (não expõe `roi` na entrada). Cada cálculo é um registro histórico independente — nunca faça `UPDATE` em `calculo_roi`.

### 2.2 Inteligência Estratégica (RF010–015) — ~22 rotas

Perfil estratégico versionado, mapeamento de mídia, Big Moments, territórios, ativos e busca estratégica. Schema `cross_intelligence`. Consulte `backend/database/migrations/00{7,8}_*.sql` para o DDL exato.

### 2.3 Governança & IA (RF048–051) — ~11 rotas

Fontes e evidências, consulta à trilha de auditoria (somente leitura), interações de IA. Schema `cross_governance`.

---

## 3. Como retomar (passo a passo)

```powershell
# 1. Node é portátil — sempre prefixe o PATH
$env:Path = "$env:LOCALAPPDATA\node-portable\node-v24.18.0-win-x64;$env:Path"
cd c:\Users\IgorRodrigues-CrossN\Documents\CrossNetworking\crossNetworking\backend

# 2. Confirmar que está tudo verde antes de mexer
npm run typecheck
npm test

# 3. Subir a API e ver a documentação viva
npm run dev          # http://localhost:3000/v1/docs
```

### Receita para cada novo módulo

1. Leia o DDL real: `awk '/^CREATE TABLE/,/^\);/' database/migrations/0XX_*.sql`
2. Leia os seeds do vocabulário: `grep -A8 "nome_da_tabela (codigo" database/migrations/019_seed_reference_data.sql`
3. Escreva os 6 arquivos copiando o padrão de `src/modules/execucao/` (é o mais completo).
4. Monte o router em `src/app.ts` **antes** do `errorHandler`.
5. `npm run typecheck && npx vitest run src/modules/<modulo>`
6. Commit + push.

---

## 4. Armadilhas já pagas (não repita)

| Armadilha | Como evitar |
|---|---|
| A tabela `parte` mora em **`cross_core`**, não em `cross_parties` | Sempre confira o schema real antes de escrever o JOIN |
| Helper de teste `async` quebra o `.expect()` do Supertest | Devolva o objeto `Test` (sem `async`/`await`), não uma Promise |
| `information_schema` **trava** no Supabase em loops DDL | Use `pg_catalog` |
| Conexão direta do Supabase é **IPv6-only** (não funciona na Inteli) | Use o *Session pooler* (`aws-1-us-east-2...`), já configurado no `.env` |
| `Paginacao` expõe `limit`/`offset` | Não invente `limite`/`deslocamento` |
| Enum vs. texto no Postgres | Faça cast explícito: `p.tipo::text = $2` |

---

## 5. Pendência externa (bloqueada em você)

O workflow de CI `.github/workflows/db.yml` **existe localmente mas não pode ser enviado**: o GitHub rejeita o push porque o seu Personal Access Token não tem o escopo `workflow`.

**Como resolver:** GitHub → Settings → Developer settings → Personal access tokens → marque `workflow` → atualize o token. Depois: `git add .github && git commit && git push`.

---

## 6. Convenções que devem ser mantidas

- **Commits no seu nome apenas** (`igor.rodrigues@sou.inteli.edu.br`), sem *co-author*. O histórico já foi reescrito para isso — todos os 18 commits contam no seu gráfico de contribuições.
- **Idioma:** código, rotas e mensagens de erro em português.
- **Padrão de erro:** `{ codigo, erro, mensagem, detalhes, requisicao_id }`.
- **Concorrência:** todo `PATCH` exige `If-Match` (ETag = `xmin`) → `428` se ausente, `409` se desatualizado.
- **Exclusão é lógica** (`arquivado_em`), nunca `DELETE` físico em entidade de negócio (RN035).
