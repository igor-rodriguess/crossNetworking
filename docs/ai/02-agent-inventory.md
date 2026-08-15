# 02 — Inventário dos Agentes

**Plataforma Cross** · Sprint 0B
Data: 07/08/2026

Estados: `READY` · `PARTIAL` · `MOCK` · `PLACEHOLDER` · `REWORK` · `DEPRECATED`

---

## 1. Search Planning

| Campo | Valor |
|---|---|
| **Responsabilidade** | Decompor objetivo em perguntas e consultas de busca |
| **Entrada** | `{ objetivo, contexto?, projeto_id?, frente_id? }` |
| **Saída** | `PlanoPesquisa` — perguntas priorizadas, consultas, tipos de fonte |
| **Etapas cobertas** | Planning |
| **Ferramentas** | nenhuma |
| **LLM** | OpenAI/DeepSeek — **desativado quando `AI_PROVIDER=ollama`** |
| **RAG** | não |
| **Fontes externas** | nenhuma |
| **Fontes internas** | nenhuma |
| **Tabelas** | `execucao_agente` |
| **Human Gate** | não se aplica |
| **Testes** | **nenhum** |
| **Estado** | **PARTIAL** |

**Riscos.** O bypass do LLM no Ollama ([linha 105](backend/src/modules/agentes/search-planning.agent.ts#L105)) faz a etapa 1 ser mock na configuração padrão. O plano mock é genérico ("principais empresas", "notícias 2026"), o que empobrece a coleta.

**Recomendação.** Manter o bypass (é decisão consciente de custo), mas **registrar `origem: "mock"` de forma visível na interface** para que ninguém leia o plano como raciocínio de IA. Adicionar teste.

---

## 2. Market Discovery Planning

| Campo | Valor |
|---|---|
| **Responsabilidade** | Planejar descoberta a partir das frentes reais do cliente |
| **Entrada** | `{ cliente, objetivo, contexto?, frentes[] }` |
| **Saída** | `PlanoPesquisa` |
| **Etapas cobertas** | Planning (pipeline `partner_discovery`) |
| **LLM** | não — `origem: "heuristica"` |
| **RAG** | não |
| **Fontes internas** | `repo.listarFrentesParaDescoberta()` |
| **Tabelas** | `frente_oportunidade`, `execucao_agente` |
| **Testes** | `market-discovery-planning.agent.test.ts` (91 linhas) |
| **Estado** | **READY** |

**Riscos.** Sem frentes cadastradas, o plano degrada para termos genéricos.

**Recomendação.** É o Planning **efetivamente usado** no fluxo principal. Preservar.

---

## 3. Source Collector

| Campo | Valor |
|---|---|
| **Responsabilidade** | Executar as buscas do plano e devolver resultados brutos |
| **Entrada** | `{ plano \| consultas[], limite_por_consulta? }` |
| **Saída** | `ColetaFontesSaida` — resultados agrupados por consulta |
| **Etapas cobertas** | Collect |
| **Ferramentas** | DuckDuckGo (HTML), Firecrawl (fallback) |
| **LLM** | não |
| **Tabelas** | `execucao_agente` |
| **Testes** | **nenhum** |
| **Estado** | **READY** (funcional, frágil) |

**Riscos.** **Alto.** Depende de regex sobre HTML do DuckDuckGo. Mudança de layout quebra a coleta em silêncio; o pipeline reporta `insufficient_evidence` sem revelar a causa. O fallback GET já existente sugere que anti-bot é problema recorrente.

**Recomendação.** **Primeiro candidato a teste de contrato.** Um teste que valide o parser contra HTML fixado detectaria a quebra antes do usuário. Considerar promover Firecrawl a provedor primário quando houver chave.

---

## 4. Source Credibility

| Campo | Valor |
|---|---|
| **Responsabilidade** | Estimar reputação da fonte por sinais de domínio/URL |
| **Entrada** | `{ coleta \| resultados[] }` |
| **Saída** | avaliações com score 0–100, nível e sinais |
| **Etapas cobertas** | Credibility |
| **LLM** | não — determinístico por decisão |
| **Tabelas** | `execucao_agente` |
| **Testes** | **4 casos** — o melhor coberto |
| **Estado** | **READY** |

**Riscos.** Lista fixa de 13 domínios reputados, generalista e brasileira. Veículos setoriais (moda, esporte, música) não são reconhecidos.

**Recomendação.** Preservar. Evoluir a lista para tabela configurável quando o volume justificar. É a porta de custo que protege o LLM.

---

## 5. Fact Verifier

| Campo | Valor |
|---|---|
| **Responsabilidade** | Classificar afirmações por corroboração entre domínios distintos |
| **Entrada** | `{ afirmacoes: [{ texto, fontes[] }] }` |
| **Saída** | `corroborada` / `fonte_unica` / `nao_confirmada` |
| **Etapas cobertas** | Verification |
| **LLM** | não |
| **Tabelas** | `execucao_agente` |
| **Testes** | **nenhum** |
| **Estado** | **PLACEHOLDER** |

**Riscos.** **O mais grave do inventário.** A lógica é boa, mas **nunca executa no pipeline**: só roda se o chamador enviar `afirmacoes`, e o pipeline não as extrai da coleta ([agentes.service.ts:1948](backend/src/modules/agentes/agentes.service.ts#L1948)). Em toda execução automática a etapa é `ignorada`.

Consequência: **nenhum fato coletado é verificado** antes de virar perfil e, depois, oportunidade.

**Recomendação.** **Segundo item da fila de correção.** Ligar a extração de afirmações à verificação. Não exige LLM — as afirmações já saem da extração.

---

## 6. Entity Resolver

| Campo | Valor |
|---|---|
| **Responsabilidade** | Deduplicar entidades contra as Partes da base |
| **Entrada** | `{ entidades: string[], tipo? }` + `PoolClient` |
| **Saída** | `nova` / `possivel_duplicata` / `ambigua` + candidatas com similaridade |
| **Etapas cobertas** | Entity Resolution |
| **LLM** | não — Dice sobre bigramas |
| **Fontes internas** | `repo.buscarPartesPorNome()` |
| **Tabelas** | `cross_core.parte`, `execucao_agente` |
| **Testes** | **nenhum** |
| **Estado** | **READY** |

**Riscos.** Busca por primeira palavra apenas, limite 10. Nomes iniciados por termo genérico podem não recuperar a candidata certa. Sem `pg_trgm` na consulta, embora a extensão esteja instalada.

**Recomendação.** Preservar. Avaliar uso de `pg_trgm` para recall.

---

## 7. Information Extractor

| Campo | Valor |
|---|---|
| **Responsabilidade** | Extrair perfis estruturados do conteúdo coletado |
| **Entrada** | `{ coleta, limite_urls, foco }` |
| **Saída** | perfis com setor, públicos, territórios, ativos, sinais, fontes, confiança |
| **Etapas cobertas** | Extraction |
| **Ferramentas** | Firecrawl (conteúdo de página) |
| **LLM** | **sim** — real quando há provider |
| **Tabelas** | `execucao_agente` |
| **Testes** | 1 caso |
| **Estado** | **READY** |

**Riscos.** É o maior consumidor de LLM e de Firecrawl — o principal vetor de custo quando as chaves entrarem. Protegido pela porta `haFonteConfiavel` (score ≥70).

**Recomendação.** Preservar. É aqui que a instrumentação de custo mais importa.

---

## 8. Crossability Reasoning

| Campo | Valor |
|---|---|
| **Responsabilidade** | Avaliar as 6 dimensões da metodologia |
| **Entrada** | `{ cliente, parceiro, objetivo?, perfil_parceiro?, contexto_rag? }` |
| **Saída** | 6 dimensões (nível + texto) + recomendação + racional + confiança |
| **Etapas cobertas** | Crossability Reasoning |
| **LLM** | **depende do pipeline** (ver abaixo) |
| **RAG** | apenas em `market_intelligence` |
| **Tabelas** | `execucao_agente` |
| **Testes** | `crossability-reasoning.agent.test.ts` (92 linhas) |
| **Estado** | **PARTIAL** |

**Duas implementações:**

| Função | Origem | Pipeline |
|---|---|---|
| `raciocinarCrossability()` | LLM | `market_intelligence` |
| `raciocinarCrossabilityComEvidenciaExterna()` | `heuristica` | **`partner_discovery`** |

**Riscos.** O fluxo principal do produto usa a **versão sem LLM**: textos por template a partir de flags booleanas. A confiança é calculada por fórmula aritmética ([linhas 209-221](backend/src/modules/agentes/crossability-reasoning.agent.ts#L209-L221)) com tetos (75 com 2+ fontes, 58 com fonte única) — conservadora e defensável, mas **não é raciocínio**.

**Recomendação.** **Este é o componente a melhorar primeiro** (ver §Conclusão). A versão heurística deve permanecer como piso seguro; a versão LLM precisa receber contexto de metodologia via RAG para agregar valor real.

---

## 9. Recommendation

| Campo | Valor |
|---|---|
| **Responsabilidade** | Ranquear candidatos pelas análises Crossability |
| **Entrada** | `{ candidatos: [{ parceiro, analise }] }` |
| **Saída** | ranking com posição, score, fortalezas, fraquezas, justificativa |
| **Etapas cobertas** | Recommendation |
| **LLM** | não — determinístico |
| **Testes** | sim, em `agentes.test.ts` |
| **Estado** | **READY** |

**Riscos.** Baixo. Fórmula transparente e auditável (80% dimensões / 20% confiança).

**Recomendação.** Preservar sem alteração. É exemplo do que a arquitetura pede: LLM propõe, determinístico ordena.

---

## 10. Opportunity Qualification

| Campo | Valor |
|---|---|
| **Responsabilidade** | Qualificar candidatas e aferir aderência ao briefing |
| **Saída** | aprovação + temas + referência |
| **Etapas cobertas** | apoio a Extraction e Reasoning |
| **LLM** | não |
| **Testes** | `opportunity-qualification.agent.test.ts` (142 linhas) — **o mais testado** |
| **Estado** | **READY** |

**Riscos.** Baixo. É o guardião que impede candidatas irrelevantes de virarem oportunidade (`validarCandidataExterna`).

---

## 11. Part Enrichment

| Campo | Valor |
|---|---|
| **Responsabilidade** | Enriquecer uma Parte existente com dados externos |
| **Rota** | `POST /agentes/partes/:id/enriquecer` |
| **LLM** | sim |
| **Tabelas** | `cross_core.parte`, `cross_intelligence`, `execucao_agente` |
| **Testes** | **nenhum** |
| **Estado** | **PARTIAL** |

**Riscos.** Escreve em entidade de domínio existente. Verificar se a escrita passa por confirmação humana — não é coberto pelo `decidirHumanGate`, que só aceita `crossability_reasoning`.

**Recomendação.** **Auditar o caminho de escrita** antes de ligar chave real.

---

## 12. CSV Mapping

| Campo | Valor |
|---|---|
| **Responsabilidade** | Mapear colunas de CSV para o modelo da plataforma |
| **Rotas** | `POST /agentes/csv/mapeamento`, `/csv/confirmar` |
| **LLM** | sim |
| **Human Gate** | **sim** — confirmação humana explícita antes da carga |
| **Testes** | indireto |
| **Estado** | **READY** |

**Recomendação.** Bom exemplo do padrão propor→confirmar. Preservar.

---

## 13. Historical Funnel

| Campo | Valor |
|---|---|
| **Responsabilidade** | Importar funil histórico de CSV |
| **Rotas** | `/csv/funil-historico/analisar`, `/confirmar` |
| **Human Gate** | sim |
| **Testes** | 2 arquivos (`historical-funnel.agent.test.ts`, `historical-funnel-import.test.ts`) |
| **Estado** | **READY** |

---

## Consolidado

| Estado | Agentes |
|---|---|
| **READY** (7) | Market Discovery Planning, Source Collector, Source Credibility, Entity Resolver, Information Extractor, Recommendation, Opportunity Qualification, CSV Mapping, Historical Funnel |
| **PARTIAL** (3) | Search Planning, Crossability Reasoning, Part Enrichment |
| **PLACEHOLDER** (1) | Fact Verifier |
| **MOCK** | — (nenhum agente é integralmente mock; o modo mock é transversal) |
| **REWORK** | nenhum |
| **DEPRECATED** | nenhum |

### Cobertura de teste

| Situação | Agentes |
|---|---|
| Com teste | 6 |
| **Sem teste** | **7** — Search Planning, Source Collector, Fact Verifier, Entity Resolver, Part Enrichment, Recommendation (parcial), CSV Mapping |

Os dois agentes de maior risco operacional — **Source Collector** (parser HTML
frágil) e **Fact Verifier** (nunca executado) — estão entre os sem teste.

**Continua em:** `03-pipeline-data-flow.md`.
