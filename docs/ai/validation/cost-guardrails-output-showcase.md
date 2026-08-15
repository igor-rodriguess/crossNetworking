# Cost Guardrails — Showcase de Comportamento

**Plataforma Cross** · Sprint 0D
Data: 07/08/2026

> Comportamento **real observado**, não explicação de código. Cada cenário foi
> executado; a saída bruta está em
> [`raw/cost-guardrails/scenarios.txt`](raw/cost-guardrails/scenarios.txt).
> **Nenhuma chamada paga aconteceu** — o guardrail é contabilidade em memória.
>
> Documentação técnica curta: [`../12-cost-guardrails.md`](../12-cost-guardrails.md).

**Limites usados nos cenários** (pequenos, para caber na página):
`custo=1.00 USD` · `llm=5` · `buscas=2` · `scrapes=2` · `candidatos=3` ·
`retries=2` · `modo estrito=true`

---

## CENÁRIO 1 — Execução normal

```
INPUT      : 3 operações de LLM (gpt-4o-mini), teto 1.00 USD

  op 1: DECISÃO=PERMITIDO  atual=0.000000  projetado=0.060000  teto=1.00
  op 2: DECISÃO=PERMITIDO  atual=0.060000  projetado=0.060000  teto=1.00
  op 3: DECISÃO=PERMITIDO  atual=0.120000  projetado=0.060000  teto=1.00

OUTPUT     : status=success
  chamadas realizadas : 3
  chamadas evitadas   : 0
  custo realizado     : 0.180000 USD
  custo evitado       : 0.000000 USD
  duração             : 1ms
```

**Leitura:** o custo progride a cada operação (`atual` sobe 0.06 por vez) e cada
autorização compara `atual + projetado` contra o teto. Dentro do orçamento, o
guardrail é transparente.

---

## CENÁRIO 2 — Estouro de orçamento

```
INPUT      : operações de 0.75 USD cada, teto 1.00 USD

  op 1: atual=0.000000  projetado=0.750000  soma=0.750000  teto=1.00
         DECISÃO=PERMITIDO
  op 2: atual=0.750000  projetado=0.750000  soma=1.500000  teto=1.00
         DECISÃO=BLOQUEADO  motivo=execution_cost_limit
  op 3: atual=0.750000  projetado=0.750000  soma=1.500000  teto=1.00
         DECISÃO=BLOQUEADO  motivo=execution_cost_limit

OUTPUT     : status=budget_blocked
  chamadas realizadas : 1
  chamadas evitadas   : 2
  custo realizado     : 0.750000 USD
  custo evitado       : 1.500000 USD
  motivo principal    : execution_cost_limit
  detalhe             : Custo atual 0.750000 + estimado 0.750000 excede o teto
                        de 1.000000 USD por execução.
```

**O ponto central:** a operação 2 foi bloqueada **antes de acontecer**. O custo
parou em 0.750000 — não avançou para 1.50. O bloqueio é preditivo (`atual +
projetado > teto`), não reativo.

**Status é `budget_blocked`, não `failed`.** Não foi erro técnico: faltou verba.
O trabalho da operação 1 foi preservado.

---

## CENÁRIO 3 — Modelo com custo desconhecido

```
INPUT      : modelo="gpt-5-turbo-imaginario" (fora da tabela de preços)
             modo estrito = true

  estimated_cost = null   ← NÃO é zero
  DECISÃO        = BLOQUEADO
  motivo         = cost_unknown

OUTPUT     : status=cost_unknown
  chamadas realizadas : 0
  chamadas evitadas   : 1
  custo realizado     : 0.000000 USD
  custo evitado       : desconhecido (por isso foi bloqueado)
  detalhe             : Custo não estimável para o modelo
                        "gpt-5-turbo-imaginario" e o modo estrito está ativo.

  [contraste] modo estrito=false → DECISÃO=PERMITIDO (uso só em desenvolvimento)
```

**Por que isso importa:** `null` significa *"não sei quanto custa"*, e tratar
isso como gratuito seria assinar cheque em branco. Um modelo novo lançado pelo
provedor, ou um typo no nome, cairia aqui — e o fail-safe é recusar.

O modo estrito é **`true` por padrão**. Desligá-lo é decisão explícita de
desenvolvimento.

---

## CENÁRIO 4 — Excesso de ferramentas

