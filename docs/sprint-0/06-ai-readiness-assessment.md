# 06 — Avaliação de Prontidão para IA

**Plataforma Cross** · Sprint 0
Data: 07/08/2026

## Classificação

| Classe | Significado |
|---|---|
| **READY** | Existe, funciona e serve à arquitetura futura sem alteração |
| **PARTIAL** | Existe, mas cobre parcialmente o que será exigido |
| **MISSING** | Não existe; precisa ser construído |
| **REWORK** | Existe, mas o desenho atual não serve — precisa ser refeito |

---

## Veredito

A plataforma está **substancialmente mais pronta do que a documentação sugere**.
O pipeline conceitual do briefing — Planning → Collect → Credibility →
Verification → Entity Resolution → Extraction → Crossability Reasoning →
Recommendation → Human Gate — **já está implementado de ponta a ponta**, com uma
rota dedicada por etapa e persistência auditável.

A Sprint 0 não precisa preparar terreno para agentes. Precisa **organizar** o que
existe e **fechar quatro lacunas** concretas.

| Dimensão | Classe |
|---|---|
| Pipeline de agentes | **READY** |
| Provedores de LLM | **READY** |
| RAG e pgvector | **READY** |
| Human Gate | **READY** |
| Persistência de execuções | **READY** |
| Prompts | **PARTIAL** |
| Ferramentas externas | **PARTIAL** |
| Observabilidade de custo | **PARTIAL** |
| Evidências rastreáveis | **PARTIAL** |
| Agent Framework (abstração) | **REWORK** |
| Reuniões como fonte | **MISSING** |
| Feedback do Human Gate | **MISSING** |

---

## 1. Infraestrutura de agentes — READY (com REWORK na abstração)

### 1.1 Cobertura do pipeline

| Etapa conceitual | Implementação | Rota | Classe |
|---|---|---|---|
| Planning | `search-planning.agent.ts` (110) · `market-discovery-planning.agent.ts` (149) | `POST /agentes/search-planning` | READY |
| Collect | `source-collector.agent.ts` (65) + Firecrawl + web-search | `POST /agentes/source-collector` | READY |
| Credibility | `source-credibility.agent.ts` (100) | `POST /agentes/source-credibility` | READY |
| Verification | `fact-verifier.agent.ts` (68) | `POST /agentes/fact-verifier` | READY |
| Entity Resolution | `entity-resolver.agent.ts` (101) | `POST /agentes/entity-resolver` | READY |
| Extraction | `information-extractor.agent.ts` (333) | `POST /agentes/information-extractor` | READY |
| Crossability Reasoning | `crossability-reasoning.agent.ts` (270) | `POST /agentes/crossability-reasoning` | READY |
| Recommendation | `recommendation.agent.ts` (70) · `opportunity-qualification.agent.ts` (289) | `POST /agentes/recommendation` | READY |
| Human Gate | curadoria em `oportunidade_ia` | `POST /agentes/human-gate` | READY |

**Nenhuma etapa do pipeline está ausente.**

Complementares: `part-enrichment` (170), `csv-mapping` (180),
`historical-funnel` (195) — ingestão assistida, também prontos.

### 1.2 Orquestração — REWORK

`agentes.service.ts` tem **2.153 linhas** e concentra orquestração de dois
pipelines, execução assíncrona, ingestão CSV, RAG e Human Gate.

Não é um defeito de correção — funciona e é testado. É um problema de
**extensibilidade**: adicionar um agente ou compor um pipeline novo exige mexer
num arquivo que faz tudo. Sem contrato explícito de etapa (`AgentStep`), cada
adição aumenta o acoplamento.

**REWORK** significa: extrair um Agent Framework preservando comportamento.
Não reescrever agentes. Critério: os 203 testes passam sem alteração.

---

## 2. Provedores de LLM — READY

`agentes/shared/llm.ts` (187 linhas) implementa abstração de provedor sólida:

| Recurso | Situação |
|---|---|
| OpenAI, DeepSeek, Ollama | READY — troca por `AI_PROVIDER` |
| Saída JSON estruturada | READY — `response_format` / JSON Schema no Ollama |
| Timeout obrigatório | READY — nunca sem teto (`llm.ts:128-131`) |
| Fallback local | READY — Ollama indisponível cai no stub sem derrubar pipeline |
| Modo mock determinístico | READY — desenvolve e testa sem custo |
| Contagem de tokens | READY — normaliza formatos OpenAI e Ollama |
| Aquecimento do modelo | READY — `aquecerOllama()` |

