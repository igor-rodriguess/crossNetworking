# 08 — Análise de Lacunas das Três Jornadas

**Plataforma Cross** · Sprint 0B
Data: 07/08/2026

> Avaliação do quanto a arquitetura existente atende cada jornada. Nada
> implementado.

---

## Resumo

| Jornada | Classificação | Bloqueador principal |
|---|---|---|
| **A — Cliente → Parceiro** | **PARTIAL** | Metodologia Cross não participa do julgamento |
| **B — Parceiro → Cliente** | **BLOCKED** | Reunião exige `parceria_id`; não há busca reversa |
| **C — Prospecção do zero** | **PARTIAL** | Peças existem, jornada não montada |

Nenhuma está READY. Uma está bloqueada por modelo de dados.

---

## Jornada A — Cliente → Parceiro

*"Temos a Aramis. Quem deveria ser parceiro dela?"*

### Classificação: **PARTIAL**

### O que já funciona

| Capacidade | Onde | Estado |
|---|---|---|
| Conhecimento do cliente | `cross_intelligence` (38 rotas) | READY |
| Planning a partir das frentes reais | `market-discovery-planning.agent.ts` | READY |
| Coleta externa | DuckDuckGo → Firecrawl | READY |
| Filtro de credibilidade | `source-credibility.agent.ts` | READY |
| Extração de perfis | `information-extractor.agent.ts` | READY |
| Dedupe contra a base | `entity-resolver.agent.ts` | READY |
| Avaliação das 6 dimensões | heurística com evidência externa | PARTIAL |
| Ranking | `recommendation.agent.ts` | READY |
| Persistência como rascunho | `oportunidade_ia` | READY |
| Curadoria | `Oportunidades.tsx` + status | READY |
| Execução assíncrona com progresso | `tarefa_pipeline` | READY |

**É a jornada mais madura — roda hoje, de ponta a ponta.**

### O que falta

| # | Lacuna | Impacto |
|---|---|---|
| 1 | **A metodologia Cross não participa do julgamento** | O sistema encontra marcas plausíveis, mas não as avalia *como a Cross avaliaria*. O RAG está desligado neste pipeline (`04` §Evidência 1) e o reasoning é template sobre flags |
| 2 | Fact Verifier não executa | Fatos que sustentam a oportunidade não são corroborados |
| 3 | Data de publicação não capturada | Compromete a dimensão *momento estratégico* |
| 4 | Sem rastreio dimensão → fonte | Curadoria decide sem ver o que sustenta cada dimensão |
| 5 | Confiança limitada a 75 por construção | Teto conservador correto, mas nunca haverá alta confiança sem mudar a abordagem |
| 6 | Coleta frágil (scraping DDG) | Quebra silenciosa |

### O que a tornaria READY

Ligar a metodologia ao julgamento — sem descaracterizar a separação
"evidência externa ≠ conhecimento interno". O caminho sugerido: o RAG entra como
**critério de avaliação** ("como a Cross julga fit de moda masculina"), nunca
como **prova da existência** do parceiro. Requer discussão antes de execução.

---

## Jornada B — Parceiro → Cliente

*"Reunião com a Converse. Para quais clientes isso serve?"*

### Classificação: **BLOCKED**

### Bloqueador 1 — Reunião exige parceria fechada

Confirmado na auditoria da Sprint 0A e reconfirmado aqui: as 6 rotas de reunião
vivem em `modules/execucao`, todas sob `/parcerias/:id/reunioes`:

```
POST /parcerias/:id/reunioes
GET  /parcerias/:id/reunioes
GET  /reunioes/:id
PATCH /reunioes/:id
POST /reunioes/:id/participantes
DELETE /reunioes/:id/participantes/:participanteId
```

A tabela vive em `cross_execution`, o schema da execução de parcerias já
fechadas.

**Consequência:** uma reunião com a Converse — que não é parceira de nenhum
cliente — **não tem onde ser registrada**. Não é limitação de interface: é o
modelo de dados. O ponto de entrada da jornada B não existe.

### Bloqueador 2 — Não há busca reversa parceiro → clientes

