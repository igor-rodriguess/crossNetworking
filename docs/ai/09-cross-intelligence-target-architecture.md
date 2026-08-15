# 09 — Arquitetura Alvo da Cross Intelligence

**Plataforma Cross** · Sprint 0B
Data: 07/08/2026

> Arquitetura conceitual. Nenhum agente implementado, nenhuma API conectada,
> `agentes.service.ts` não refatorado.

---

## 1. Camadas

```
┌─────────────────────────────────────────────────────────────────┐
│  JORNADAS DE PRODUTO  (não são agentes — ADR-008)               │
│  A) Cliente→Parceiro   B) Parceiro→Cliente   C) Prospecção      │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  CROSS ORCHESTRATOR                                             │
│  monta o pipeline conforme a jornada · checkpoint · custo        │
│  hoje: executarPipeline() (linear, 370 linhas)                  │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  AGENTES ESPECIALIZADOS (8 no alvo)                             │
│  Research&Evidence · Entity Intelligence · Internal Matching ·  │
│  Crossability · Recommendation · Meeting · Artist · Monitoring  │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  SERVIÇOS COMPARTILHADOS (capacidades — ADR-007)                │
│  RAG · Memory · Evidence Store · Entity Resolution ·            │
│  Fact Verification · Credibility · Score Engine · Cost ·        │
│  Web Search · Firecrawl · Embeddings · Observabilidade          │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  HUMAN GATE  (transversal — nada vira domínio sem passar aqui)  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. As três jornadas usam o mesmo motor (§3, ADR-008)

O pipeline canônico é **protocolo**, não implementação. Cada jornada o percorre
com entradas e ênfases diferentes:

| Etapa | Jornada A (Cliente→Parceiro) | Jornada B (Parceiro→Cliente) | Jornada C (Prospecção) |
|---|---|---|---|
| **Planning** | Frentes do cliente | Contexto da reunião | Entidade foco |
| **Collect** | Busca por perfil de parceiro | Busca sobre a empresa | Busca ampla |
| **Credibility** | ✅ mesma heurística | ✅ mesma | ✅ mesma |
| **Verification** | ✅ mesma | ✅ mesma | ✅ mesma |
| **Entity Resolution** | ✅ mesma | ✅ mesma | ✅ mesma |
| **Extraction** | Perfil do parceiro | Fatos da reunião | Perfil completo |
| **Crossability** | 1 cliente × N parceiros | **1 parceiro × N clientes** | 1 entidade × N clientes |
| **Recommendation** | Ranking de parceiros | **Ranking de clientes** | Ranking de encaixes |
| **Human Gate** | ✅ mesmo | ✅ mesmo | ✅ mesmo |

**Seis das nove etapas são idênticas.** As diferenças estão em Planning,
Extraction e na **direção** do cruzamento.

**Consequência para o Recommendation:** hoje ele ranqueia candidatos dentro de um
cliente. Para a jornada B, precisa ranquear **clientes** para um parceiro. É a
mesma fórmula com os papéis invertidos — não um agente novo.

---

## 3. Mapeamento agentes atuais → arquitetura alvo (§4)

| Agente atual | Agente alvo | Reutilizável? | Situação |
|---|---|---|---|
| `search-planning` | Research & Evidence | ✅ | **Serviço interno** do orchestrator |
| `market-discovery-planning` | Research & Evidence | ✅ | Serviço interno |
| `source-collector` | Research & Evidence | ✅ | Serviço interno |
| `source-credibility` | *(compartilhado)* | ✅ | **Serviço**, não agente |
| `fact-verifier` | *(compartilhado)* | ✅ | **Serviço**, não agente |
| `entity-resolver` | *(compartilhado)* | ✅ | **Serviço**, não agente |
| `information-extractor` | Research & Evidence | ✅ | **Precisa evoluir** — produzir Evidence com proveniência |
| `crossability-reasoning` | Crossability Reasoning | ✅ | **Precisa evoluir** — consumir verificação e Knowledge |
| `recommendation` | Recommendation | ✅ | **Precisa evoluir** — ranquear clientes (jornada B) |
| `opportunity-qualification` | Internal Matching | ⚠️ | **Duplicação parcial** — ver abaixo |
| `part-enrichment` | Entity Intelligence | ✅ | **Precisa evoluir** — passar por Human Gate |
| `csv-mapping` | *(ingestão)* | ✅ | Serviço de importação |
| `historical-funnel` | *(ingestão)* | ✅ | Serviço de importação |

### Duplicação identificada

`opportunity-qualification.agent` e `crossability-reasoning.agent` **compartilham
responsabilidade**: o primeiro tem `avaliarTemaDoBriefing()`, que o segundo
importa e usa para aferir aderência
([crossability-reasoning.agent.ts:2](backend/src/modules/agentes/crossability-reasoning.agent.ts#L2)).

Não é erro — é acoplamento que revela que "qualificar candidata" e "avaliar
Crossability" são a mesma família. **No alvo:** `opportunity-qualification` vira
**Internal Matching** (cruzamento com a base interna) e cede a parte de aderência
temática ao Crossability. **Não refatorar agora.**

### Agentes alvo sem implementação atual

| Agente alvo | Situação | Depende de |
|---|---|---|
| **Meeting Intelligence** | ❌ Não existe | Migration 055 |
| **Artist / Big Moment Intelligence** | ❌ Não existe | Estrutura de Big Moment |
| **Monitoring** | ❌ Não existe | — |

**Regra da §4 respeitada:** nenhum agente adicional foi proposto. Dos 8 alvo, 5
já têm base implementada.

---

## 4. Serviços compartilhados — o código respeita a separação? (§5)

| Serviço | Onde vive hoje | Respeita? |
|---|---|---|
| Web Search | `shared/web-search.ts` | ✅ |
| Firecrawl | `shared/firecrawl.ts` | ✅ |
| Embeddings | `shared/embeddings.ts` | ✅ |
| LLM | `shared/llm.ts` | ✅ |
| Concorrência | `shared/concorrencia.ts` | ✅ |
| **Cost Tracking** | `shared/custo.ts` | ✅ **novo no hardening** |
| RAG | `rag.service.ts` + `rag.repository.ts` | ✅ |
| Credibility | `source-credibility.agent.ts` | ⚠️ **nomeado como agente** |
| Fact Verification | `fact-verifier.agent.ts` | ⚠️ **nomeado como agente** |
| Entity Resolution | `entity-resolver.agent.ts` | ⚠️ **nomeado como agente** |
| Score Engine | `agentes.service.ts` (`scoreFitDaAnalise`) + `metodologias` | ⚠️ **disperso** |
| Evidence Store | — | ❌ **não existe** |
| Agent Memory | `execucao_agente` + `tarefa_pipeline` | ⚠️ parcial |
| Observabilidade | `execucao_agente`, `uso_ferramenta` | ✅ **após 053** |
| Human Gate | `agentes.service.ts:decidirHumanGate` | ⚠️ acoplado ao service |

**Conflito principal:** três serviços compartilhados estão nomeados como
`*.agent.ts` (Credibility, Fact Verification, Entity Resolution). São
determinísticos, sem LLM, e usados por várias etapas — **são capacidades, não
agentes**.

O impacto hoje é **de nomenclatura, não de arquitetura**: já são funções puras
importáveis. A renomeação para `shared/` é cosmética e fica para a extração do
Agent Framework. **Não refatorar agora.**

**Lacuna real:** Evidence Store não existe. Afirmações verificadas vivem apenas
no JSONB de uma execução — não podem ser consultadas nem reutilizadas.

---

## 5. Verification → Crossability (§18)

O hardening integrou o Fact Verifier ao pipeline, mas o Crossability **ainda não
consome** o resultado. Aqui fica definido o alvo, **sem alterar pesos agora**.

### Definições conceituais

| Status | Definição | Leitura para o reasoning |
|---|---|---|
| **Corroborado** | 2+ domínios independentes | Pode sustentar dimensão em nível alto |
| **Fonte única** | 1 domínio | Indício — teto de nível médio |
| **Não confirmado** | 0 fontes válidas | Não sustenta dimensão |
| **Conflitante** | Fontes divergem | **Não existe hoje** — o verificador não detecta contradição |

> "Conflitante" é uma lacuna: o `fact-verifier` conta domínios, mas não compara
> conteúdo. Duas fontes afirmando o oposto contam como corroboração. Registrado
> para a evolução do Fact Verification.

### Ponto exato de entrada

```
executarPipeline()  ──  agentes.service.ts

  [etapa fact_verifier]  ──▶  verificacao: VerificacaoSaida
                                     │
                                     │  ◀── HOJE: fica na saída do pipeline,
                                     │        não é passada adiante
                                     ▼
  const entradaReasoning = {
    cliente, parceiro, objetivo,
    perfil_parceiro: perfil,
    contexto_rag: ...,
    // ◀══ AQUI entra `verificacao` no futuro
  };