Ponto de atenção: `ResultadoLLM.origem` registra o **provedor**
(`"openai"`, `"ollama"`, `"mock"`), não o **modelo** (`gpt-4o-mini`,
`qwen3:4b`). Para custo por modelo, isso é insuficiente — ver §5.

---

## 3. RAG, pgvector e embeddings — READY

| Componente | Situação | Classe |
|---|---|---|
| pgvector | Extensão declarada (migration 035) | READY |
| `documento_rag` | chunk + `vector(1536)` + origem + metadados + referência | READY |
| Índice HNSW | Migration 036 substituiu ivfflat — decisão correta para baixo volume | READY |
| Origens tipadas | `paper`, `perfil_parte`, `decisao`, `coleta_web`, `manual` | READY |
| Marca real/mock | `embedding_origem` distingue embedding real de determinístico | READY |
| Serviço e repositório | `rag.service.ts` (65) + `rag.repository.ts` (68) | READY |
| Rotas | `POST /agentes/rag/ingerir`, `POST /agentes/rag/buscar` | READY |

**Lacuna (PARTIAL):** a ingestão é manual/pontual. Não há rotina que mantenha o
RAG sincronizado quando um perfil estratégico, documento ou decisão muda. Sem
isso, a base vetorial envelhece silenciosamente.

**Nota de dimensionamento:** `text-embedding-3-small` (1536 dims) é da OpenAI.
Com `AI_PROVIDER=ollama` e sem `OPENAI_API_KEY`, os embeddings caem em modo mock
— o RAG funciona mecanicamente, mas **sem qualidade semântica real**. É preciso
estar consciente disso ao avaliar resultados em modo local.

---

## 4. Human Gate — READY

O item mais bem resolvido da plataforma. Está protegido em três camadas:

| Camada | Mecanismo |
|---|---|
| Modelo | `oportunidade_ia.status`: `rascunho` → `em_curadoria` → `aprovada` \| `descartada` |
| Permissão | Migration 039 concede apenas `SELECT, INSERT`; `UPDATE` veio separado (043) para curadoria reversível |
| Intenção documentada | Migrations 026, 034, 039 e 042 declaram explicitamente que nada entra no domínio sem decisão humana |
| Interface | `pages/Oportunidades.tsx` (236 linhas) |
| Rota | `POST /agentes/human-gate` |

**Não tocar.** É invariante do produto.

**Lacuna (MISSING):** o descarte não retroalimenta nada. Uma oportunidade
descartada registra o status, mas o motivo não volta como sinal para análises
futuras. O ciclo da arquitetura alvo ("novas informações → base") está fechado
para aprovações e **aberto para descartes**.

---

## 5. Observabilidade e custo — PARTIAL

Situação campo a campo do que o briefing exige:

| Campo exigido | Onde está | Classe |
|---|---|---|
| `model` | `execucao_agente.origem` — provedor, não modelo | **PARTIAL** |
| `input_tokens` | `tokens_entrada` | READY |
| `output_tokens` | `tokens_saida` | READY |
| `cached_input_tokens` | — | **MISSING** |
| `tool_calls` | — | **MISSING** |
| `web_search_calls` | — | **MISSING** |
| `scraping_usage` | — | **MISSING** |
| `started_at` | `criado_em` | PARTIAL |
| `finished_at` | derivável de `criado_em + duracao_ms` | PARTIAL |
| `latency` | `duracao_ms` | READY |
| `estimated_cost` | — | **MISSING** |
| `status` | `execucao_agente.status` | READY |
| `human_gate_status` | `oportunidade_ia.status` | READY |

**Diagnóstico:** a fundação existe e está bem desenhada — `execucao_agente` já
registra por execução, com vínculo ao domínio e distinção real/mock. Faltam
campos, não arquitetura.

**Onde entra futuramente:** colunas aditivas em `cross_ai.execucao_agente`
(`modelo`, `custo_estimado`, `tokens_cache`) e uma tabela de uso de ferramenta
(`tool_calls`, `web_search_calls`, `scraping_usage`) referenciando a execução.
Aditivo, idempotente, sem quebrar o existente — **não nesta sprint**.

---

## 6. Evidências e fontes — PARTIAL

| Componente | Situação | Classe |
|---|---|---|
| `oportunidade_ia.fontes` (JSONB) | Fontes por oportunidade | READY |
| Módulo `governanca` (9 rotas) | Evidências e fontes estruturadas | READY (backend) |
| Interface de evidências | Não existe | **MISSING** |
| Ligação evidência ↔ execução | Não estruturada | **PARTIAL** |

O backend sabe registrar evidências; o produto não as mostra. Para uma
plataforma cuja premissa é "IA propõe com fontes rastreáveis, humano valida",
**a evidência precisa ser visível no momento da decisão** — não apenas
armazenada.