Todo o pipeline é unidirecional: parte de um `cliente` e busca parceiros.
`GerarOportunidadesInput` exige `cliente`. A `oportunidade_ia` tem
`cliente_nome` **obrigatório** ([migration 039](backend/database/migrations/039_oportunidades_ia.sql#L9)).

Não existe função que receba um parceiro e retorne clientes compatíveis. Seria
necessário:
- iterar sobre os clientes da base
- rodar Crossability de cada um contra o parceiro
- ranquear clientes, não parceiros

**Nenhuma dessas peças existe.** O `recommendation.agent` ranqueia candidatos
dentro de um cliente.

### Bloqueador 3 — Não há estruturação de reunião

Nenhum agente transforma ata/transcrição em fatos estruturados. O
`information-extractor` extrai de **página web** (via Firecrawl), não de texto
livre de reunião.

### O que existe e seria reaproveitado

| Peça | Reaproveitável? |
|---|---|
| `entity-resolver` | **Sim** — resolveria "Converse" contra a base |
| RAG | **Sim** — indexaria o conteúdo da reunião |
| `crossability-reasoning` (LLM) | **Sim** — avaliaria fit, invertendo os papéis |
| `oportunidade_ia` | **Parcial** — exigiria `cliente_nome` opcional ou múltiplo |
| Human Gate | **Sim** |

### O que falta

| # | Lacuna | Tipo |
|---|---|---|
| 1 | Reunião como evento ligado a **Parte** | **Modelo de dados** |
| 2 | Agente de estruturação de reunião | Novo agente |
| 3 | Busca reversa parceiro → clientes | Nova orquestração |
| 4 | `oportunidade_ia` com origem "reunião" | Modelo |
| 5 | Ranking de clientes | Extensão do recommendation |

**A jornada B é a mais distante das três.** Exige mudança de modelo (fora do
escopo da Sprint 0), um agente novo e uma orquestração invertida.

---

## Jornada C — Prospecção do zero

*"Queremos abordar a marca X e não sabemos quase nada sobre ela."*

### Classificação: **PARTIAL**

### O que já existe

Praticamente todas as peças:

| Capacidade | Onde |
|---|---|
| Planning de pesquisa livre | `search-planning.agent.ts` |
| Coleta web | DuckDuckGo + Firecrawl |
| Credibilidade | `source-credibility.agent.ts` |
| Extração de perfil | `information-extractor.agent.ts` |
| Resolução de entidade | `entity-resolver.agent.ts` |
| Enriquecimento de Parte | `part-enrichment.agent.ts` |
| Pipeline dedicado | `market_intelligence` (com `entidade_foco`) |
| RAG | consultado **neste** pipeline |
| Crossability com LLM | **usada neste pipeline** |

**A jornada C é a única que hoje usa LLM e RAG no reasoning.**

### O que falta

| # | Lacuna | Impacto |
|---|---|---|
| 1 | **Não persiste oportunidade** | `market_intelligence` devolve análise na resposta HTTP; nada fica registrado como rascunho curável |
| 2 | Planning cai em mock com Ollama | Etapa 1 não raciocina na config padrão |
| 3 | Sem interface dedicada | Não há tela para "pesquisar uma marca do zero" |
| 4 | Escopo do briefing (notícias, campanhas, eventos, desafios) parcialmente coberto | A extração é genérica |
| 5 | Enriquecimento sem Human Gate claro | `part-enrichment` escreve em Parte; não passa por `decidirHumanGate` |

### O que a tornaria READY

Menor esforço das três: persistir o resultado como `oportunidade_ia` (ou entidade
equivalente), expor uma tela de entrada e auditar o caminho de escrita do
enriquecimento. **Nenhuma mudança de modelo é necessária.**

---

## Comparativo

| Capacidade | A | B | C |
|---|---|---|---|
| Ponto de entrada existe | ✅ | ❌ | ⚠️ (sem tela) |
| Pipeline roda hoje | ✅ | ❌ | ✅ |
| Usa LLM no reasoning | ❌ | — | ✅ |
| Usa RAG | ❌ | — | ✅ |
| Persiste rascunho | ✅ | ❌ | ❌ |
| Human Gate aplicável | ✅ | ❌ | ⚠️ |
| Exige mudança de modelo | ❌ | ✅ | ❌ |
| **Classificação** | **PARTIAL** | **BLOCKED** | **PARTIAL** |

---

## Ordem recomendada de evolução

1. **Jornada C → READY.** Menor esforço, sem mudança de modelo. Persistir
   resultado + tela + auditar enriquecimento.
2. **Jornada A → READY.** Ligar metodologia ao julgamento (decisão de
   arquitetura a discutir) + Fact Verifier + data de publicação.
3. **Jornada B → PARTIAL.** Exige migration de reunião ligada a Parte — a
   primeira coisa depois da Sprint 0, conforme já registrado em
   `docs/sprint-0/06` §9.

Uma observação sobre a jornada B: como ela precisa de mudança de modelo, ela é a
**única** que não pode avançar dentro das regras da Sprint 0 (que proíbem
alterar o banco). As outras duas podem.