```

**Linha exata:** a montagem de `entradaReasoning` dentro de `mapearComLimite`
([agentes.service.ts ~2373](backend/src/modules/agentes/agentes.service.ts#L2373)).
O objeto `verificacao` já existe no escopo — falta passá-lo e o schema
`raciocinarCrossabilitySchema` aceitá-lo.

**Regra futura (não implementar):** uma dimensão só atinge nível `alta` se
sustentada por afirmação `corroborada`. Isso substituiria parte da heurística
atual de `fontesSuficientes`. **Mudança na lógica do Crossability — exige
aprovação explícita.**

---

## 6. Crossability no alvo (§19)

```
VERIFIED EVIDENCE  ──┐
                     │
ENTITY INTELLIGENCE ─┼──▶  CROSSABILITY REASONING  ──▶  6 dimensões
                     │      (motor metodológico)         + racional
CROSS KNOWLEDGE    ──┘                                   + confiança
```

**Rastreabilidade alvo** — cada dimensão deve apontar para:

| Elemento | Situação hoje |
|---|---|
| Fatos utilizados | ❌ não rastreado por dimensão |
| Fontes | ⚠️ no nível da oportunidade |
| Conhecimento Cross usado | ❌ RAG desligado no pipeline principal |
| Nível de confiança | ✅ existe (global, não por dimensão) |

As seis dimensões permanecem inalteradas. **A lógica atual não foi tocada.**

---

## 7. Score Card no alvo (§20)

```
Crossability  ──▶  avaliações propostas  ──▶  SCORE ENGINE
                                                   │
                                    pesos do cliente (modelo por cliente)
                                                   │
                                          cálculo determinístico
                                                   │
                                          Cross Score Card
                                                   │
                                            ═══ HUMAN GATE ═══
