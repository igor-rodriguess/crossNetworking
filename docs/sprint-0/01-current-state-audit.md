# 01 — Auditoria do Estado Atual

**Plataforma Cross** · Sprint 0 de reestruturação para Cross Intelligence
Data da apuração: 07/08/2026
Branch auditada: `melhorias/qualidade-e-seguranca`

> Documento descritivo. Nenhuma alteração de código foi feita para produzi-lo.
> Todos os números vêm de contagem direta no repositório — quando um dado não
> pôde ser verificado no código, isso está dito explicitamente.

---

## 1. Dimensão verificada

| Indicador | Valor apurado | Como foi apurado |
|---|---|---|
| Módulos de backend | 15 | pastas em `backend/src/modules` |
| Rotas declaradas | 229 | contagem de `router.<verbo>(` por arquivo `*.routes.ts` |
| Páginas de frontend | 21 | arquivos em `frontend/src/pages` |
| Rotas de frontend | 20 + login | `frontend/src/App.tsx` |
| Itens no menu lateral | 13 | `frontend/src/components/AppShell.tsx` |
| Migrations | 54 | `backend/database/migrations/*.sql` |
| `CREATE TABLE` nas migrations | 91 | varredura regex nas migrations |
| Triggers / funções | 9 / 10 | varredura regex nas migrations |
| Views | 0 | varredura regex nas migrations |
| Tabelas com RLS | 0 | zero `ENABLE ROW LEVEL SECURITY`, zero `CREATE POLICY` |
| Agentes de IA (arquivos `*.agent.ts`) | 13 | `backend/src/modules/agentes` |
| Arquivos de teste (backend) | 21 | `*.test.ts` em `backend/src` |

> **Nota sobre divergência com a documentação vigente.** O `SAD.md` e o
> `ARQUITETURA_INFRAESTRUTURA.md` citam 234 rotas e 118 tabelas. A contagem
> direta encontra 229 rotas e 91 `CREATE TABLE`. A diferença de tabelas é
> esperada e não é erro: o documento conta tabelas **no banco em operação**
> (incluindo as criadas por `CREATE TABLE` dentro de blocos `DO $$`, tabelas de
> catálogo e o controle de migrations), enquanto esta auditoria conta declarações
> literais no SQL. Os dois números medem coisas diferentes; para efeito de poda,
> o que importa é o mapa de módulos abaixo, não o total.

---

## 2. Backend

### 2.1 Módulos e volume de rotas

| Módulo | Rotas | Papel no produto atual |
|---|---:|---|
| `inteligencia` | 38 | Perfil estratégico, ativos, públicos, territórios, praças |
| `agentes` | 26 | Pipeline de IA, RAG, importação assistida, Human Gate |
| `execucao` | 26 | Planos, etapas, entregas, reuniões, touchpoints, pendências |
| `metodologias` | 26 | Crossability, Paper, Score Card, decisões |
| `resultados` | 18 | Indicadores, medições, ROI, encerramento |
| `projetos` | 16 | Projetos, briefings, planejamentos, frentes |
| `parcerias` | 15 | Parceria fechada, negociação, contrapartidas, contratos |
| `clientes` | 13 | Clientes Cross, contratos, remuneração |
| `partes` | 13 | Organizações e pessoas, contatos, papéis, ativos |
| `frentes` | 11 | Frentes de oportunidade e candidaturas |
| `governanca` | 9 | Auditoria, evidências, fontes |
| `admin` | 7 | Usuários, escopo por cliente |
| `auth` | 5 | Login, refresh, logout |
| `documentos` | 5 | Documentos vinculados a partes |
| `docs` | 1 | Swagger UI |
| **Total** | **229** | |

### 2.2 Arquitetura de camadas

O padrão está aplicado de forma consistente em todos os módulos:

```
routes → controller → service → repository → banco
```

- `routes` declara caminho, middleware de autorização e schema Zod de entrada
- `controller` traduz HTTP (status, ETag, paginação); não carrega regra
- `service` concentra regra de negócio e transação
- `repository` executa SQL parametrizado

Infraestrutura compartilhada em `backend/src/shared` (15 arquivos): pool de
conexão, autorização por persona, escopo por cliente, tratamento de erro,
contexto de requisição, métricas, paginação, lock otimista, senha e token.

**Avaliação:** a separação é boa e não precisa ser refeita. É uma base adequada
para receber o Agent Framework sem reescrita.

