# 06 — Análise de Lacunas de Observabilidade e Custo

**Plataforma Cross** · Sprint 0B
Data: 07/08/2026

> Levantamento apenas. Nada foi implementado.

---

## 1. Tabela consolidada

| Campo | Situação | Onde está / o que falta |
|---|---|---|
| `model` | **NÃO EXISTE** | `origem` guarda o **provedor** (`openai`, `ollama`, `mock`, `heuristica`), nunca o modelo (`gpt-4o-mini`, `qwen3:4b`) |
| `provider` | **EXISTE** | `execucao_agente.origem` |
| `input_tokens` | **PARCIAL** | Coluna `tokens_entrada` existe e é preenchida nas **rotas individuais**; **zerada no pipeline** (§2) |
| `cached_tokens` | **NÃO EXISTE** | Nem coluna, nem captura — `llm.ts` não lê `prompt_tokens_details` |
| `output_tokens` | **PARCIAL** | Idem `input_tokens` |
| `tool_calls` | **NÃO EXISTE** | Nenhum registro de chamada de ferramenta |
| `web_search_calls` | **NÃO EXISTE** | A coleta não contabiliza buscas; só o total de resultados |
| `scraping_usage` | **NÃO EXISTE** | Firecrawl não registra páginas raspadas nem créditos |
| `latency` | **PARCIAL** | Coluna `duracao_ms` existe; **`undefined` no pipeline** (§2) |
| `started_at` | **PARCIAL** | `criado_em` é o instante da **gravação**, não do início |
| `finished_at` | **NÃO EXISTE** | Derivável só se `duracao_ms` estivesse preenchido |
| `estimated_cost` | **NÃO EXISTE** | Nem coluna, nem tabela de preços |
| `errors` | **EXISTE** | `status='erro'` + coluna `erro` |
| `retries` | **NÃO EXISTE** | Não há retry (ver `03` §3.2) |

**Resumo:** 2 existem · 5 parciais · 7 não existem.

---

## 2. Achado central: o pipeline descarta o que a infraestrutura coleta

Esta é a lacuna mais importante do documento, e é de **implementação, não de
modelo de dados**.

