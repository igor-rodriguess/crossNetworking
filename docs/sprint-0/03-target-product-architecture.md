# 03 — Arquitetura Alvo: Cross Intelligence

**Plataforma Cross** · Sprint 0
Data: 07/08/2026

> Documento conceitual. Descreve o destino, não um plano de implementação — o
> plano está em `07-sprint-0-execution-plan.md`. Nada aqui deve ser construído
> nesta sprint.

---

## 1. A mudança de eixo

**Hoje** a plataforma organiza-se por um fluxo linear obrigatório:

```
CLIENTE → PROJETO → FRENTE → CANDIDATURA → PARCERIA → EXECUÇÃO → RESULTADOS
```

Esse fluxo pressupõe que todo trabalho começa num cliente e termina numa
parceria executada. A auditoria mostra que a Cross não trabalha assim: a cauda
do fluxo (execução e resultados, 44 rotas) **não tem interface e não é usada**,
enquanto o trabalho real de descoberta acontece no pipeline de IA.

**O alvo** substitui o fluxo linear por um ciclo de inteligência:

```
                    ┌───────────────────────────────────┐
                    │   A. CLIENTE → PARCEIRO           │
   ENTRADAS ───────▶│   B. PARCEIRO → CLIENTE           │
                    │   C. PROSPECÇÃO DO ZERO           │
                    └────────────────┬──────────────────┘
                                     ▼
                    ┌───────────────────────────────────┐
                    │      CROSS INTELLIGENCE BASE      │
                    │  partes · perfis · ativos ·       │
                    │  públicos · territórios ·         │
                    │  documentos · reuniões · RAG      │
                    └────────────────┬──────────────────┘
                                     ▼
                    ┌───────────────────────────────────┐
                    │      MOTOR DE INTELIGÊNCIA        │
                    │  Planning → Collect →             │
                    │  Credibility → Verification →     │
                    │  Entity Resolution → Extraction   │
                    └────────────────┬──────────────────┘
                                     ▼
                            ┌────────────────┐
                            │ OPORTUNIDADES  │
                            └────────┬───────┘
                                     ▼
                        ┌────────────────────────┐
                        │  CROSSABILITY (motor)  │
                        │  CROSS SCORE CARD      │
                        └────────────┬───────────┘
                                     ▼
                            ┌────────────────┐
                            │   HUMAN GATE   │  ◀── IA propõe, humano valida
                            └────────┬───────┘
                                     ▼
                        NOVAS INFORMAÇÕES VALIDADAS
                                     │
                                     └──────▶ volta à Intelligence Base
```

O ciclo é o ponto: cada validação humana **enriquece a base**, tornando a
próxima análise melhor. A plataforma deixa de ser um registro do que aconteceu e
passa a ser um ativo que acumula inteligência.

---

## 2. As três jornadas de entrada

### Jornada A — Cliente → Parceiro

*"Temos a Aramis como cliente. Quem deveria ser parceiro dela?"*

O sistema já conhece objetivos, públicos, territórios, ativos e critérios do
cliente. O motor busca externamente e cruza com esse conhecimento.

**O que já existe:** `POST /agentes/partner-discovery/async`, com tarefa
assíncrona e progresso observável. Perfil estratégico, públicos, territórios e
ativos vivem em `cross_intelligence` (38 rotas).

**O que falta:** nada estrutural. É a jornada mais madura.

### Jornada B — Parceiro → Cliente

*"Tivemos uma reunião com a Converse. Para quais clientes isso serve?"*

A reunião é estruturada e cruzada contra a base de clientes.

**O que já existe:** `market-intelligence`, o RAG e a resolução de entidades.

**O que falta — e é o gap mais relevante do produto novo:** reuniões hoje só
existem dentro de `cross_execution`, presas a uma `parceria_id`. Uma reunião com
a Converse, que ainda não é parceira de ninguém, **não tem onde ser registrada**.