### 2.3 Segurança

Verificado no código:

- Autenticação JWT (acesso + refresh), senha com scrypt e comparação em tempo
  constante contra hash-dummy quando o usuário não existe
- Autorização por persona em `shared/middleware/authz.ts`
- Escopo por cliente em `shared/escopo.ts`, centralizado na função de banco
  `cross_core.usuario_pode_ver_cliente()`
- `helmet`, CORS por origem explícita, rate limit (300 req/min), corpo limitado
- Papel de banco de privilégio mínimo (`cross_app`) separado do papel de migration
- Auditoria imutável (`REVOKE UPDATE, DELETE`)

**Nenhum destes pontos deve ser tocado na Sprint 0.**

---

## 3. Frontend

### 3.1 Páginas existentes (21)

| Página | Linhas | Rota | No menu? |
|---|---:|---|---|
| `Dashboard.tsx` | 307 | `/` | Sim |
| `Oportunidades.tsx` | 236 | `/oportunidades` | Sim |
| `Conhecimento.tsx` | 112 | `/conhecimento` | Sim |
| `Partes.tsx` | 276 | `/partes` | Sim |
| `ParteDetalhe.tsx` | 653 | `/partes/:id` | Detalhe |
| `Marcas.tsx` | 122 | `/marcas` | Sim |
| `ScoreCard.tsx` | 357 | `/marcas/:candidaturaId` | Detalhe |
| `Artistas.tsx` | 402 | `/artistas` | Sim |
| `Projetos.tsx` | 238 | `/projetos` | Sim |
| `ProjetoDetalhe.tsx` | 697 | `/projetos/:id` | Detalhe |
| `Frentes.tsx` | 291 | `/frentes` | Sim |
| `Criterios.tsx` | 235 | `/criterios` | Sim |
| `Ranking.tsx` | 150 | `/ranking` | Sim |
| `Cronograma.tsx` | 204 | `/cronograma` | Sim |
| `ParceriaDetalhe.tsx` | 341 | `/parcerias/:id` | Detalhe |
| `Resumo.tsx` | 239 | `/resumo` | Sim |
| `Usuarios.tsx` | 317 | `/usuarios` | Sim |
| `ImportarDados.tsx` | 331 | `/importar` | Sim |
| `Login.tsx` | 192 | `/login` | — |
| **`Funil.tsx`** | **379** | **`/funil`** | **NÃO — órfã** |
| **`Clientes.tsx`** | **97** | **`/clientes`** | **NÃO — órfã** |

### 3.2 Achado: duas páginas já órfãs da navegação

`/funil` (379 linhas) e `/clientes` (97 linhas) têm rota registrada em
`App.tsx` e continuam acessíveis por URL direta, mas **não aparecem no menu**.

- `/clientes` ainda é alcançável: o seletor de cliente navega para lá quando a
  conta não tem `parteId` (`AppShell.tsx`, no `onClick` da lista)
- `/funil` não tem nenhum ponto de entrada na interface

São candidatas naturais de poda — já estão meio podadas, sem decisão registrada.

### 3.3 Achado crítico: dados mock em caminho de produção

A documentação vigente (`SAD.md` §5) afirma que "o estado de domínio vem
inteiramente da API (não há mock em produção)". **A verificação contradiz isso.**

Cinco arquivos importam de `src/data/mock*`:

| Arquivo | O que importa | Impacto |
|---|---|---|
| `store/useStore.ts` | `CLIENTES`, `MARCAS` | Reexporta para lookups |
| `store/useStore.ts` | `FRENTES`, `PERFIS_ARTISTAS`, `PROJETOS` | Reexporta |
| `data/mock-plataforma.ts` | `MARCAS` | Base do mock |
| **`pages/Partes.tsx`** | **`PARCERIAS`** | **Conta parcerias por marca na tela** |
| **`pages/ParteDetalhe.tsx`** | **`PARCERIAS`** | **Exibe parcerias da parte** |

Em `Partes.tsx:132`, o contador de parcerias exibido ao usuário é calculado
iterando o array mock `PARCERIAS`, não dados da API.

**Consequência para a Sprint 0:** há números na interface que não correspondem
ao banco. Isso precisa ser resolvido antes de qualquer decisão de produto
baseada no que a tela mostra — e é um risco de credibilidade se alguém da Cross
estiver lendo esses contadores como reais. Registrado como item de Fase B.

### 3.4 Cobertura de API pelo frontend

