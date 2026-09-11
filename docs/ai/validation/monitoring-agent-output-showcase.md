# Monitoring Agent — Output Showcase

**Sprint AI-10** · Modo estrutural / determinístico
Custo em IA paga: **US$ 0** · Web ao vivo: **DESLIGADA**

```
Paid LLM          = 0
Paid Embeddings   = 0
Live Search       = 0
Firecrawl         = 0
External Cost     = US$ 0

Research Adapter          = controlado
Live Monitoring Validation = PENDING
```

> Pergunta do agente: **"o que precisa ser verificado agora, e o que mudou?"**
> O produto é a **economia** — saber quando NÃO chamar os outros agentes.

---

## Cenário de economia · 100 alvos

Números reais da execução:

```
alvos registrados:      100
alvos vencidos:         100
alvos processados:       40   (teto do ciclo)
─────────────────────────────
research executados:     35
research evitados:       60   ← fora do lote / não vencidos
big moment executados:   15
big moment EVITADOS:     20   ← fast path "sem mudança"
─────────────────────────────
crossability runs:        0
matching runs:            0
recommendations:          0
─────────────────────────────
alertas criados:          5
falhas:                   5
custo:              US$ 0
duração:               49ms
```

**A leitura importante:** de 40 alvos processados, 20 não geraram nenhuma
classificação porque nada tinha mudado. Sem o fast path, seriam 35 execuções de
Big Moment em vez de 15.

E nenhum ciclo aciona Crossability, Matching ou Recommendation — esses ficam
para decisão humana ou para um Orchestrator futuro.

> **Nota honesta sobre o número:** o cenário previa 40 vencidos e 60 futuros,
> mas um ciclo preparatório reagendou os alvos, deixando os 100 vencidos. Os
> números acima são os que a execução realmente produziu, não os planejados.

---

## Sem mudança · fast path

```
ciclo 1   delta = big_moment_novo    big_moment executado = true    alertas = 1
ciclo 2   delta = sem_mudanca        big_moment executado = false   alertas = 0

big moment evitados no ciclo 2: 1
```

Mesma evidência ⇒ nenhuma classificação. É a diferença entre monitorar e
reprocessar.

O fingerprint é sobre o **conteúdo**, não sobre o `fact_id`: uma nova execução
de pesquisa pode gerar id diferente para o mesmo texto, e comparar ids acusaria
mudança onde não houve.

---

## Deduplicação · 3 ciclos, mesmo evento

```
ciclo 1:  1 alerta novo
ciclo 2:  0 alertas novos
ciclo 3:  0 alertas novos

total persistido: 1
```

Índice único em `deduplication_key`. O mesmo evento não vira alerta a cada
ciclo.

---

## Cancelamento

```
ciclo 1:  big_moment_novo
ciclo 2:  big_moment_cancelado   severidade = alta

"Evento correlato a um já conhecido aparece agora como cancelado."
```

Cancelamento é sempre relevante — não depende de score alto.

---

## A limitação conhecida da AI-09, tratada

A AI-09 inclui a data no `event_fingerprint`. Isso está **correto** para
identidade estrita: dois shows em datas diferentes são eventos diferentes.

Mas cria um risco para o Monitoring: uma turnê **remarcada** apareceria como
dois eventos novos independentes.

```
Fingerprint A (12/10)  ≠  Fingerprint B (15/10)      ← AI-09 intocada
              ↓
     correlação do Monitoring (entidade + tipo)
              ↓
        POSSIBLE_EVENT_CONFLICT

refs: 2 momentos vinculados
"Evento com identidade distinta mas assunto correlato a um já conhecido —
 possivelmente o mesmo evento com data alterada. Nenhuma fusão foi feita."
```

**Duas decisões deliberadas:**

1. O `event_fingerprint` da AI-09 **não foi alterado** — continua sendo a
   autoridade de identidade.
2. A correlação é **secundária e mais frouxa**. Ela precisa ser, ou não
   detectaria justamente a relação que a AI-09 separa.

**Preço conhecido:** duas turnês genuinamente distintas da mesma entidade caem
na mesma correlação. Por isso o resultado é *possível* conflito, para revisão
humana — nunca fusão automática.

---

## Falha isolada + backoff