---

## 7. Prompts — PARTIAL

Prompts vivem embutidos em cada arquivo de agente. Funciona e mantém o prompt
junto do schema Zod que o valida.

Limitações para a fase seguinte:
- Sem versionamento — mudar um prompt não deixa rastro
- Sem correlação prompt ↔ resultado: `execucao_agente` guarda entrada e saída,
  mas não qual versão de prompt produziu aquilo
- Sem avaliação sistemática de qualidade

Não é bloqueio para a Sprint 0. Torna-se relevante quando os agentes forem
ajustados iterativamente com chaves reais.

---

## 8. Ferramentas externas — PARTIAL

| Ferramenta | Arquivo | Situação |
|---|---|---|
| Firecrawl | `shared/firecrawl.ts` (325) | READY, desligado sem chave |
| Busca web | `shared/web-search.ts` (239) | READY |
| Controle de concorrência | `shared/concorrencia.ts` (31) | READY |
| Contabilização de uso | — | **MISSING** (ver §5) |

---

## 9. Reuniões como fonte de inteligência — MISSING

A jornada B do briefing (Parceiro → Cliente) depende de estruturar reuniões.

**Situação atual:** reunião só existe em `cross_execution`, com `parceria_id`
obrigatório. Uma reunião com a Converse — que ainda não é parceira de ninguém —
**não tem onde ser registrada**.

Isto não é ajuste de interface: é mudança de modelo. Reunião precisa ser evento
de inteligência ligado a uma **Parte**, com participantes, contexto e extração
de fatos que alimente o RAG.

**Fora do escopo da Sprint 0** (que não altera o banco), mas é a primeira coisa a
fazer depois — sem ela, uma das três jornadas não existe.

---

## 10. Mapa de entidades: pedido × existente

Conforme a instrução de reutilizar antes de criar:

| Entidade pedida | Já existe? | Onde | Ação |
|---|---|---|---|
| `AgentRun` | **Sim** | `cross_ai.execucao_agente` + `tarefa_pipeline` | Reutilizar; estender campos |
| `AgentStep` | **Parcial** | `tarefa_pipeline.etapas` (JSONB) | Formalizar contrato em código |
| `Evidence` | **Sim** | `cross_governance` + `oportunidade_ia.fontes` | Reutilizar; criar interface |
| `Source` | **Sim** | `cross_governance` + `source-credibility` | Reutilizar |
| `EntityIntelligence` | **Sim** | `cross_intelligence` (38 rotas) | Reutilizar |
| `Opportunity` | **Sim** | `cross_ai.oportunidade_ia` | Reutilizar; promover a entidade central |
| `Recommendation` | **Sim** | `recommendation.agent` + `oportunidade_ia` | Reutilizar |
| `HumanReview` | **Sim** | `oportunidade_ia.status` + auditoria | Reutilizar |
| `KnowledgeDocument` | **Sim** | `cross_core` (documentos) | Reutilizar; ligar ao RAG |
| `KnowledgeChunk` | **Sim** | `cross_ai.documento_rag` | Reutilizar |
| `CostUsage` | **Não** | — | Criar futuramente (aditivo) |
| `TokenUsage` | **Parcial** | `execucao_agente.tokens_*` | Estender |
| `ToolUsage` | **Não** | — | Criar futuramente (aditivo) |

**Dez das treze entidades já existem.** Apenas `CostUsage` e `ToolUsage` são
genuinamente novas — e ambas são aditivas, sem impacto no existente.

---

## 11. Lacunas priorizadas

| # | Lacuna | Classe | Impacto | Quando |
|---|---|---|---|---|
| 1 | Reuniões como evento de inteligência | MISSING | Jornada B não existe sem isso | Pós-Sprint 0, primeiro |
| 2 | Agent Framework (decompor service) | REWORK | Cada agente novo aumenta acoplamento | Fase E |
| 3 | Custo e uso de ferramenta | MISSING | Sem controle de gasto ao ligar chaves | Antes de chave real |
| 4 | Evidências visíveis na curadoria | PARTIAL | Human Gate decide sem ver a fonte | Junto do Dashboard |
| 5 | Feedback do descarte | MISSING | Ciclo de aprendizado aberto | Após 3 |
| 6 | Sincronização do RAG | PARTIAL | Base vetorial envelhece | Após 3 |
| 7 | Versionamento de prompts | PARTIAL | Ajuste iterativo sem rastro | Quando houver chave real |

**Continua em:** `07-sprint-0-execution-plan.md`.
