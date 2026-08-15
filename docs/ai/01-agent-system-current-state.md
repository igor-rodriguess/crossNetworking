# 01 — Estado Atual do Sistema de IA

**Plataforma Cross** · Sprint 0B — Auditoria profunda de IA
Data: 07/08/2026

> Documento de leitura. Nenhum código foi alterado, nenhum agente refatorado,
> nenhuma API conectada.

---

## Veredito em uma frase

O pipeline canônico existe de ponta a ponta e é **honesto sobre o que sabe** —
mas hoje ele opera predominantemente por **heurística determinística**, não por
LLM, e o RAG **não ensina o jeito Cross de pensar** porque está vazio de
metodologia.

---

## 1. Mapa das nove etapas canônicas

| # | Etapa | Arquivo | Função | Provider real | Estado |
|---|---|---|---|---|---|
| 1 | Planning | `search-planning.agent.ts` | `planejarPesquisa()` | LLM **ou** mock forçado | **PARCIAL** |
| 1b | Planning (discovery) | `market-discovery-planning.agent.ts` | `planejarDescobertaDeMercado()` | heurística | **READY** |
| 2 | Collect | `source-collector.agent.ts` | `coletarFontes()` | DuckDuckGo → Firecrawl | **READY** |
| 3 | Credibility | `source-credibility.agent.ts` | `avaliarCredibilidade()` | heurística (sem LLM) | **READY** |
| 4 | Verification | `fact-verifier.agent.ts` | `verificarFatos()` | heurística (sem LLM) | **PARCIAL** |
| 5 | Entity Resolution | `entity-resolver.agent.ts` | `resolverEntidades()` | heurística + banco | **READY** |
| 6 | Extraction | `information-extractor.agent.ts` | `extrairInformacoes()` / `extrairCandidatasExternas()` | LLM + Firecrawl | **READY** |
| 7 | Crossability Reasoning | `crossability-reasoning.agent.ts` | `raciocinarCrossability()` **ou** `...ComEvidenciaExterna()` | LLM **ou** heurística | **PARCIAL** |
| 8 | Recommendation | `recommendation.agent.ts` | `recomendarParceiros()` | heurística (sem LLM) | **READY** |
| 9 | Human Gate | `agentes.service.ts:564` | `decidirHumanGate()` | humano | **PARCIAL** |

**Etapa extra não prevista no pipeline canônico:** `rag_retrieval`, executada
entre Entity Resolution e Crossability — **apenas no pipeline
`market_intelligence`**.

---

## 2. Detalhamento por etapa

### Etapa 1 — Planning

**Rota:** `POST /agentes/search-planning`
**Input:** `{ objetivo, contexto?, projeto_id?, frente_id? }`
**Output:** `PlanoPesquisa` — perguntas priorizadas + consultas + tipos de fonte
**Tabelas:** `cross_ai.execucao_agente`
**Prompt:** `SYSTEM` em `search-planning.agent.ts:18-40` — pede JSON estrito