```

**Confirmado no código:** `scoreFitDaAnalise()`
([agentes.service.ts:1295](backend/src/modules/agentes/agentes.service.ts#L1295))
calcula em TypeScript — 70% dimensões, 30% confiança. **A LLM nunca emite o
score final.** RN022 e RN023 seguem protegidas por trigger.

**Impacto do novo domínio:** nenhum. O Score Card se vincula a
`candidatura_parceiro`, que continua sendo a Oportunidade. A mudança de
significado de Projeto não afeta o fluxo.

**Ponto de atenção:** o Score Engine está **disperso** — parte em
`agentes.service.ts`, parte em `metodologias`. Consolidá-lo como serviço
compartilhado é trabalho da extração do Agent Framework.

---

## 8. Agent Memory (§25)

| Item | Situação | Onde |
|---|---|---|
| Jornada | **NÃO EXISTE** | pipeline é `partner_discovery`/`market_intelligence`, não jornada |
| Pergunta / objetivo | **EXISTE** | `execucao_agente.entrada` |
| Entidade inicial | **PARCIAL** | em `entrada`, sem FK |
| Plano | **EXISTE** | saída do `search_planning` |
| Buscas | **EXISTE** | saída do `source_collector` |
| Ferramentas | **EXISTE** | `uso_ferramenta` (após 053) |
| Fontes | **EXISTE** | saída do collector + `oportunidade_ia.fontes` |
| Fatos | **PARCIAL** | derivados em execução, não persistidos como entidade |
| **Fatos descartados** | **NÃO EXISTE** | filtros descartam sem registrar o quê nem por quê |
| Verification | **EXISTE** | saída do `fact_verifier` (após hardening) |
| Knowledge retrieval | **PARCIAL** | só em `market_intelligence` |
| Candidatos | **EXISTE** | saída da extração |
| Reasoning | **EXISTE** | 1 execução por candidato |
| Recommendation | **EXISTE** | saída do `recommendation` |
| Score Card | **EXISTE** | `avaliacao_score_card` |
| Custo | **EXISTE** | `custo_estimado` (após 053) |
| Decisão humana | **PARCIAL** | `oportunidade_ia.status`, sem justificativa estruturada |
| Edição humana | **NÃO EXISTE** | não se registra o que o humano alterou |
| Resultado posterior | **NÃO EXISTE** | não há realimentação do desfecho |

**Contagem:** 10 existem · 5 parciais · 4 não existem.

**As três lacunas mais relevantes** — fatos descartados, edição humana e
resultado posterior — são exatamente as que fechariam o **ciclo de aprendizado**
da visão do produto. Sem elas, a plataforma registra o que fez, mas não aprende
com o desfecho.

---

## 9. Compatibilidade com os gaps do hardening (§24)

A arquitetura alvo é compatível com os gaps em aberto:

| Gap | Compatível? | Como |
|---|---|---|
| Migrations 053/054 pendentes | ✅ | Alvo depende delas; ordem preservada |
| Suíte de integração pendente | ✅ | Nenhuma mudança de comportamento proposta |
| Teto de gasto | ✅ | Entra no Cross Orchestrator, antes de cada etapa cara |
| Retry | ✅ | `tentativa` já é registrada; política entra no orchestrator |
| Checkpoints das etapas caras | ✅ | Contrato `Checkpoint` já suporta |
| Retomada | ✅ | Infraestrutura pronta; falta o gatilho |
| Verification → Crossability | ✅ | Ponto de entrada mapeado (§5) |
| RAG insuficiente | ✅ | Tratado na próxima etapa |

**Nenhum gap conflita com a arquitetura alvo.**

---

## 10. Pipeline canônico como protocolo (§6)

Registro formal: as nove etapas **não implicam** nove agentes, nove chamadas de
LLM, nove serviços nem nove endpoints.

Situação real hoje:

| Etapa | Implementação | LLM? |
|---|---|---|
| Planning | TypeScript + SQL (frentes) | Não (partner_discovery) |
| Collect | HTTP externo | Não |
| Credibility | TypeScript determinístico | Não |
| Verification | TypeScript determinístico | Não |
| Entity Resolution | TypeScript + SQL | Não |
| Extraction | LLM + Firecrawl | **Sim** |
| Crossability | TypeScript (heurística) ou LLM | Depende |
| Recommendation | TypeScript determinístico | Não |
| Human Gate | Interface + banco | Não |

**Uma ou duas etapas usam LLM.** As demais são determinísticas — e isso é
desenho correto, não limitação: filtro barato antes de raciocínio caro.