> **Decisão necessária.** Reunião precisa deixar de ser um evento de execução de
> parceria e passar a ser um **evento de inteligência ligado a uma Parte**.
> Isto é uma mudança de modelo, não de interface. Está fora do escopo da Sprint 0
> (que não altera o banco), mas é a primeira coisa a fazer depois dela.

### Jornada C — Prospecção do zero

*"Queremos abordar a X, e não sabemos quase nada sobre ela."*

O sistema pesquisa contexto, mercado, notícias, movimentos, campanhas e
compara com o conhecimento interno.

**O que já existe:** `market-discovery-planning`, `source-collector`,
`source-credibility`, `fact-verifier`, `information-extractor`, Firecrawl e
busca web.

**O que falta:** consolidação. As peças existem como rotas isoladas; falta a
jornada montada de ponta a ponta com uma entrada única.

---

## 3. Cross Intelligence Base

A base de conhecimento que as três jornadas alimentam e consultam. **Toda ela
já existe** — a mudança é de posição no produto, não de construção.

| Camada | Onde vive hoje | Situação |
|---|---|---|
| Identidade (Partes) | `cross_core.parte` | Pronto |
| Perfil estratégico | `cross_intelligence` | Pronto |
| Ativos, públicos, territórios, praças | `cross_intelligence` | Pronto |
| Documentos | `cross_core`, `modules/documentos` | Pronto, sem interface |
| Evidências e fontes | `cross_governance` | Pronto, sem interface |
| Conhecimento vetorial | `cross_ai.documento_rag` (pgvector, HNSW) | Pronto |
| Reuniões | `cross_execution` | **Precisa migrar para inteligência** |
| Histórico de decisões | `cross_methodologies` | Pronto |

**Princípio:** a Intelligence Base é a única fonte de contexto dos agentes.
Nenhum agente consulta o domínio operacional diretamente.

---

## 4. Motor de inteligência

O pipeline conceitual do briefing **já está implementado** (13 agentes, uma rota
por etapa). O trabalho futuro é de organização, não de construção:

| Etapa | Agente existente | Situação |
|---|---|---|
| Planning | `search-planning`, `market-discovery-planning` | Pronto |
| Collect | `source-collector` + Firecrawl + web-search | Pronto |
| Credibility | `source-credibility` | Pronto |
| Verification | `fact-verifier` | Pronto |
| Entity Resolution | `entity-resolver` | Pronto |
| Extraction | `information-extractor` | Pronto |
| Crossability Reasoning | `crossability-reasoning` | Pronto |
| Recommendation | `recommendation`, `opportunity-qualification` | Pronto |
| Human Gate | `POST /agentes/human-gate` | Pronto |

**O que muda:** hoje a orquestração está concentrada em `agentes.service.ts`
(2.153 linhas). O alvo é um **Agent Framework** com contrato explícito por etapa,
permitindo compor pipelines sem reescrever o orquestrador. Ver `06` e Fase E.

---

## 5. Oportunidades como entidade central

No produto antigo, a unidade de trabalho é a **candidatura** (marca dentro de uma
frente dentro de um projeto). No produto novo, é a **oportunidade** — que pode
nascer sem projeto e sem frente.

`cross_ai.oportunidade_ia` já tem a forma certa: score de fit, confiança,
**fontes**, briefing, e um ciclo de status (`rascunho` → `em_curadoria` →
`aprovada` | `descartada`).

**O que muda conceitualmente:** oportunidade deixa de ser um subproduto do
pipeline e passa a ser a entidade que o usuário manipula. Uma oportunidade
aprovada no Human Gate é que *pode* virar candidatura — e não o contrário.

---

## 6. Crossability e Score Card no novo arranjo

Ambos permanecem, com papéis distintos:

**Crossability** deixa de ser ferramenta operacional manual e passa a ser
**motor de raciocínio**: as seis dimensões são aplicadas pelo agente sobre o
contexto da base, produzindo o rascunho analítico. O usuário lê o resultado e
sua justificativa; não preenche as dimensões à mão como tarefa rotineira.