**Achado crítico** ([search-planning.agent.ts:105-107](backend/src/modules/agentes/search-planning.agent.ts#L105-L107)):

```ts
if (env.aiProvider === "ollama") {
  return { plano: planoMock(input), origem: "mock" };
}
```

Com `AI_PROVIDER=ollama` — **a configuração padrão do `.env.example`** — o
Planning **nunca chama o LLM**. Devolve o stub determinístico. A decisão está
comentada e é defensável (economizar inferência local lenta), mas significa que
hoje, na configuração padrão, **a etapa 1 é mock por construção**, não por falta
de chave.

**Tratamento de erro:** validação Zod sobre a saída do LLM; timeout de 25s.
**Testes:** nenhum teste direto de `planejarPesquisa`.

### Etapa 1b — Planning de descoberta de mercado

`market-discovery-planning.agent.ts` (149 linhas), origem declarada
`"heuristica"`. É o Planning **efetivamente usado** pelo pipeline
`partner_discovery` ([agentes.service.ts:1879-1893](backend/src/modules/agentes/agentes.service.ts#L1879-L1893)).
Consulta `repo.listarFrentesParaDescoberta()` — usa as frentes reais do cliente
para montar os eixos de busca. **Testado** (`market-discovery-planning.agent.test.ts`).

### Etapa 2 — Collect

**Rota:** `POST /agentes/source-collector`
**Dependências externas:** DuckDuckGo (HTML scraping, sem chave) → Firecrawl (fallback, exige chave)
**Paralelismo:** `Promise.all` sobre as consultas

**Fragilidade estrutural:** a coleta depende de **parsing de HTML do
DuckDuckGo** por regex ([web-search.ts:96-127](backend/src/modules/agentes/shared/web-search.ts#L96-L127)),
contra `class="result__a"` e `result__snippet`. Qualquer mudança de layout do
DuckDuckGo quebra a coleta silenciosamente — retorna zero resultados, e o
pipeline segue para `insufficient_evidence` sem indicar a causa raiz. Já há um
fallback GET para contornar anti-bot (linhas 156-172), o que indica que o
problema já ocorreu.

**Testes:** nenhum teste de `coletarFontes` nem do parser de HTML.

### Etapa 3 — Credibility

Heurística pura, determinística, **sem LLM e sem custo** — decisão correta e bem
justificada no cabeçalho do arquivo: filtro barato antes de raciocínio caro.

Sinais: HTTPS (+8/−10), domínio reputado (+30, lista de 13 domínios), TLD
institucional (+15), padrões de baixa qualidade (−25), fonte de exemplo/mock
(−10), domínio ausente (−15). Base neutra 50. Níveis: ≥70 alta, ≥40 média.

**Ponto forte:** marca explicitamente fontes `exemplo` do modo mock para que não
passem por evidência real.

**Limitação:** a lista de domínios reputados é uma amostra fixa de 13 entradas,
majoritariamente brasileira e generalista. Um veículo setorial de moda ou
esporte não é reconhecido e recebe apenas score neutro.

**Testes:** 4 casos em `agentes.test.ts` — o agente **mais bem testado**.

### Etapa 4 — Verification

Heurística de corroboração: uma afirmação é `corroborada` com **2+ domínios
distintos**, `fonte_unica` com 1, `nao_confirmada` com 0. O critério de
independência por domínio é sólido.

**Achado crítico** ([agentes.service.ts:1947-1963](backend/src/modules/agentes/agentes.service.ts#L1947-L1963)):

```ts
if (input.afirmacoes?.length) { ... } else {
  etapas.push({ nome: "fact_verifier", status: "ignorada",
    observacao: "Nenhuma afirmação foi fornecida pelo chamador." });
}
```

O Fact Verifier só roda se o **chamador passar afirmações manualmente**. O
pipeline **não extrai afirmações da coleta para verificá-las**. Na prática, em
toda execução automática, **a etapa 4 é pulada**.

**Testes:** nenhum.

### Etapa 5 — Entity Resolution

Primeiro agente que toca o domínio. Normaliza nomes (remove acentos e sufixos
societários), calcula similaridade por Dice sobre bigramas + bônus de contenção.
Classifica em `nova` / `possivel_duplicata` / `ambigua`.

**Ponto forte:** roda dentro de transação, consulta `Partes` reais, deduplica
entradas antes de resolver.

**Limitação:** a busca no banco usa apenas a **primeira palavra** do nome
(`entidade.split(/\s+/)[0]`, linha 95) com limite 10. Marcas cujo nome comece
com termo genérico ("Grupo X", "Casa Y") podem não trazer a candidata correta.

**Testes:** nenhum teste direto.

### Etapa 6 — Extraction

O maior agente (333 linhas). Duas variantes: `extrairInformacoes` (market
intelligence) e `extrairCandidatasExternas` (partner discovery). Usa LLM real +
Firecrawl para conteúdo de página.

**Porta de custo** ([agentes.service.ts:1945](backend/src/modules/agentes/agentes.service.ts#L1945)):
```ts
const haFonteConfiavel = credibilidade.saida.avaliacoes.some((a) => a.score >= 70);
```
Sem nenhuma fonte com score ≥70, a extração **não roda** e o LLM é poupado.
Boa decisão de arquitetura — impede gastar inferência sobre lixo.

**Testes:** 1 caso.

### Etapa 7 — Crossability Reasoning

**Duas implementações no mesmo arquivo:**

| Função | Origem | Quando é usada |
|---|---|---|
| `raciocinarCrossability()` | LLM (`chamarLLMJson`) | `market_intelligence` |
| `raciocinarCrossabilityComEvidenciaExterna()` | `"heuristica"` | **`partner_discovery`** |

Ver [agentes.service.ts:2097-2099](backend/src/modules/agentes/agentes.service.ts#L2097-L2099).

O pipeline principal de descoberta de parceiros — o produto — usa a versão
**heurística, sem LLM nenhum**. É uma máquina de estados sobre flags
(`temPublicos`, `temAtivos`, `fontesSuficientes`, `aderente`) que monta os textos
das seis dimensões por template.

Isso não é defeito: é conservador e auditável, e o comentário no código explica
a intenção (não completar lacunas com LLM). Mas **muda radicalmente a leitura do
que o sistema é hoje**: o "raciocínio Crossability" do fluxo principal é
determinístico.

**Testes:** `crossability-reasoning.agent.test.ts` (92 linhas).

### Etapa 8 — Recommendation

Determinístico. Score = média das 6 dimensões (alta=100, media=55, baixa=15)
ponderada 80% mérito / 20% confiança. Ordena por score, desempate por menos
fraquezas.

**Ponto forte:** a confiança modula o ranking — análise pouco confiável não
infla posição. **Testado.**

### Etapa 9 — Human Gate

**Rota:** `POST /agentes/human-gate`
**Rejeição:** registra execução com `origem: "humano"`, não escreve nada
**Aprovação:** exige `candidatura_id`, valida que a execução é
`crossability_reasoning`, promove como `em_elaboracao`

**Limitação relevante** ([agentes.service.ts:593-595](backend/src/modules/agentes/agentes.service.ts#L593-L595)):

```ts
if (execucao.agente !== "crossability_reasoning") {
  throw new ValidationError(`O Human Gate hoje só promove análises Crossability...`);
}
```

O Human Gate promove **apenas um tipo de objeto**. Uma oportunidade
(`oportunidade_ia`), um perfil enriquecido ou uma entidade nova não podem ser
promovidos por ele. A curadoria de `oportunidade_ia` acontece por caminho
separado (mudança de `status` via UPDATE concedido na migration 043).

---

## 3. Dois pipelines, comportamentos distintos

| Aspecto | `partner_discovery` | `market_intelligence` |
|---|---|---|
| Planning | heurística (frentes da base) | LLM (ou mock se Ollama) |
| RAG | **ignorado por decisão explícita** | consultado (5 trechos) |
| Crossability | **heurística** | LLM |
| Persiste oportunidade | sim | não |

A decisão de o `partner_discovery` ignorar o RAG está documentada no código
([linha 2020-2021](backend/src/modules/agentes/agentes.service.ts#L2020-L2021)):
*"A Base Cross contextualiza o planejamento e a deduplicação, mas não participa
da descoberta nem do fit."*

**Consequência:** o fluxo que gera as oportunidades que a Cross vê **não usa a
metodologia Cross armazenada no RAG**. Voltaremos a isso em `04`.

---

## 4. Classificação consolidada

| Componente | Estado |
|---|---|
| Cliente LLM plugável (`llm.ts`) | **IMPLEMENTADO E FUNCIONAL** |
| Timeout e fallback de LLM | **IMPLEMENTADO E FUNCIONAL** |
| Collect (DuckDuckGo) | **IMPLEMENTADO E FUNCIONAL** (frágil) |
| Credibility | **IMPLEMENTADO E FUNCIONAL** |
| Entity Resolution | **IMPLEMENTADO E FUNCIONAL** |
| Recommendation | **IMPLEMENTADO E FUNCIONAL** |
| Extraction | **IMPLEMENTADO E FUNCIONAL** |
| Persistência de execuções | **IMPLEMENTADO PARCIALMENTE** |
| Planning (via Ollama) | **MOCK/DETERMINÍSTICO** |
| Crossability (partner_discovery) | **MOCK/DETERMINÍSTICO** |
| Embeddings (sem chave OpenAI) | **MOCK/DETERMINÍSTICO** |
| Fact Verification (no pipeline) | **PLACEHOLDER** (sempre pulado) |
| Human Gate | **IMPLEMENTADO PARCIALMENTE** (1 tipo de objeto) |
| Métricas de custo | **AUSENTE** |
| Retry / retomada de etapa | **AUSENTE** |
| Rastreio trecho→conclusão | **AUSENTE** |
| Metodologia Cross no RAG | **AUSENTE** |

**Nada foi classificado como PRECISA SER REFEITO.** O código é de boa qualidade,
comentado e coerente. As lacunas são de completude, não de desenho.

**Continua em:** `02-agent-inventory.md`.
