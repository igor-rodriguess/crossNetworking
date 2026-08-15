# Decision Log — Cross Intelligence

**Plataforma Cross** · Sprint 0B
Data: 07/08/2026 · Status geral: **PROPOSTO — aguardando aprovação humana**

> Registro formal das decisões arquiteturais. Nenhuma foi implementada.

---

## ADR-001 — Oportunidade é diferente de Projeto

**Status:** Proposto

**Contexto.** O modelo atual obriga `projeto → frente → candidatura`, com
`projeto.cliente_cross_id NOT NULL`. Toda hipótese de negócio exige um projeto e
um cliente antes de existir. Os 3 projetos reais (`ARAMIS`, `URBAN`,
`ARAMIS NEXT`) são contêineres por marca, não iniciativas com prazo (SAD §3.1).

**Decisão.** Oportunidade e Projeto são entidades distintas:

- **Oportunidade** — hipótese de negócio em descoberta, análise, validação,
  abordagem, aquecimento ou negociação. Implementada por
  `cross_projects.candidatura_parceiro`.
- **Projeto** — iniciativa consolidada, resultado de uma oportunidade aprovada.

**Consequências.** `candidatura_parceiro` evolui (origem, cliente direto,
projeto opcional) em vez de nascer tabela nova. `cross_ai.oportunidade_ia`
permanece como camada de rascunho pré-Human Gate — a separação é uma proteção,
não redundância.

**Alternativa rejeitada.** Criar tabela `oportunidade`: exigiria migrar 65
candidaturas reais e duplicar regras protegidas por trigger (RN022, RN023).

---

## ADR-002 — Funil pertence à Oportunidade

**Status:** Proposto

**Contexto.** O funil é hoje `status_candidatura` em `candidatura_parceiro`, com
16 estados e histórico em `historico_candidatura`. A página `/funil` está órfã
desde a Sprint 0A.

**Decisão.** O funil é **atributo da Oportunidade**, não entidade nem página
própria. Os 16 estados atuais são mantidos **sem alteração**. Na interface, o
funil aparece em Dashboard (agregado) e Oportunidades (operacional).

**Consequências.** Nenhuma mudança de banco. `/funil` sai do roteamento
principal após confirmação de desuso; sua lógica de agregação deve ser extraída
antes.

**Alternativa rejeitada.** Adicionar estados de reunião ao funil: reunião é
evento, não estágio — uma oportunidade pode ter várias e permanecer no mesmo
estágio.

---

## ADR-003 — IA não movimenta o funil automaticamente

**Status:** Proposto

**Contexto.** O produto é inteligência com validação humana. Movimentar funil é
decisão comercial com consequência real diante do cliente.

**Decisão.**

- A IA **pode** criar oportunidade em `identificada` e movê-la a `em_analise`
- A IA **pode sugerir** qualquer transição, gravando a sugestão em
  `historico_candidatura.contexto` (JSONB já existente) **sem alterar o status**
- Toda transição a partir de `recomendada` exige decisão humana com
  `responsavel_id` registrado

**Consequências.** Nenhuma mudança de banco — `historico_candidatura` já tem
`responsavel_id`, `justificativa` e `contexto`. A regra vive na camada de
serviço.

---

## ADR-004 — Reunião pode existir antes de parceria e projeto

**Status:** Proposto · **exige migration**

**Contexto.** `cross_execution.reuniao.parceria_id` é `NOT NULL` com FK para
`cross_partnerships.parceria`. Uma reunião com uma marca que ainda não é
parceira não tem onde ser registrada. Bloqueia integralmente a jornada B.

**Decisão.** Reunião passa a ser evento de inteligência vinculado a uma
**Parte**, com oportunidade, projeto e parceria opcionais.

**Consequências.** Migration 055 proposta em
`docs/product/03-meeting-domain-evolution.md`: 5 colunas aditivas,
`DROP NOT NULL` em `parceria_id`, `CHECK` de vínculo mínimo, 3 índices.
Retrocompatível — as 6 rotas atuais continuam funcionando.

**Nota.** `reuniao_participante.parte_id` **já existe** — o vínculo com Parte já
está modelado, só não é principal. Isso reduz o tamanho da migration.

---

## ADR-005 — Crossability é motor metodológico

**Status:** Proposto

**Contexto.** Hoje o Crossability é exposto como ferramenta operacional
(`/criterios`, análise manual). Na visão nova, é como a IA raciocina.

**Decisão.** Crossability é o **motor metodológico** da inteligência. As seis
dimensões permanecem inalteradas. Não é item de menu — aparece dentro das
análises. A lógica atual **não foi alterada nesta sprint**.

**Consequências.** No alvo, consome Verified Evidence + Entity Intelligence +
Cross Knowledge, com rastreabilidade por dimensão. Nenhuma dessas mudanças foi
implementada.

---

## ADR-006 — Score Card permanece instrumento de decisão

**Status:** Proposto (confirmação do comportamento atual)

**Contexto.** Risco recorrente em sistemas com LLM: o modelo emitir o número
final.

**Decisão.** O Score Card continua sendo cálculo **determinístico** com pesos do
cliente. A LLM **propõe avaliações**; o Score Engine calcula. RN022 e RN023
permanecem protegidas por trigger.