**Cross Score Card** permanece como **instrumento de decisão humana**, com
modelo próprio por cliente, critérios ponderados e vigência. É onde a avaliação
se formaliza — e continua protegido pelas regras de banco RN022 e RN023.

A distinção importa: Crossability é *como a IA pensa*; Score Card é *como a
Cross decide*. Nenhum dos dois substitui o outro.

---

## 7. Human Gate — invariante do produto

```
        SAÍDA DE AGENTE (sempre rascunho)
                    │
                    ▼
        ┌───────────────────────────┐
        │  Curadoria humana         │
        │  · evidências visíveis    │
        │  · fontes rastreáveis     │
        │  · confiança declarada    │
        └───────────┬───────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
    APROVADA                DESCARTADA
        │                       │
        ▼                       ▼
  vira dado de domínio    permanece como
  (candidatura, parte,    aprendizado na
   perfil…)               base
```

**Regras invariantes:**

1. Nenhuma saída de agente vira verdade operacional automaticamente.
2. Toda recomendação carrega suas fontes e seu grau de confiança.
3. A decisão humana é registrada com autor e horário (auditoria imutável).
4. O descarte também é informação — alimenta a base, não é perda.

O ponto 4 é o que fecha o ciclo: hoje `oportunidade_ia` já tem status
`descartada`, mas o descarte não retroalimenta nada. No alvo, ele deveria
informar futuras análises.

---

## 8. Observabilidade e custo

Registro por execução, conforme o briefing. Situação verificada:

| Campo | Onde está hoje | Situação |
|---|---|---|
| `model` | `execucao_agente.origem` (grânulo de provedor) | **Parcial** |
| `input_tokens` | `execucao_agente.tokens_entrada` | Pronto |
| `output_tokens` | `execucao_agente.tokens_saida` | Pronto |
| `cached_input_tokens` | — | **Falta** |
| `tool_calls` | — | **Falta** |
| `web_search_calls` | — | **Falta** |
| `scraping_usage` | — | **Falta** |
| `started_at` / `finished_at` | `criado_em` + `duracao_ms` | **Parcial** |
| `latency` | `duracao_ms` | Pronto |
| `estimated_cost` | — | **Falta** |
| `status` | `execucao_agente.status` | Pronto |
| `human_gate_status` | `oportunidade_ia.status` | Pronto |

Detalhamento em `06-ai-readiness-assessment.md`.

---

## 9. O que sai do centro (sem ser destruído)

| Área | Destino |
|---|---|
| Execução detalhada, entregas, pendências | Sai da experiência; backend preservado |
| Indicadores, medições, ROI, encerramento | Sai da experiência; backend preservado |
| Contratos e contrapartidas | Vira leitura histórica no perfil da parte |
| Funil comercial | Já órfão; confirmar desuso |
| Cronograma de parcerias | Sai do menu |

**Nada disso é apagado.** O histórico de parcerias fechadas é insumo legítimo de
inteligência: saber que a Aramis já fechou com determinada marca informa
recomendações futuras. O que muda é que essas áreas param de ocupar a experiência
principal e param de receber investimento de desenvolvimento.

---

## 10. Menor núcleo necessário

Resposta à pergunta de sucesso da Sprint 0 — *"qual é o menor núcleo para
começar a implementar agentes de alta qualidade?"*:

1. **Partes + perfil estratégico + ativos/públicos/territórios** — o contexto
2. **Documentos + reuniões + RAG** — o conhecimento acumulado
3. **Pipeline de agentes + execução observável** — o motor
4. **Oportunidades + evidências/fontes** — a saída rastreável
5. **Crossability + Score Card** — o julgamento
6. **Human Gate + auditoria** — a validação
7. **Auth + persona + escopo por cliente** — a segurança

Tudo isso **já existe**. O núcleo não precisa ser construído; precisa ser
**revelado**, tirando de cima dele a camada operacional que o encobre.

**Continua em:** `04-navigation-redesign.md`.