A tabela `execucao_agente` tem as colunas certas (`tokens_entrada`,
`tokens_saida`, `duracao_ms`). O cliente LLM **captura** os tokens corretamente,
normalizando formatos OpenAI e Ollama
([llm.ts:196-200](backend/src/modules/agentes/shared/llm.ts#L196-L200)):

```ts
tokens: {
  entrada: json.usage?.prompt_tokens ?? json.prompt_eval_count ?? 0,
  saida: json.usage?.completion_tokens ?? json.eval_count ?? 0,
}
```

Mas o helper que o pipeline usa para auditar **joga fora esses dados**
([agentes.service.ts:1744-1759](backend/src/modules/agentes/agentes.service.ts#L1744-L1759)):

```ts
async function auditarAgente(input: AuditoriaAgenteInput): Promise<string> {
  return withTransaction((client) =>
    repo.registrarExecucao(client, {
      agente: input.agente,
      status: input.status ?? "sucesso",
      origem: input.origem,
      entrada: input.entrada,
      saida: input.saida,
      erro: input.erro,
      duracaoMs: undefined,        // ← sempre undefined
      criadoPorId: input.usuarioId,
      // tokensEntrada e tokensSaida NÃO são passados → default 0
      ...
    })
  );
}
```

`AuditoriaAgenteInput` **não tem campos de token**. As nove chamadas de
`auditarAgente()` dentro de `executarPipeline()` gravam, portanto:

- `tokens_entrada = 0`
- `tokens_saida = 0`
- `duracao_ms = NULL`

**Mesmo com chave paga da OpenAI, toda execução de pipeline registrará consumo
zero.**

### Onde os tokens *são* gravados

Nas rotas individuais de etapa, que usam outro caminho
(linhas [94-95](backend/src/modules/agentes/agentes.service.ts#L94), 369-370,
462-463, 642-643):

```ts
tokensEntrada: tokens?.entrada ?? 0,
tokensSaida: tokens?.saida ?? 0,
```

Ou seja: `POST /agentes/search-planning` grava tokens; o mesmo agente rodando
dentro do pipeline, não.

**Consequência prática:** a única forma de medir consumo real hoje seria pelo
painel de faturamento do provedor — sem atribuição por cliente, projeto ou
pipeline.

---

## 3. O que existe e funciona

| Capacidade | Onde |
|---|---|
| Auditoria por etapa | `execucao_agente`, um registro por agente |
| Entrada e saída completas | JSONB `entrada` / `saida` |
| Distinção real vs. mock | `origem` |
| Erro com mensagem | `status` + `erro` |
| Vínculo ao domínio | `projeto_id`, `frente_id`, `criado_por_id` |
| Progresso observável | `tarefa_pipeline` (etapa, histórico, 0–100) |
| Status do Human Gate | `oportunidade_ia.status` |
| Índices para consulta | `(agente, criado_em DESC)`, `(status, criado_em DESC)` |
| Listagem paginada | `GET /agentes/execucoes` |

**A fundação está correta.** O modelo de dados foi bem pensado; falta preencher.

---

## 4. Lacuna relacional: não há `execucao_pai_id`

`execucao_agente` não tem coluna que ligue uma etapa à execução-pai do pipeline.
O vínculo existe apenas:

- no JSONB `tarefa_pipeline.etapas[].execucao_id`
- em `oportunidade_ia.execucao_pipeline_id`

**Consequência:** não é possível responder em SQL simples *"qual foi o custo
total do pipeline X?"* — seria preciso varrer JSONB para descobrir quais
execuções pertencem a ele.

Para agregação de custo por pipeline, cliente ou período, **esta coluna é
pré-requisito**.

---

## 5. Sem contabilização de ferramentas externas

| Ferramenta | Uso hoje | Registro |
|---|---|---|
| DuckDuckGo | 1 requisição por consulta (+1 no fallback GET) | **Nenhum** |
| Firecrawl (busca) | fallback quando DDG vazio | **Nenhum** |
| Firecrawl (scraping) | conteúdo de página na extração | **Nenhum** |
| OpenAI embeddings | 1 chamada por ingestão/busca de RAG | **Nenhum** |

Firecrawl e embeddings **são cobrados por uso**. Hoje não há como saber quantas
páginas foram raspadas numa execução.

O `execucao_agente` do `source_collector` guarda `total_consultas` e
`total_resultados` na saída — proxy útil, mas não é contabilização de chamada
nem de crédito consumido.

---

## 6. O que entra em custo quando as chaves forem ligadas

| Componente | Provedor | Vetor de custo | Instrumentado? |
|---|---|---|---|
| Information Extractor | LLM | 1 chamada por URL | **Não** |
| Crossability (market_intelligence) | LLM | 1 chamada **por candidato** | **Não** |
| Search Planning | LLM | 1 por execução | Só na rota isolada |
| CSV Mapping | LLM | 1 por importação | Só na rota isolada |
| Embeddings | OpenAI | 1 por trecho ingerido + 1 por busca | **Não** |
| Firecrawl | Firecrawl | 1 por página | **Não** |

O maior risco é o **Crossability em `market_intelligence`**: uma chamada de LLM
por candidato, com `mapearComLimite` em janela de 4. Uma execução com 20
candidatos = 20 chamadas, sem registro de consumo.

---

## 7. Onde cada lacuna deveria entrar (especificação, não implementação)

**Colunas aditivas em `cross_ai.execucao_agente`:**

| Coluna | Tipo | Preenchida por |
|---|---|---|
| `modelo` | `VARCHAR(80)` | `ResultadoLLM` (exige expor o modelo em `llm.ts`) |
| `tokens_cache` | `INTEGER DEFAULT 0` | `prompt_tokens_details.cached_tokens` |
| `custo_estimado` | `NUMERIC(12,6)` | cálculo a partir de modelo + tokens |
| `iniciado_em` | `TIMESTAMPTZ` | início real da etapa |
| `finalizado_em` | `TIMESTAMPTZ` | fim real |
| `execucao_pai_id` | `UUID FK` | id da execução-pai (§4) |

**Nova tabela `cross_ai.uso_ferramenta`:**

```
id · execucao_id (FK) · ferramenta ('firecrawl_scrape' | 'web_search' | 'embeddings')
· chamadas · unidades · custo_estimado · criado_em
```

**Tabela de preços por modelo**, para que `custo_estimado` seja calculável e
auditável sem código.

**Correção de implementação (a mais barata e de maior retorno):** estender
`AuditoriaAgenteInput` com `tokens` e `duracaoMs`, e passar os valores nas nove
chamadas dentro de `executarPipeline()`. Isso sozinho ativa três campos que já
têm coluna.

---

## 8. Prioridade

| # | Lacuna | Esforço | Impacto |
|---|---|---|---|
| 1 | `auditarAgente` descarta tokens e duração | **Baixo** | **Alto** — sem isso, nada é medido |
| 2 | `execucao_pai_id` | Baixo | Alto — habilita agregação |
| 3 | Registrar `modelo` | Baixo | Alto — custo depende do modelo |
| 4 | `uso_ferramenta` (Firecrawl, embeddings) | Médio | Alto |
| 5 | `custo_estimado` + tabela de preços | Médio | Alto |
| 6 | `cached_tokens` | Baixo | Médio |
| 7 | `iniciado_em` / `finalizado_em` | Baixo | Médio |

**O item 1 é pré-requisito de todos os demais e não exige migration.**

**Continua em:** `07-golden-path-validation.md`.