O frontend consome **59 endpoints distintos** dos 229 declarados (~26%).

Módulos de backend **sem nenhuma referência** no código do frontend:

| Módulo | Rotas | Referências no front |
|---|---:|---:|
| `execucao` | 26 | 0 |
| `resultados` | 18 | 0 |
| `governanca` | 9 | 0 |
| `documentos` | 5 | 0 |

Total: **58 rotas sem consumidor de interface**.

Os módulos `metodologias` e `inteligencia` aparecem como "0 referências" numa
busca pelo prefixo `/metodologias` e `/inteligencia` apenas porque suas rotas
são montadas em caminhos de recurso (`/candidaturas/:id/...`, `/partes/:id/...`),
não sob um prefixo de módulo. Ambos **são consumidos** — conforme a lista de 59
endpoints. Não confundir com os quatro módulos acima, que de fato não têm
consumidor.

---

## 4. Banco de dados

### 4.1 Schemas por domínio (10)

| Schema | Responsabilidade | Situação na nova visão |
|---|---|---|
| `cross_core` | Partes, usuários, papéis, documentos | Núcleo |
| `cross_intelligence` | Perfil estratégico, ativos, públicos, territórios | Núcleo |
| `cross_ai` | Execuções de agentes, oportunidades, RAG | Núcleo |
| `cross_methodologies` | Crossability, Paper, Score Card, decisões | Núcleo |
| `cross_projects` | Projetos, frentes, candidaturas | Núcleo, a simplificar |
| `cross_commercial` | Clientes, contratos, remuneração | Parcial |
| `cross_governance` | Auditoria, evidências, fontes | Núcleo (evidências) |
| `cross_partnerships` | Parcerias, contratos, contrapartidas | Periférico |
| `cross_execution` | Planos, entregas, reuniões, pendências | Periférico |
| `cross_analytics` | Indicadores, medições, ROI, encerramento | Periférico |

### 4.2 Regras de negócio no banco

Confirmadas nas migrations — **nenhuma pode ser removida nesta sprint**:

| Regra | Mecanismo |
|---|---|
| RN022 — Score Card exige Paper validado | `trg_avaliacao_validar_validacao_aprovada` |
| RN023 — score = Σ pontuações + potencial | `fn_validar_score_total` (constraint trigger) |
| RN026 — parceria exige decisão aprovada | `trg_parceria_validar_aprovacao` |
| RN034 — um encerramento por projeto/parceria | `uq_encerramento_*` |
| RN037 — auditoria imutável | `REVOKE UPDATE, DELETE` |

### 4.3 RLS

Confirmado: **zero** ocorrências de `ENABLE ROW LEVEL SECURITY` e **zero**
`CREATE POLICY` em 54 migrations. Existe uma migration `018_rls.sql`, mas ela
não habilita RLS — a função de decisão existe, as políticas não.

O isolamento entre clientes depende inteiramente da camada de serviço.

---

## 5. Camada de IA — o achado mais relevante da auditoria

A infraestrutura de IA está **substancialmente mais construída** do que a
documentação sugere. Isto muda a natureza da Sprint 0: não se trata de preparar
terreno vazio, e sim de **consolidar e organizar o que já existe**.

### 5.1 Agentes implementados (13)

| Agente | Linhas | Etapa do pipeline conceitual |
|---|---:|---|
| `search-planning.agent.ts` | 110 | Planning |
| `market-discovery-planning.agent.ts` | 149 | Planning |
| `source-collector.agent.ts` | 65 | Collect |
| `source-credibility.agent.ts` | 100 | Credibility |
| `fact-verifier.agent.ts` | 68 | Verification |
| `entity-resolver.agent.ts` | 101 | Entity Resolution |
| `information-extractor.agent.ts` | 333 | Extraction |
| `crossability-reasoning.agent.ts` | 270 | Crossability Reasoning |
| `opportunity-qualification.agent.ts` | 289 | Reasoning/Qualification |
| `recommendation.agent.ts` | 70 | Recommendation |
| `part-enrichment.agent.ts` | 170 | Enriquecimento |
| `csv-mapping.agent.ts` | 180 | Importação assistida |
| `historical-funnel.agent.ts` | 195 | Importação assistida |

**O pipeline conceitual do briefing já está implementado de ponta a ponta.**
Existe rota dedicada para cada etapa (`POST /agentes/search-planning`,
`/source-collector`, `/source-credibility`, `/fact-verifier`,
`/entity-resolver`, `/information-extractor`, `/crossability-reasoning`,
`/recommendation`, `/human-gate`).