```
Marca Ok 2     sucesso    próxima = 2026-06-22
Marca Ok 1     sucesso    próxima = 2026-06-22
Marca Falha    falha      próxima = 2026-06-29   ← backoff

falhas consecutivas: 1
ciclo NÃO abortou: 2 sucessos, 1 falha
```

Backoff determinístico: `cadência × 2^falhas`, com teto de 720h. Sucesso zera o
contador.

---

## Concorrência e recuperação de lease

```
worker-B com alvo reservado por worker-A:  0 processados
  diagnóstico: reservado_por_outro_worker

worker-C após o lease expirar:             1 processado
```

`FOR UPDATE SKIP LOCKED` + lease com expiry. Dois workers nunca pegam o mesmo
alvo — e um worker que morre não trava o alvo para sempre.

---

## 500 alvos · teto do ciclo

```
vencidos:            500
processados:          25
research evitados:   475
tempo:              24ms

restantes permanecem vencidos para o próximo ciclo
```

Não existe `while(true)`. Uma execução é finita: seleciona, processa o lote,
salva estado e encerra.

---

## Observabilidade

"Por que esta Parte não foi verificada?" tem resposta objetiva:

| Motivo | Quando |
|---|---|
| `nao_vencido` | `proxima_verificacao_em` no futuro |
| `pausado` / `arquivado` | status do alvo |
| `reservado_por_outro_worker` | lease ativo de outro worker |
| `limite_do_ciclo` | vencido, mas fora do lote |
| `alvo_invalido` | Parte não registrada para monitoramento |

---

## Checkpoint enxuto

```json
{
  "evidence_fingerprints": ["a3f2…"],
  "big_moment_fingerprints": ["5e6f…"],
  "big_moment_status": { "5e6f…": "announced" },
  "ultima_verificacao_em": "2026-06-15T12:00:00.000Z"
}
```

Só referências e hashes. Sem HTML, sem scrape, sem prompt — verificado por
teste (< 1000 caracteres, sem o texto dos fatos).

---

## Zero efeito operacional

```
crossability_runs           = 0
matching_runs               = 0
recommendations_criadas     = 0
entity_intelligence_writes  = 0
oportunidades_criadas       = 0
score_cards_alterados       = 0
cross_knowledge_writes      = 0
cross_memory_promocoes      = 0
```

Confirmado por contagem antes/depois no banco.

Os `follow_ups` são **sugestões** (`revisar_alerta`,
`considerar_refresh_de_entidade`, …) para um Orchestrator futuro. Nada é
executado.

---

## Perguntas de validação

| # | Pergunta | Resposta |
|--:|---|---|
| 1 | Reprocessa entidade sem mudança? | **Não** — 20 Big Moment evitados |
| 2 | Duplica alertas? | **Não** — 3 ciclos, 1 alerta |
| 3 | Reduz processamento? | **Sim** — 60 research + 20 Big Moment evitados |
| 4 | Existe polling infinito? | **Não** — ciclo finito |
| 5 | Dois workers colidem? | **Não** — SKIP LOCKED + lease |
| 6 | Worker morto trava alvo? | **Não** — lease expira |
| 7 | Falha aborta ciclo? | **Não** |
| 8 | Usa web ao vivo? | **Não** — adaptador controlado |
| 9 | Aciona agente downstream? | **Não** |
| 10 | Pronto para scheduler? | Sim — `executarCiclo(now, limit)` |

---

## Limitações

1. **Live monitoring PENDENTE** — validado com adaptador controlado. Trocar
   para Research real é troca de adaptador, mas não foi exercitado.
2. **Correlação frouxa por desenho** — entidade + tipo. Duas turnês distintas
   da mesma entidade caem na mesma correlação; o resultado é *possível*
   conflito, para revisão humana.
3. **Sem scheduler** — o motor é finito e pronto para ser chamado; nenhuma
   infraestrutura de cron/worker foi configurada.
4. **Sem rota HTTP.**
5. **Transição ACTIVE → EXPIRED não gera alerta próprio** — a expiração é
   derivada da janela do momento, não um evento monitorado.
6. **Guardrails globais não exercitados** — o adaptador controlado tem custo
   zero, então `BUDGET_BLOCKED` não foi acionado em execução real.
