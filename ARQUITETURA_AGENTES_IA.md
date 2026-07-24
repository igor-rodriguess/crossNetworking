# Arquitetura Multiagente — Plataforma Cross

> **Status:** documento de trabalho para validação de arquitetura.
> **Escopo:** revisão crítica dos pipelines *Partner Discovery* e *Market Intelligence*, projeto de fundação compartilhada e proposta de novos agentes.
> **Âncora:** modelo de domínio real da plataforma (módulos `inteligencia`, `metodologias`, `partes`, `projetos`, `parcerias`) e metodologia Crossability de **seis** dimensões.
> **Nada aqui foi implementado** — é material de decisão.

---

## Sumário

1. [Premissa que muda o desenho](#1-premissa-que-muda-o-desenho)
2. [Premissas de negócio a validar (bloqueiam decisões)](#2-premissas-de-negócio-a-validar)
3. [Pontos fortes e fracos da arquitetura proposta](#3-pontos-fortes-e-fracos)
4. [Melhorias diretas nos dois pipelines](#4-melhorias-diretas-nos-dois-pipelines)
5. [Fundação compartilhada (camadas)](#5-fundação-compartilhada)
6. [Memória, RAG, vetorial e relacional — quem compartilha o quê](#6-memória-rag-vetorial-e-relacional)
7. [Paralelismo — o que roda junto e o que serializa](#7-paralelismo)
8. [Sete agentes novos (com specs completas)](#8-sete-agentes-novos)
9. [Diagrama de dependências entre agentes](#9-diagrama-de-dependências)
10. [Riscos e anti-padrões a evitar](#10-riscos-e-anti-padrões)
11. [Critérios de sucesso mensuráveis](#11-critérios-de-sucesso)
12. [Sequenciamento realista (ondas)](#12-sequenciamento-realista)

---

## 1. Premissa que muda o desenho

Os dois agentes propostos **não escrevem num vácuo**. A plataforma já modela as entidades-destino:

- O módulo `inteligencia` versiona **perfis estratégicos** e mantém **Big Moments**, públicos, praças e territórios como entidades reais.
- O módulo `metodologias` guarda a **Crossability**.
- **Papers** já têm ciclo de estado `rascunho → em_revisao → vigente → substituida`, com **validação interna e do cliente** (`ValidacaoPaper`).

**Consequência de arquitetura:** os agentes não são um produto de IA paralelo — são **produtores de rascunhos para o pipeline humano que já existe**. Toda saída de agente deve nascer como uma versão em estado `rascunho`, sujeita à mesma validação humana que hoje protege a metodologia.

> Essa é a diferença entre "mais um wrapper de LLM" e uma plataforma de inteligência defensável. O agente **propõe**; o especialista **promove**.

### ⚠️ Alerta factual: 3 dimensões no discurso, 6 no código

O material de apresentação fala em **três** dimensões (objetivos · ativos · consumidores). O modelo de dados (`AnaliseCrossability`) implementa **seis**:

```
publicos · territorios · ativos · sinergias · fit · momento
```

Todo agente de *Crossability Reasoning* precisa produzir os **seis** níveis (`alta | media | baixa`), a recomendação (`recomendada | em_estudo | nao_recomendada`) e o racional. Caso contrário, gera análises que a própria tela rejeita. **Isto é requisito, não detalhe** — e vale alinhar internamente se o discurso comercial deve migrar para as 6 dimensões ou se as 3 são um agrupamento das 6.

---

## 2. Premissas de negócio a validar

> Estas premissas alimentam decisões de arquitetura abaixo. Se alguma estiver errada, **marque** — parte do desenho muda.

| # | Premissa assumida | Impacto se falsa |
|---|---|---|
| P1 | Fechar uma parceria tem um **lead-time típico** (semanas a meses) que dá para estimar. | Sem isso, o *Timing Agent* (C) não prioriza — vira só um alerta de data. |
| P2 | Um cliente pode ter **cláusulas de exclusividade** que proíbem parceiros concorrentes simultâneos. | Sem isso, o *Conflict Guard* (D) perde metade do valor. |
| P3 | A Cross tem (ou terá) **ROI histórico** de parcerias fechadas o suficiente para calibrar estimativas. | Sem base histórica, ROI Calibrado vira estimativa não-ancorada; adiar o agente. |
| P4 | Os especialistas aceitam **revisar rascunhos de IA** em vez de exigir output final pronto. | Se exigem "pronto", o Human Gate vira gargalo e a proposta de valor cai. |
| P5 | Dados de mercado externos (eventos, artistas) virão de **fontes com licença/API**, não só scraping. | Scraping puro cria risco legal e de estabilidade na coleta contínua do Market Intelligence. |
| P6 | O volume justifica automação: **dezenas+ de projetos/candidaturas** por período. | Em volume baixo, o custo de LLM por execução pode não compensar vs. trabalho manual. |

---

## 3. Pontos fortes e fracos

### O que está certo (manter)

- **Separar planejamento de coleta.** Ter um *Search Planning* antes do *Collector* evita busca no impulso, torna a coleta auditável e barata de reexecutar. Reaproveitável entre os dois agentes sem mudança.
- **RAG de conhecimento no meio do fluxo, não só no fim.** Consultar Crossability + papers + decisões *antes* do matching é o que separa recomendação fundamentada de palpite. É o ativo de dados que a concorrência não tem.
- **Decomposição por responsabilidade.** A espinha `Planning → Collect → Validate → Extract → Reason → Recommend` é a correta e reutilizável.

### Onde está frágil (corrigir)

| Fraqueza | Problema | Correção |
|---|---|---|
| **`Source Validator` sobrecarregado** | Comprime 3 responsabilidades distintas: credibilidade da fonte ≠ veracidade do fato ≠ deduplicação de entidade. | Separar em `Source Credibility` + `Fact Verifier` + `Entity Resolver`. |
| **Loop de aprendizado aberto** | Nada captura se a recomendação virou parceria, foi recusada ou o Paper foi reprovado. O sistema nunca melhora. | Introduzir o *Feedback & Learning Loop* (Agente A). **Furo mais caro.** |
| **ROI sem baseline** | Estimar ROI sem ancorar em `parcerias.roi` histórico gera confiança falsa. | *ROI Calibrado*: intervalo + nível de confiança, calibrado em parcerias comparáveis. |
| **Sem portão de curadoria explícito** | Ambos terminam gerando artefatos sem gate humano formal. A metodologia atual exige validação. | *Human Gate* como nó obrigatório antes de qualquer escrita na base. |
| **Timing ausente** | Big Moment sem janela de acionamento é meia-informação. | *Timing & Window Agent* (C). |

---

## 4. Melhorias diretas nos dois pipelines

Sem redesenhar — só corrigindo os pontos frágeis. Nós adicionados marcados com **(novo)**.

### Partner Discovery, revisado

```
1. Search Planning
2. Source Collector
3a. Source Credibility   (novo)   — a origem é reputável?
3b. Fact Verifier        (novo)   — a afirmação confere em 2+ fontes?
3c. Entity Resolver      (novo)   — dedup + casa com Partes existentes
4. Information Extractor
5. Knowledge RAG          [compartilhado]
6. Opportunity Matching   (6 dimensões)
7. Crossability Reasoning (explica os 6 níveis)
8. Recommendation
8½. Human Gate           (novo)   — curadoria → rascunho aprovado
9. Paper Generator       → cria VersaoPaper em estado `rascunho`
```

**A mudança de estado que amarra tudo:** o Paper Generator não cria um Paper "pronto" — cria uma `VersaoPaper` em `rascunho`, que entra no fluxo de validação existente (`interna` → `cliente`). Zero atrito com a metodologia atual.

### Market Intelligence, revisado

Três ajustes sobre os 13 passos:

- **Big Moment Detection** escreve direto na entidade `bigMoments` do módulo `inteligencia`, com o campo `oportunidade` preenchido (que a tela de Artistas já lê).
- **ROI Estimator → ROI Calibrado:** consulta `parcerias.roi` de parcerias comparáveis antes de estimar; devolve intervalo + confiança.
- **Timing Agent (novo)** entre detecção e recomendação: um Big Moment tem *janela*. Recomendar duas semanas antes do evento é ouro; duas semanas depois é lixo.

---

## 5. Fundação compartilhada

O erro caro seria construir os dois pipelines como torres isoladas. Eles são **o mesmo motor com entradas diferentes**: um parte de um projeto e busca empresas; o outro parte de um evento e busca oportunidades. Tudo no meio é comum.

```
┌─────────────────────────────────────────────────────────────┐
│  CAMADA DE AGENTES DE TAREFA           (por caso de uso)     │
│  Partner Discovery · Market Intelligence · agentes novos     │
│  → orquestram os componentes abaixo, não reimplementam       │
├─────────────────────────────────────────────────────────────┤
│  COMPONENTES REUTILIZÁVEIS             (compartilhados)      │
│  Search Planning · Collector · Credibility · Fact Verifier   │
│  Entity Resolver · Extractor · Crossability Reasoning ·      │
│  Human Gate                                                  │
├─────────────────────────────────────────────────────────────┤
│  FUNDAÇÃO DE CONHECIMENTO              (um só cérebro)       │
│  Knowledge RAG · banco vetorial · memória de decisões ·      │
│  banco relacional (schema atual)                             │
└─────────────────────────────────────────────────────────────┘
```

**Regra de projeto:** se um componente é útil para dois agentes, ele não pertence a nenhum dos dois — sobe para a camada de componentes. *Crossability Reasoning* é o caso exemplar: idêntico nos dois pipelines, deve existir **uma vez**, versionado junto com a metodologia. Quando a Cross refina a Crossability, um único componente muda e os dois agentes herdam.

---

## 6. Memória, RAG, vetorial e relacional

A pergunta certa não é "cada agente tem seu banco?" — é "qual camada de dados serve qual propósito?".

| Store | Guarda | Quem escreve | Quem lê | Compartilhado? |
|---|---|---|---|---|
| **Banco vetorial** | Embeddings de papers, perfis de Partes, decisões, transcrições | Extractor, Paper Generator, ingestão | Todo agente de matching/reasoning | **Único** |
| **Relacional** (schema atual) | Partes, Candidaturas, Papers, Parcerias, ROI, Big Moments | Human Gate (após curadoria) | Todos — fonte de verdade | **Único** |
| **Memória de decisões** | O que foi recomendado, aceito, recusado e *por quê* | Feedback Loop (A) | Recommendation, Reasoning, ROI | **Único** |
| **Memória de trabalho** | Estado efêmero de uma execução | O agente da execução | Só o próprio agente | **Isolado** |
| **Cache de coleta** | Páginas/respostas de API já buscadas (TTL) | Collector | Collectors de qualquer agente | **Por fonte** |

**Princípio:** o *conhecimento* (vetorial, relacional, decisões) é **global e único** — é o que faz a plataforma ficar mais esperta a cada projeto. O *estado de execução* é **local e descartável**. Misturar os dois é a origem de ~90% dos bugs de sistemas multiagente: um agente lê o rascunho sujo de outro achando que é verdade estabelecida.

---

## 7. Paralelismo

**Regra:** paraleliza tudo que é *independente por fonte ou por candidato*; serializa tudo que *depende do consenso do passo anterior*.

**Paraleliza:**
- **Leque de coleta** — cada fonte (web, redes, notícias, bases setoriais) é independente. Derruba coleta de minutos para segundos.
- **Fact Verifier** — cada afirmação é checada em paralelo.
- **Reasoning por candidato** — a análise Crossability de cada candidato é independente. 40 candidatos = 40 execuções paralelas, um ranking único no fim.

**Serializa (pontos de sincronização obrigatórios):**
- **Entity Resolver** — precisa do conjunto todo para deduplicar.
- **Ranking final** — precisa de todos os scores.
- **Human Gate** — decisão humana, por definição.

**No nível macro:** Partner Discovery e Market Intelligence rodam **totalmente em paralelo** (projetos e eventos diferentes). Compartilham a fundação de *leitura* sem contenção; a *escrita* na base só acontece depois do Human Gate, um de cada vez.

---

## 8. Sete agentes novos

Em ordem de retorno estratégico. Cada um reaproveita a fundação; nenhum é silo.

### A · Feedback & Learning Loop  ⭐ o mais importante

Transforma a plataforma de "ferramenta" em "ativo que aprende". Sem ele, todos os outros são um especialista júnior congelado no tempo. Fecha o loop que os dois pipelines originais deixam aberto.

| Campo | Detalhe |
|---|---|
| **Objetivo** | Capturar o desfecho real de cada recomendação e retroalimentar o reasoning. |
| **Entradas** | Mudanças de status de Candidatura, validações de Paper, ROI realizado de parcerias. |
| **Saídas** | Sinais de calibração ("recomendações do tipo X são aceitas 3× mais"); pesos ajustados por cliente. |
| **Ferramentas** | Triggers no relacional, análise estatística, escrita na memória de decisões. |
| **Fluxo** | Observa transições de estado → correlaciona com o que foi recomendado → escreve o par (recomendação, desfecho) na memória de decisões → Reasoning/Recommendation passam a consultá-la. |
| **Integração** | Alimenta Crossability Reasoning, Recommendation e ROI Calibrado. |
| **Valor** | Efeito de rede de dados: quanto mais a Cross usa, melhor fica. Barreira competitiva inimitável. |

### B · Client Fit Profiler

A Crossability não é universal — cada cliente pesa as dimensões diferente (`criterios` já tem `pesoSim`/`pesoNao` por cliente). Este agente aprende o "gosto" estratégico de cada cliente.

| Campo | Detalhe |
|---|---|
| **Objetivo** | Modelar o que *este* cliente historicamente aprova, para pré-filtrar recomendações. |
| **Entradas** | Papers validados/reprovados do cliente, critérios e pesos ativos, decisões passadas. |
| **Saídas** | Perfil de preferência por cliente: dimensões valorizadas, tipos de parceiro rejeitados. |
| **Ferramentas** | RAG sobre papers do cliente, memória de decisões, relacional. |
| **Fluxo** | Lê o histórico do cliente → extrai padrões de aceitação/rejeição → gera vetor de preferência → injeta como contexto no Opportunity Matching antes do ranqueamento. |
| **Integração** | Refina o matching dos dois pipelines; consome saídas do Feedback Loop. |
| **Valor** | Menos recomendações descartadas; lista já afinada ao cliente. |

### C · Timing & Window Agent

Uma oportunidade tem prazo de validade. Pontua urgência — metade do valor de um Big Moment.

| Campo | Detalhe |
|---|---|
| **Objetivo** | Estimar a janela ótima de acionamento e priorizar por urgência. |
| **Entradas** | Datas de Big Moments, agenda/turnês de artistas (já no schema), ciclos de campanha das marcas. |
| **Saídas** | Score de urgência + "agir até dd/mm"; alertas de janelas fechando. |
| **Ferramentas** | Relacional (datas), lógica temporal, fila de notificação. |
| **Fluxo** | Cruza data do Big Moment com lead-time típico de fechar parceria (P1) → calcula janela → reordena a fila por "fecha primeiro", não por "score mais alto". |
| **Integração** | Entre Big Moment Detection e Campaign Recommendation no Market Intelligence. |
| **Valor** | Transforma o Dashboard "Requer atenção" em fila priorizada por dinheiro que escapa. |

### D · Portfolio Conflict Guard

O risco que nenhum agente de descoberta enxerga sozinho: recomendar um parceiro que compete com — ou canibaliza — outra parceria ativa do mesmo cliente. Agente de *defesa*.

| Campo | Detalhe |
|---|---|
| **Objetivo** | Detectar conflitos de exclusividade, concorrência e sobreposição no portfólio do cliente. |
| **Entradas** | Parcerias ativas do cliente, categorias/territórios das Partes, cláusulas de exclusividade (P2). |
| **Saídas** | Flag de conflito com severidade + explicação ("Marca X compete com parceria ativa Y"). |
| **Ferramentas** | Relacional, RAG sobre contratos/papers, grafo de relacionamentos. |
| **Fluxo** | Antes do Human Gate, cada recomendação passa por checagem contra o portfólio ativo → conflitos viram bloqueios ou avisos anexados. |
| **Integração** | Nó de guarda antes do Human Gate, nos dois pipelines. |
| **Valor** | Evita o erro que queima confiança do cliente — vale mais que dez boas sugestões. |

### E · Paper Critic (adversarial)

Um Paper gerado por IA precisa de um segundo par de olhos de IA antes do humano. Ataca o próprio Paper: furo lógico, dado sem fonte, justificativa fraca.

| Campo | Detalhe |
|---|---|
| **Objetivo** | Revisar criticamente o Paper rascunho e devolver objeções acionáveis antes da validação humana. |
| **Entradas** | Paper rascunho, evidências citadas, Crossability da candidatura. |
| **Saídas** | Lista priorizada de fraquezas: afirmações sem fonte, dimensões fracas escondidas, riscos omitidos. |
| **Ferramentas** | RAG para checar citações, o Fact Verifier compartilhado. |
| **Fluxo** | Recebe rascunho do Paper Generator → tenta refutá-lo → devolve para revisão automática ou anexa objeções para o especialista. |
| **Integração** | Entre Paper Generator e Human Gate. |
| **Valor** | Papers chegam ao cliente mais robustos; menos ciclos de "ajustes solicitados". |

### F · Relationship Graph Agent

O ativo mais subutilizado da Cross é o grafo implícito de quem-já-trabalhou-com-quem. Torna-o explícito e navegável.

| Campo | Detalhe |
|---|---|
| **Objetivo** | Manter um grafo de relacionamentos e revelar caminhos de introdução e afinidades indiretas. |
| **Entradas** | Partes, contatos, parcerias históricas, co-participações em projetos. |
| **Saídas** | "A marca X chega ao artista Y via parceiro Z"; clusters de afinidade. |
| **Ferramentas** | Banco de grafo, embeddings de Partes, relacional. |
| **Fluxo** | Constrói o grafo a partir do relacional → responde consultas de caminho → sugere ao Matching candidatos por proximidade de rede, não só por similaridade de perfil. |
| **Integração** | Enriquece o Opportunity Matching dos dois pipelines com um sinal novo. |
| **Valor** | O "warm intro" fecha mais rápido — vale ouro. |

### G · Narrative & Pitch Agent

Uma coisa é a Crossability estar certa; outra é vendê-la ao cliente. Traduz o Paper técnico em pitch persuasivo, no tom de cada cliente.

| Campo | Detalhe |
|---|---|
| **Objetivo** | Gerar a narrativa de apresentação da parceria, adaptada ao cliente e ao canal. |
| **Entradas** | Paper validado (`vigente`), perfil do cliente (Agente B), ROI calibrado. |
| **Saídas** | Deck/roteiro de pitch, resumo executivo, variações por audiência. |
| **Ferramentas** | RAG de pitches vencedores passados, geração de texto/layout. |
| **Fluxo** | Dispara só sobre Paper já `vigente` → veste a análise com a narrativa e o tom que aquele cliente responde melhor. |
| **Integração** | Consome o Client Fit Profiler; final da cadeia, após Human Gate. |
| **Valor** | Encurta o caminho da análise ao "sim" do cliente — onde o dinheiro entra. |

---

## 9. Diagrama de dependências

```
                          ┌──────────────────────┐
                          │  FUNDAÇÃO (§5, §6)    │
                          │  RAG · vetorial ·     │
                          │  relacional · decisões│
                          └──────────┬───────────┘
                                     │ (lê/escreve)
        ┌────────────────────────────┼────────────────────────────┐
        │                            │                            │
┌───────▼────────┐          ┌────────▼─────────┐        ┌─────────▼────────┐
│ Partner        │          │ Market           │        │ Componentes      │
│ Discovery      │          │ Intelligence     │        │ compartilhados   │
│                │          │  + Timing (C)    │        │ Reasoning·Gate·  │
│                │          │  + ROI Calibrado │        │ Fact·Entity      │
└───────┬────────┘          └────────┬─────────┘        └──────────────────┘
        │                            │
        └─────────────┬──────────────┘
                      │ recomendações
              ┌───────▼────────┐
              │ Conflict Guard │ (D)  ← checa portfólio antes do gate
              └───────┬────────┘
              ┌───────▼────────┐
              │  Human Gate    │  ← curadoria (serializa)
              └───────┬────────┘
                      │ aprovado → rascunho na base
      ┌───────────────┼───────────────┐
┌─────▼─────┐   ┌─────▼──────┐   ┌─────▼──────┐
│ Paper     │──▶│ Paper      │   │ Narrative  │ (G)
│ Generator │   │ Critic (E) │   │ & Pitch    │
└───────────┘   └────────────┘   └────────────┘

CROSS-CUTTING (observam tudo e retroalimentam):
  • Feedback & Learning Loop (A) ── escreve memória de decisões
  • Client Fit Profiler (B)      ── injeta preferência no Matching
  • Relationship Graph (F)       ── injeta sinal de rede no Matching
```

---

## 10. Riscos e anti-padrões

| Anti-padrão | Sintoma | Mitigação |
|---|---|---|
| **Agente lê rascunho de outro como verdade** | Alucinação em cascata; empresa ruim vira Paper. | Separar memória de trabalho (isolada) de conhecimento (global). Só escreve na base após Human Gate. |
| **RAG sem versionamento da metodologia** | Reasoning cita uma Crossability antiga após refino. | Versionar o corpus; o RAG referencia a versão vigente da metodologia. |
| **Custo de LLM descontrolado** | Reasoning em N candidatos × M dimensões explode a conta. | Filtro barato (heurística/embeddings) antes do LLM caro; cache de coleta; P6. |
| **Confiança falsa em ROI/estimativas** | Números precisos sem intervalo de incerteza. | Sempre devolver faixa + nível de confiança + fontes; nunca número seco. |
| **Human Gate vira gargalo** | Fila de rascunhos que ninguém revisa. | Priorizar a fila (Timing C); Paper Critic (E) pré-filtra; medir tempo de fila (§11). |
| **Coleta contínua frágil/ilegal** | Market Intelligence quebra ou gera risco jurídico. | Fontes licenciadas/API (P5); circuit breaker por fonte; observabilidade de coleta. |
| **"IA que decide sozinha"** | Perda de confiança do cliente e da metodologia. | Human-in-the-loop obrigatório; toda saída rastreável até a evidência. |

---

## 11. Critérios de sucesso

Métricas por agente — o que provaria que ele funciona (não vaidade, valor).

| Agente | Métrica de sucesso |
|---|---|
| Partner Discovery | % de recomendações que o especialista aprova sem descartar; tempo de descoberta vs. manual. |
| Market Intelligence | Big Moments detectados **antes** do pico vs. detectados tarde; % que viram oportunidade acionada. |
| A · Feedback Loop | Melhora mensurável na taxa de aceitação ao longo do tempo (a curva sobe). |
| B · Client Fit | Redução do descarte de recomendações por cliente. |
| C · Timing | % de oportunidades acionadas **dentro** da janela. |
| D · Conflict Guard | Conflitos capturados antes de irem ao cliente (falsos negativos → zero). |
| E · Paper Critic | Redução de ciclos "ajustes solicitados" na validação do cliente. |
| F · Graph | % de recomendações fechadas que usaram um caminho de rede sugerido. |
| G · Narrative | Taxa de conversão do pitch (sim do cliente) vs. baseline. |
| **Global** | Tempo médio da análise ao "sim" do cliente; custo de LLM por parceria fechada. |

---

## 12. Sequenciamento realista

Não construir os nove agentes de uma vez. A ordem maximiza valor cedo e evita sofisticar o reasoning antes de ter a fundação de confiança que o alimenta.

| Onda | Construir | Por quê primeiro | Esforço |
|---|---|---|---|
| **Fundação** | Vetorial + RAG + Human Gate + esquema de estados | Nada funciona sem base de conhecimento e portão de curadoria | Médio |
| **Onda 1** | Partner Discovery revisado (Credibility/Fact/Entity separados) | Caso de uso mais direto, entrada mais clara (um projeto) | Médio |
| **Onda 2** | Feedback Loop (A) + Client Fit (B) | Ligam o aprendizado — sem eles a Onda 1 nunca melhora | Alto retorno |
| **Onda 3** | Market Intelligence + Timing (C) + Conflict Guard (D) | Mais fontes externas e temporalidade — mais superfície de erro | Alto |
| **Onda 4** | Paper Critic (E) · Graph (F) · Narrative (G) | Camada de refino e venda — depende de tudo acima | Médio |

---

## A tese, em uma frase

> O diferencial competitivo da Cross não vai ser "tem agentes de IA" — vão ser **dois ativos que a concorrência não consegue copiar**: o *corpus de conhecimento Crossability versionado* e o *loop de aprendizado* que fica mais esperto a cada parceria fechada. Todo o resto é infraestrutura reutilizável em volta desses dois.

---

*Documento de arquitetura para validação. Ancorado no modelo de domínio real (módulos `inteligencia`, `metodologias`, `partes`, `projetos`, `parcerias`) e na Crossability de seis dimensões. A estrutura em camadas existe para permitir trocar peças sem reescrever o todo. Nenhuma decisão aqui é irreversível.*