### 5.2 Infraestrutura compartilhada

| Componente | Arquivo | Linhas | Situação |
|---|---|---:|---|
| Cliente LLM plugável | `shared/llm.ts` | 187 | OpenAI, DeepSeek, Ollama; timeout obrigatório; fallback local |
| Embeddings | `shared/embeddings.ts` | 86 | 1536 dims |
| Firecrawl | `shared/firecrawl.ts` | 325 | Coleta web |
| Busca web | `shared/web-search.ts` | 239 | — |
| Concorrência | `shared/concorrencia.ts` | 31 | — |
| RAG | `rag.service.ts` + `rag.repository.ts` | 133 | pgvector, índice HNSW |

O `agentes.service.ts` tem **2.153 linhas** — de longe o maior arquivo do
backend. É o principal candidato a decomposição na Fase E.

### 5.3 Persistência e observabilidade já existentes

| Tabela | O que registra |
|---|---|
| `cross_ai.execucao_agente` | agente, status, origem (real/mock), entrada, saída, erro, **tokens_entrada**, **tokens_saida**, **duracao_ms**, autor, vínculo a projeto/frente |
| `cross_ai.tarefa_pipeline` | pipeline assíncrono: status, etapa atual, histórico de etapas, progresso 0–100, resultado, execução-pai |
| `cross_ai.oportunidade_ia` | rascunho de oportunidade: score_fit, confiança, **fontes**, briefing, status (`rascunho`/`em_curadoria`/`aprovada`/`descartada`) |
| `cross_ai.documento_rag` | chunk + embedding(1536) + origem + metadados + marca real/mock |

### 5.4 Human Gate

Implementado e protegido por decisão de arquitetura registrada nas migrations:
`034_agente_human_gate.sql`, `039_oportunidades_ia.sql` e `042_tarefa_pipeline.sql`
declaram explicitamente que nada entra no domínio sem decisão humana. A rota
`POST /agentes/human-gate` existe.

**Não tocar.** É requisito não-negociável do produto novo.

---

## 6. Principais fluxos hoje

**Fluxo 1 — Operação manual (o produto antigo).**
Cliente → Projeto → Frente → Candidatura → Score Card → Decisão → Parceria →
Execução → Resultados. Coberto por rotas em todos os 15 módulos; a cauda
(execução/resultados) **não tem interface**.

**Fluxo 2 — Descoberta assistida por IA (já existe).**
Disparo de pipeline (`/agentes/partner-discovery/async`) → tarefa assíncrona com
progresso → oportunidades em rascunho → curadoria na página `/oportunidades` →
Human Gate. Este fluxo **é** o núcleo do produto novo.

**Fluxo 3 — Importação assistida.**
CSV → agente de mapeamento → confirmação humana → carga. Usado para trazer a
operação histórica da Cross.

---

## 7. Dependências principais

**Produção (backend, 11 pacotes):** `express`, `pg`, `zod`, `helmet`, `cors`,
`express-rate-limit`, `pino`, `pino-http`, `pg-copy-streams`,
`swagger-ui-express`, `dotenv`. Superfície pequena — sem vulnerabilidade
conhecida segundo `npm run audit:prod` integrado à esteira.

**Externas de IA (todas opcionais):** OpenAI, DeepSeek, Ollama, Firecrawl. Sem
chave, o sistema opera em modo determinístico.

**Banco:** PostgreSQL 16 + `pgcrypto`, `unaccent`, `pg_trgm`, `pgvector`.

---

## 8. Síntese da auditoria

**O que está bem e não deve ser mexido:** camadas do backend, segurança,
auditoria imutável, regras de negócio no banco, Human Gate, infraestrutura de
agentes.

**O que está desalinhado com a nova visão:** a interface expõe um fluxo
operacional linear (projeto → frente → parceria → execução) que deixa de ser o
eixo do produto, enquanto o fluxo de inteligência — que já funciona — ocupa
apenas 2 dos 13 itens de menu.

**O que precisa de decisão:** 58 rotas sem consumidor de interface, 2 páginas já
órfãs, mocks em caminho de produção, e um `agentes.service.ts` de 2.153 linhas
que concentra o que deveria ser o Agent Framework.

**Continua em:** `02-product-pruning-matrix.md`.
