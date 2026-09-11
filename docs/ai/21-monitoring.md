# 21 — Monitoring Agent

**Sprint AI-10** · Documentação técnica curta.
Artefato principal: [output showcase](validation/monitoring-agent-output-showcase.md).

---

## Responsabilidade

Responde **"quais entidades precisam ser verificadas agora, e o que mudou desde
a última verificação?"**.

Não é Research (não rasteja) nem Big Moment (não classifica evento). É
**orquestração de mudança**: decide quando chamar os outros — e principalmente
quando não chamar.

---

## Ciclo finito

```ts
executarCiclo(client, { agora, workerId, maxAlvos, pesquisa })
```

Uma execução: seleciona vencidos → reserva → pesquisa → compara → classifica →
alerta → salva → encerra.

Não existe `while(true)`. A infraestrutura chama de novo depois.

---

## Alvo

`cross_ai.monitoring_alvo` — **Parte** é o alvo central. Registro é
**explícito**: a base não entra em monitoramento sozinha.

| Campo | Papel |
|---|---|
| `prioridade` | ordem de verificação — não é valor comercial |
| `cadencia_horas` | intervalo simples; cron por alvo seria excesso |
| `proxima_verificacao_em` | materializada, para a seleção ser index scan |
| `falhas_consecutivas` | base do backoff |
| `checkpoint` | hashes e refs; nunca conteúdo |
| `reservado_ate` / `reservado_por` | lease com expiry |

Índice: `(status, proxima_verificacao_em) WHERE status = 'ativo'`.

---

## Concorrência

```sql
FOR UPDATE SKIP LOCKED  +  lease com expiry
```

Dois workers nunca pegam o mesmo alvo. Um worker que morre não trava o alvo:
o lease expira em `LIMITES_MONITORING.leaseMinutos`.

---

## Delta

Fingerprint sobre o **conteúdo do fato**, não sobre `fact_id` — Research pode
gerar id novo para o mesmo texto.

```
sem_mudanca · evidencia_nova · evidencia_atualizada · evidencia_indisponivel
big_moment_novo · big_moment_atualizado · big_moment_cancelado
possivel_conflito_de_evento · evidencia_insuficiente · falha_de_pesquisa
```

### Fast path

Nenhuma evidência nova ⇒ **não chama Big Moment**. É a economia central: sem
mudança não há o que classificar.

---

## Alertas

`cross_ai.monitoring_alerta` — sinal interno para revisão humana. Não é
notificação externa, não é Recommendation, não cria oportunidade.

Deduplicação por índice único em `deduplication_key`: o mesmo evento não vira
alerta a cada ciclo.

Estados: `novo` · `visto` · `descartado` · `resolvido`. Nunca `aprovado`.

---

## Correlação × fingerprint

| | Autoridade | Composição | Uso |
|---|---|---|---|
| `event_fingerprint` (AI-09) | identidade estrita | entidade + tipo + assunto + **data** | qual evento é |
| `correlation_key` (AI-10) | secundária | entidade + tipo | evento *possivelmente* relacionado |

A correlação é **mais frouxa por desenho**. Sem isso, uma turnê remarcada
apareceria como dois eventos novos independentes.

Nunca funde automaticamente: produz `POSSIBLE_EVENT_CONFLICT` para revisão.

---

## Retry e backoff

```
proxima = cadencia × 2^falhas   (teto: 720h)
```

Sucesso zera `falhas_consecutivas`. Falha em um alvo **não aborta o ciclo**.

---

## Adaptador de pesquisa

```ts
interface AdaptadorPesquisa {
  modo: "controlado" | "live";
  pesquisar({ entidade, parteId }): Promise<{ fatos, webSearchCalls, firecrawlCalls, custoUsd }>;
}
```

A validação estrutural roda com `controlado` — zero rede, zero custo. Trocar
para Research real é troca de adaptador: seleção, delta, alertas e persistência
não mudam.

---

## Economia — os oito princípios

1. só alvos vencidos são selecionados
2. lote limitado por ciclo
3. fingerprint de conteúdo, não de id
4. fast path quando nada mudou
5. Big Moment só após delta
6. nenhum agente downstream automático
7. payload estruturado, nunca HTML
8. checkpoint persistente entre ciclos

---

## Observabilidade

`diagnosticarAlvo(parteId, agora)` responde por que um alvo não foi verificado:
`nao_vencido` · `pausado` · `arquivado` · `reservado_por_outro_worker` ·
`limite_do_ciclo` · `alvo_invalido`.

---

## Integração futura com scheduler

O motor é finito e idempotente por ciclo. Um cron/worker chamaria
`executarCiclo` periodicamente. Nenhuma infraestrutura de agendamento foi
configurada nesta Sprint.

---

## Limitações

1. `LIVE_MONITORING_VALIDATION = PENDING`.
2. Correlação frouxa: turnês distintas da mesma entidade colidem — resultado é
   *possível* conflito, para humano.
3. Sem scheduler e sem rota HTTP.
4. Transição ACTIVE → EXPIRED não gera alerta próprio.
5. `BUDGET_BLOCKED` não exercitado (adaptador controlado tem custo zero).