```
INPUT      : 4 buscas web pedidas, teto 2 | 4 scrapes pedidos, teto 2

  busca 1: usadas=0  teto=2  DECISÃO=PERMITIDO
  busca 2: usadas=1  teto=2  DECISÃO=PERMITIDO
  busca 3: usadas=2  teto=2  DECISÃO=BLOQUEADO  motivo=web_search_limit
  busca 4: usadas=2  teto=2  DECISÃO=BLOQUEADO  motivo=web_search_limit

  scrape 1: usados=0  teto=2  DECISÃO=PERMITIDO
  scrape 2: usados=1  teto=2  DECISÃO=PERMITIDO
  scrape 3: usados=2  teto=2  DECISÃO=BLOQUEADO  motivo=scrape_limit
  scrape 4: usados=2  teto=2  DECISÃO=BLOQUEADO  motivo=scrape_limit

OUTPUT     : status=budget_blocked (ferramentas)
  chamadas realizadas : 2 buscas + 2 scrapes
  chamadas evitadas   : 4
  bloqueios           : web_search_limit ×2, scrape_limit ×2
```

**Leitura:** ferramentas externas têm contador próprio e motivo próprio. Custo
não é só token — Firecrawl cobra por página e busca consome cota.

---

## CENÁRIO 5 — Candidate explosion

```
INPUT      : 500 candidatos após pré-filtro
             teto de reasoning = 3

  DECISÃO  : TOP 3 seguem para LLM  |  497 cortados
             marca-1, marca-2, marca-3

OUTPUT     : status=success (com corte)
  chamadas realizadas : 3 (1 LLM por candidato)
  chamadas evitadas   : 497
  custo realizado     : ~0.180000 USD
  custo evitado       : ~29.820000 USD
```

**O maior risco financeiro do produto, contido.** O reasoning gasta **uma chamada
de LLM por candidato** — uma base de 500 marcas sem corte seriam 500 chamadas.

A ordem é preservada: o **pré-filtro decide QUAIS**, o guardrail decide
**QUANTOS**. A proteção não depende de o pré-filtro estar bom.

Neste exemplo: **~30 USD evitados numa única execução.**

---

## CENÁRIO 6 — Kill switch

```
INPUT      : AI_PAID_PROVIDERS_ENABLED=false
             orçamento disponível = 9999 USD (irrelevante)
             chave de API presente no ambiente = sim (hipótese)

  LLM pago      : DECISÃO=BLOQUEADO  motivo=paid_providers_disabled
  Firecrawl     : DECISÃO=BLOQUEADO  motivo=paid_providers_disabled
  Embeddings    : DECISÃO=BLOQUEADO  motivo=paid_providers_disabled
  LLM local     : DECISÃO=PERMITIDO  ← provedor local segue disponível

OUTPUT     : status=budget_blocked (paid_providers_disabled)
  chamadas pagas realizadas : 0
  chamadas pagas evitadas   : 3
  custo realizado           : 0.000000 USD
```

**Duas coisas provadas:**

1. **Orçamento sobrando não libera nada.** Com 9999 USD disponíveis e chave
   presente, as três chamadas pagas foram recusadas. Ter chave deixa de ser, por
   si só, autorização para gastar.
2. **Provedor local segue funcionando.** O kill switch corta o que fatura, não o
   desenvolvimento.

### Defesa em profundidade

O switch atua em **quatro camadas independentes** — se uma for contornada, as
outras seguram:

| Camada | Onde | Efeito |
|---|---|---|
| Configuração | `env.ts` | `llmApiKey` vira `undefined`; `aiMock`/`extracaoMock`/`embeddingMock` ficam `true` |
| Cliente LLM | `shared/llm.ts` | Checagem junto do `fetch` → devolve stub |
| Embeddings | `shared/embeddings.ts` | Checagem junto do `fetch` → devolve stub |
| Firecrawl | `shared/firecrawl.ts`, `web-search.ts` | `extracaoEmModoMock()` e busca de fallback |
| Guardrail | `shared/budget.ts` | Nega autorização com `paid_providers_disabled` |

---

## CENÁRIO 7 — Retry policy

```
  timeout de rede    classe=temporario   repete=SIM
  HTTP 503           classe=temporario   repete=SIM
  validação          classe=validacao    repete=NÃO
  Human Gate         classe=human_gate   repete=NÃO
  orçamento          classe=orcamento    repete=NÃO
```

**A regra que mais importa:** `budget_blocked` **nunca** repete. Repetir gastaria
de novo exatamente o que se quis evitar — o retry viraria o próprio vazamento.

Validação e Human Gate também não repetem: o desfecho não mudaria. E o que não é
reconhecido como temporário é tratado como **permanente** — conservador de
propósito.

Backoff exponencial com teto: `500ms → 1s → 2s → … → 8s`.

---

## CENÁRIO 8 — API key presente + kill switch desligado

> **O cenário mais perigoso:** uma chave real colada no `.env` por engano.

