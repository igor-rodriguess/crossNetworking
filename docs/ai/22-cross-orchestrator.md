# 22 — Cross Orchestrator

**Sprint E2E-01** · Documentação técnica curta.
Artefato principal: [output showcase](validation/cross-orchestrator-e2e-output-showcase.md).

---

## Responsabilidade

Coordena os agentes **já existentes** para executar as três jornadas canônicas.
Responde **"qual agente roda agora — e qual NÃO precisa rodar?"**.

Não substitui nenhum agente. Não é uma LLM. É máquina de estados, regras,
gestão de dependências e checkpoints em TypeScript.

> Pedir a um modelo que decida o próximo passo tornaria o sistema imprevisível
> e caro sem ganho: a resposta é derivável de regra (existe artefato? está
> fresco? a direção bate?).

---

## As três jornadas

| Tipo | Origem | Destino |
|---|---|---|
| `cliente_para_parceiro` | Cliente Cross | marcas parceiras |
| `parceiro_para_cliente` | marca parceira | Clientes Cross |
| `prospeccao_do_zero` | entidade externa (sem Parte) | marcas parceiras |

---

## Contrato

```ts
planejar(entrada): ExecutionPlan              // puro, sem I/O
executarJourney(client, entrada)              // até o primeiro Human Gate
retomarJourney(client, journeyId, opcoes)     // após decisão humana
carregarSteps(client, journeyId)
rastrearJourney(client, journeyId)            // cadeia até a Evidence
```

`planejar` é função pura: dá para inspecionar o plano sem tocar no banco.

---

## Persistência

```
journey_execution           ← a jornada (pai)
  └── journey_step          ← cada etapa, com estado próprio
        └── execucao_agente ← execução real do agente (já existente)
```

Migration **065**. `execucao_agente` continua sendo o filho — não foi
substituída nem duplicada. A auditoria mostrou que ela registra execução de
*agente*, e `tarefa_pipeline` tem checkpoint, mas nenhuma das duas representa
uma **jornada de negócio** atravessando vários agentes com pausas humanas.

`motivo_parada` e `motivo` são `TEXT`: são explicação para humano, e uma razão
truncada é pior do que nenhuma, porque parece completa.

---

## REUSE BEFORE RERUN

Antes de chamar qualquer agente, o Orchestrator verifica se já existe artefato
válido.

```ts
POLITICA_REUSO = {
  maxIdadePerfilDias: 30,
  maxIdadeCrossabilityDias: 30,
  reutilizarMatching: false,
}
```

Centralizado de propósito: espalhar esses números pelo orquestrador tornaria a
política impossível de auditar.

**Matching nunca é reutilizado.** A direção faz parte da identidade do
resultado — uma shortlist de cliente→parceiro não serve para a direção inversa.

### Estados de etapa

| Estado | Significado |
|---|---|
| `concluida` | executou |
| `reutilizada` | havia artefato válido; reaproveitado |
| `pulada` | não precisava rodar nesta jornada |
| `bloqueada` | não pôde rodar por falta de sustentação |
| `aguardando_humano` | pausa legítima — **não é erro** |
| `falha` | erro real |

`reutilizada` ≠ `pulada`. Um booleano não distinguiria "reaproveitei" de "nem
precisava", e essa diferença é exatamente a economia que o Orchestrator
precisa provar.

Medido: **5 etapas → 2** quando há artefato válido.

---

## Human Gates

A jornada **para**. Não existe caminho de auto-aprovação.

```
recommendation → ⏸ human_review → ⏸ promotion → ⏸ paper → ⏸ score_card
```

A verificação de decisão é **allow-list**:

```ts
const APROVACOES = new Set([
  "aprovada_para_revisao_de_oportunidade",
  "aprovada_com_edicoes",
]);
```

Deny-list (testar só por `rejeitada`) deixaria `requer_mais_informacao` e um
`pendente` remanescente caírem no caminho de aprovação.

**Aprovar não promove.** São ações humanas separadas; juntá-las faria a
aprovação carregar um efeito operacional que ninguém pediu.

---

## Fail-safe factual

Perfil sem nenhum fato ⇒ `evidencia_insuficiente`, com as etapas seguintes
marcadas `bloqueada`.

`evidencia_insuficiente` ≠ `falha`. Confundir os dois faria o sistema tentar
"recuperar" de algo que funcionou como deveria.

---

## Perfil do candidato

`evidencias_suporte` é montada a partir do perfil do **candidato**. Sem ele, a
proposta é estruturalmente incapaz de ter sustentação — sai sempre como
`requer_enriquecimento` com confiança mínima.

O Orchestrator monta esse perfil a partir dos **sinais que o Matching já leu**
da base interna. Não é pesquisa nova nem chamada de agente.

- Perfil fornecido pelo chamador **tem precedência** (é mais rico).
- Só entram sinais com `candidato_refs`: afirmação sem lastro sobre o candidato
  seria pior do que perfil ausente.
- O perfil declara a origem: `internal_matching:<direcao>`.

---

## Estados da jornada

```
criada · inteligencia_em_progresso · recomendacao_pronta
aguardando_revisao_humana · revisao_aprovada · revisao_rejeitada
aguardando_promocao · oportunidade_criada
aguardando_paper · aguardando_validacao_paper · score_card_disponivel
concluida

evidencia_insuficiente · requer_enriquecimento
requer_resolucao_de_entidade · falha
```

Os `aguardando_*` são pausa legítima, não erro.

---

## Sinais opcionais

Big Moment, Meeting Intelligence e Monitoring entram como **contexto por
referência** — nunca são reexecutados pela jornada:

```ts
contexto_opcional: {
  big_moment_refs, meeting_intelligence_refs, monitoring_alert_ref
}
```

Um alerta de Monitoring pode **iniciar** a jornada (`trigger_source`), mas não
dispensa nenhum Human Gate.

---

## Limitações

1. `REAL_AI_VALIDATION = PENDING` — kill switch ativo; as seis dimensões do
   Crossability voltam `operation_not_allowed`. Estrutura validada, conteúdo
   interpretativo não.
2. `LIVE_WEB_VALIDATION = PENDING`.
3. Perfil do candidato vem de sinais internos, mais pobre que um pesquisado.
4. Sem rota HTTP e sem scheduler.
5. `paper` e `score_card` são planejados, não executados — seguem o fluxo
   humano da AI-07B.
6. Concorrência de resume (`versao`, optimistic locking) não exercitada em
   corrida real.