**Verificação.** Confirmado em `scoreFitDaAnalise()`
([agentes.service.ts:1295](backend/src/modules/agentes/agentes.service.ts#L1295)):
70% dimensões + 30% confiança, em TypeScript. **A LLM nunca emite o score.**

**Consequências.** Nenhuma. O novo domínio não afeta o fluxo — o Score Card
vincula-se a `candidatura_parceiro`, que segue sendo a Oportunidade.

---

## ADR-007 — RAG é infraestrutura compartilhada, não agente

**Status:** Proposto

**Contexto.** A auditoria de IA encontrou o RAG desligado no `partner_discovery`
por decisão explícita de código, e concluiu que o sistema **não ensina o jeito
Cross de pensar** (classificação INSUFFICIENT).

**Decisão.** RAG é **capacidade compartilhada**, disponível a qualquer agente —
não um agente nem uma etapa do pipeline.

**Consequências.** `rag_retrieval` deixa de ser "etapa" e passa a ser consulta
feita por quem precisar. A implementação atual já respeita isso
(`rag.service.ts` é serviço). **Nada alterado nesta sprint** — o RAG é a próxima
etapa.

---

## ADR-008 — As três jornadas reutilizam o mesmo motor

**Status:** Proposto

**Contexto.** Risco de implementar Cliente→Parceiro, Parceiro→Cliente e
Prospecção como três agentes independentes, triplicando código.

**Decisão.** As três são **jornadas de produto**, não agentes. Todas percorrem o
mesmo pipeline canônico:

```
JORNADA → CROSS ORCHESTRATOR → AGENTES → SERVIÇOS → HUMAN GATE
```

**Verificação.** Seis das nove etapas são idênticas entre jornadas. As
diferenças estão em Planning, Extraction e na **direção** do cruzamento.

**Consequências.** O Recommendation precisa ranquear **clientes** (jornada B), e
não só parceiros — mesma fórmula, papéis invertidos. Não é agente novo.

---

## ADR-009 — Evidence e Cross Knowledge são contextos distintos

**Status:** Proposto

**Contexto.** A dúvida central da auditoria de IA: o RAG pode ser usado como
evidência?

**Decisão.** **Não.**

- **Evidence** responde *"o que sabemos sobre o mundo?"* — factual, externa,
  verificável, com URL e data
- **Cross Knowledge** responde *"como a Cross interpreta isso?"* — metodológico,
  validado, versionado

O Crossability pode usar os dois, **preservando a origem de cada um**. O RAG
**nunca** serve como prova de que um fato externo aconteceu.

**Consequências.** A decisão atual de o `partner_discovery` não usar o RAG como
prova estava **certa**; o erro foi concluir que ele não deveria participar de
nada. No alvo, o RAG entra como **critério de julgamento** — nunca como
fundamento da existência de uma candidata. Implementação na etapa de RAG.

---

## ADR-010 — Informação operacional não vira Cross Knowledge automaticamente

**Status:** Proposto

**Contexto.** Cross Memory acumula reuniões, execuções e decisões — muito disso
não validado. Ingerir tudo no RAG faria a IA aprender padrões que a Cross nunca
endossou.

**Decisão.** Fluxo obrigatório:

```
MEMORY → extração → proposta → HUMAN GATE → KNOWLEDGE VALIDADO
```

Uma reunião registrada é Memory. Um padrão extraído de dez reuniões só vira
Knowledge após aprovação humana explícita.

**Consequências.** `documento_rag` precisará de `validado_por_id`, `validado_em`
e `versao_metodologia` — colunas aditivas, na etapa de RAG. Cross Memory **não
precisa de tabela nova**: é conceito guarda-chuva sobre estruturas existentes.

**Risco mitigado.** Credibilidade diante do cliente — não risco técnico.

---

## ADR-011 — Agentes são implementados e validados individualmente

**Status:** Proposto

**Contexto.** A tentação de implementar vários agentes em paralelo produz um
sistema em que nenhuma parte foi validada isoladamente.

**Decisão.** Um agente por vez. Nenhum próximo agente começa antes da validação
humana do anterior. Cada um entrega um **showcase do seu trabalho real** —
input, output, fontes, evidências, **informações descartadas e por quê**,
confiança, verificação, referências ao Knowledge, recomendação, score, Human
Gate, ferramentas, duração, custo, erros e limitações. Com cenários: forte,
baixa evidência, ambíguo e fail-safe.

**Consequências.** Ritmo mais lento e verificável. O showcase não é manual
técnico: é demonstração do trabalho. Nenhum showcase nesta sprint — nenhum
agente está sendo implementado.

---

## Resumo

| ADR | Decisão | Exige migration? |
|---|---|---|
| 001 | Oportunidade ≠ Projeto | Sim (futura, aditiva) |
| 002 | Funil pertence à Oportunidade | **Não** |
| 003 | IA não movimenta funil | **Não** |
| 004 | Reunião antes de parceria | **Sim (055)** |
| 005 | Crossability é motor | **Não** |
| 006 | Score Card determinístico | **Não** |
| 007 | RAG é infraestrutura | **Não** |
| 008 | Jornadas compartilham motor | **Não** |
| 009 | Evidence ≠ Knowledge | Sim (futura, etapa RAG) |
| 010 | Memory não vira Knowledge | Sim (futura, etapa RAG) |
| 011 | Um agente por vez | **Não** |

**7 de 11 não exigem nenhuma migration.**