```
INPUT      : OPENAI_API_KEY presente no ambiente = "sk-proj-chav..."
             AI_PAID_PROVIDERS_ENABLED = false
             orçamento = 9999 USD | teto de chamadas = 999

  DECISÃO  = BLOQUEADO
  motivo   = paid_providers_disabled
  detalhe  = Providers pagos desabilitados (AI_PAID_PROVIDERS_ENABLED=false).
             A chamada não foi realizada, mesmo havendo chave no ambiente.

OUTPUT     : status=budget_blocked
  chamadas pagas realizadas : 0
  custo realizado           : 0.000000 USD
  CONCLUSÃO: ter chave NÃO é autorização para gastar.
```

**Nem orçamento generoso (9999 USD), nem teto alto de chamadas (999), nem chave
válida mudam o desfecho.** O guardrail não consulta a chave — consulta o switch.

---

## CENÁRIO 9 — Telemetria de um bloqueio

Registro real gravado quando uma etapa é bloqueada:

```json
{
  "runId": "run-7f3a",
  "execucaoPaiId": "exec-pai-91c2",
  "jornada": "partner_discovery",
  "provedor": "openai",
  "tentativa": 1,
  "motivo": "execution_cost_limit",
  "detalhe": "Custo atual 0.000000 + estimado 0.750000 excede o teto de 0.010000 USD por execução.",
  "agente": "crossability_reasoning",
  "etapa": "reasoning",
  "modelo": "gpt-4o-mini",
  "tipoOperacao": "llm",
  "custoAtual": 0,
  "custoProjetado": 0.75,
  "limite": 0.01,
  "chamadasLlm": 0,
  "buscasWeb": 2,
  "scrapes": 1,
  "candidatos": 67,
  "decisao": "bloqueado",
  "momento": "2026-08-07T22:51:10.277Z"
}
```

**Responde "por que esta execução foi interrompida?"** sem consultar código: o
motivo, os números que o produziram, os contadores no instante da decisão e
onde no pipeline aconteceu.

---

## Resumo dos cenários

| # | Cenário | Chamadas evitadas | Custo evitado | Status |
|---|---|---:|---:|---|
| 1 | Execução normal | 0 | 0.00 USD | `success` |
| 2 | Estouro de orçamento | 2 | 1.50 USD | `budget_blocked` |
| 3 | Modelo desconhecido | 1 | desconhecido | `cost_unknown` |
| 4 | Excesso de ferramentas | 4 | — | `budget_blocked` |
| 5 | Candidate explosion | 497 | ~29.82 USD | `success` (com corte) |
| 6 | Kill switch | 3 | tudo | `budget_blocked` |
| 8 | Chave presente + switch off | 1 | tudo | `budget_blocked` |

---

## Configuração

Todos os limites são configuráveis por env, validados por Zod, sem número mágico
espalhado no código:

| Variável | Default | Protege contra |
|---|---|---|
| `AI_PAID_PROVIDERS_ENABLED` | `false` | Gasto acidental — **kill switch** |
| `AI_STRICT_COST_MODE` | `true` | Modelo sem preço tratado como grátis |
| `AI_MAX_COST_PER_RUN_USD` | `0.5` | Execução cara demais |
| `AI_MAX_LLM_CALLS_PER_RUN` | `20` | Laço disparando inferência |
| `AI_MAX_WEB_SEARCHES_PER_RUN` | `12` | Cota de busca |
| `AI_MAX_SCRAPES_PER_RUN` | `15` | Firecrawl por página |
| `AI_MAX_REASONING_CANDIDATES` | `8` | Candidate explosion |
| `AI_MAX_RETRIES_PER_STEP` | `2` | Repetição custosa |

> Defaults **conservadores para desenvolvimento** — não são os valores finais de
> produção. `AI_PAID_PROVIDERS_ENABLED=false` significa que, hoje, nenhuma
> chamada paga é possível sem ação deliberada.

---

## Telemetria de um bloqueio

Cada bloqueio registra, no `execucao_agente` pai (campo `saida.bloqueios`):

```json
{
  "motivo": "execution_cost_limit",
  "detalhe": "Custo atual 0.750000 + estimado 0.750000 excede o teto de 1.000000 USD por execução.",
  "agente": "crossability_reasoning",
  "etapa": "crossability_reasoning",
  "modelo": "gpt-4o-mini",
  "custoAtual": 0.75,
  "custoProjetado": 0.75,
  "limite": 1,
  "momento": "2026-08-07T21:44:00.000Z"
}
```

Mais o resumo consolidado em `saida.orcamento`: custo realizado, chamadas de
LLM, uso por ferramenta, número de bloqueios, motivo principal e os limites
vigentes na execução.
