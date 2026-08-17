# Research & Evidence Agent — Showcase de Validação

**Plataforma Cross** · Sprint AI-02
Data: 15/08/2026

> ## ⚠️ LEIA ANTES DE AVALIAR
>
> `AI_PAID_PROVIDERS_ENABLED=false` → **Firecrawl desligado** → **a extração
> real de fatos a partir de páginas NÃO foi executada**.
>
> As fontes e os fatos destes cenários são **fixtures controladas**, injetadas
> no agente. Isso valida o **mecanismo**: credibilidade, deduplicação,
> verificação, conflito, recência, proveniência, guardrails e fail-safe.
>
> **NÃO valida** a qualidade da pesquisa real na web. Essa avaliação exige o
> Firecrawl ligado e é uma decisão sua — está listada como próximo passo.
>
> `planning_mode: heuristica` · `extraction_mode: mock` em todos os cenários.

**Raw outputs:** [`raw/research-evidence/`](raw/research-evidence/) — 8 JSONs.

---

## Resumo dos 8 cenários

| Cenário | Status | Fontes | Fatos | Descartes | Lacunas |
|---|---|---:|---:|---:|---:|
| Caso forte | `sucesso` | 3 | 3 | 1 | 1 |
| Pouca evidência | `sucesso` | 1 | 1 | 0 | 3 |
| Entidade ambígua | `entidade_ambigua` | 0 | 0 | 0 | 1 |
| Conflito | `evidencia_insuficiente` | 2 | 2 | 0 | 2 |
| Fonte ruim | `evidencia_insuficiente` | 0 | 0 | 2 | 1 |
| Fail-safe | `evidencia_insuficiente` | 0 | 0 | 0 | 3 |
| Recência | `sucesso` | 2 | 1 | 1 | 1 |
| Guardrail | `bloqueado_por_guardrail` | 1 | 0 | 2 | 1 |

**Só 3 de 8 terminaram em `sucesso`.** Isso é o comportamento desejado: o agente
prefere declarar lacuna a entregar pacote com aparência de completo.

---

## Cenário 1 — Caso forte

**INPUT**
```
entidade:   Converse
objetivo:   movimentos_recentes
site:       https://www.converse.com
janela:     12 meses
categorias: produto, parceria, territorio
```

**PLANO DE PESQUISA** (determinístico por objetivo, sem custo de LLM)
```
Converse notícias
Converse anúncio recente
Converse novidades
Converse movimento estratégico
```

**FONTES ENCONTRADAS → UTILIZADAS → DESCARTADAS**
```
4 encontradas    3 utilizadas    1 descartada

✅ converse.com/newsroom/capsula-br    oficial     score 88   alta
✅ g1.globo.com/moda/capsula           imprensa    score 88   alta
✅ exame.com/negocios/converse-varejo  imprensa    score 88   alta
❌ qualquer.blogspot.com/tenis         blog        score 23   baixa
   └─ motivo: baixa_credibilidade (sem HTTPS, padrão de baixa qualidade)
```

**FATOS EXTRAÍDOS**

| Natureza | Verificação | Conf. | Domínios | Claim |
|---|---|---:|---:|---|
| **fato** | `corroborada` | **80** | 2 | A Converse anunciou uma coleção cápsula com um artista brasileiro. |
| **fato** | `fonte_unica` | 53 | 1 | A marca ampliou presença no varejo do Sudeste. |
| *inferência* | `fonte_unica` | **40** | 1 | O movimento indica uma aposta em colaborações culturais locais. |

**Três coisas para observar:**

1. **Fato corroborado (2 domínios) tem confiança 80; fonte única, 53.** A
   corroboração pesa, e o número reflete isso.
2. **A inferência está marcada como tal e travada em 40.** *"Indica uma aposta"*
   não é fato — e nunca se apresentará com a força de um.
3. **A fonte fraca foi descartada com motivo nomeado**, não silenciosamente.

**LACUNA DECLARADA:** `Nenhum fato confirmado na categoria "parceria".`
O agente pediu 3 categorias, obteve 2, e **disse o que faltou**.

---

## Cenário 2 — Pouca evidência

```
1 fonte · 1 fato (fonte_unica, confiança 53)

LACUNAS (3)
  · Nenhum fato confirmado na categoria "publico".
  · Nenhum fato confirmado na categoria "ativo".
  · Nenhum fato foi corroborado por duas fontes independentes.
```

**Leitura:** o agente não tentou compensar a escassez. Entregou o pouco que
tinha e listou explicitamente o que não conseguiu confirmar.

---

## Cenário 3 — Entidade ambígua

```
Entity Resolution → 3 Partes parecidas na base
                    Converse Brasil · Converse Calçados · Converse Store

           ↓

status:     entidade_ambigua
facts:      0        ← nenhum fato produzido
sources:    0
ambiguidade: { motivo: "Várias Partes parecidas — revisar manualmente
                        qual (se alguma) é a mesma.",
               candidatas: [3] }
```

**O ponto:** o agente **parou**. Pesquisar a entidade errada e consolidar o
resultado é pior do que não pesquisar — o erro se propagaria para Entity
Intelligence e daí para a recomendação.

---

## Cenário 4 — Conflito entre fontes ⭐

```
CLAIM A   "A marca confirmou o patrocínio do festival de música."
          └─ g1.globo.com/patrocinio

CLAIM B   "A marca não confirmou o patrocínio do festival de música."
          └─ exame.com/nega-festival

           ↓

AMBAS: verificacao = conflitante

  A: conf 53   conflito.claim_oposta = B   source_refs_oposta = [src de B]
  B: conf 38   conflito.claim_oposta = A   source_refs_oposta = [src de A]

status: evidencia_insuficiente
lacuna: "1 afirmação(ões) em conflito entre fontes independentes —
         nenhuma versão foi escolhida."
```

**Duas decisões importantes aqui:**

**Nenhuma versão foi escolhida.** As duas ficam no pacote, cada uma com sua
fonte. A decisão é humana.

**O status NÃO é `sucesso`.** Antes desta sprint, dois domínios distintos
elevariam ambas a "corroborada" — o erro mais perigoso possível numa camada de
evidência. Agora, contradição vence contagem, e um pacote cujos únicos fatos
são conflitantes se declara insuficiente.

> Esta foi a evolução mínima prevista no briefing §16: o status `conflitante`
> não existia no verificador.

---

## Cenário 5 — Fonte ruim

```
2 fontes encontradas    0 utilizadas    2 descartadas

❌ qualquer.blogspot.com/campanha    score 23    baixa_credibilidade
❌ sem-https.xyz/campanha            score 15    baixa_credibilidade
   └─ sinais: sem HTTPS, padrão de baixa qualidade

Extração: NÃO EXECUTADA (nenhuma fonte atingiu credibilidade mínima)
status:   evidencia_insuficiente
lacuna:   "Nenhuma fonte atingiu credibilidade alta; extração não foi executada."
```

**O agente sabe não usar informação.** E a porta de credibilidade também é porta
de custo: sem fonte confiável, a extração cara não roda.

---

## Cenário 6 — Fail-safe

```
0 fontes · 0 fatos · status = evidencia_insuficiente

LACUNAS (3)
  · Nenhuma fonte aceita foi coletada.
  · Nenhum fato confirmado na categoria "produto".
  · Nenhum fato confirmado na categoria "parceria".
```

**Nenhum fato foi fabricado.** Sem fonte, não há afirmação.

---

## Cenário 7 — Recência

```
objetivo: movimentos_recentes    janela: 6 meses

✅ "A marca anunciou uma ativação neste trimestre."
   publicado há 20 dias → UTILIZADO

❌ "A marca realizou uma campanha em 2024."
   publicado há 500 dias → DESCARTADO
   └─ motivo: desatualizado_para_objetivo
```

**A regra não é descartar tudo que é antigo.** Com `objetivo: contexto_geral`, o
mesmo fato de 2024 **não seria descartado** — seria reclassificado como
`contexto_empresa`. Informação histórica é irrelevante para *movimentos
recentes*, mas continua válida para *contexto da empresa*.

Isso está coberto por teste (cenário I).

---

## Cenário 8 — Guardrail

```
plano completo:     4 consultas
teto do orçamento:  2 buscas
executadas:         2

❌ 2 consultas não executadas
   └─ motivo: limite_guardrail

status: bloqueado_por_guardrail
telemetria.bloqueios_guardrail: ["web_search_limit"]
```

**Nenhum bypass.** O agente respeita os Cost Guardrails e reporta o que deixou
de fazer.

---

## Package final entregue ao próximo agente

```json
{
  "entidade": "Converse",
  "objetivo": "movimentos_recentes",
  "status": "sucesso",
  "plano": ["Converse notícias", "..."],
  "planning_mode": "heuristica",
  "extraction_mode": "mock",
  "facts":       [ { "fact_id", "claim", "categoria", "natureza",
                     "source_refs", "verificacao", "confianca",
                     "publicado_em", "coletado_em", "conflito" } ],
  "sources":     [ { "source_id", "url", "dominio", "tipo_fonte",
                     "credibilidade_score", "publicado_em",
                     "coletado_em", "query_origem" } ],
  "descartados": [ { "tipo", "referencia", "motivo", "detalhe" } ],
  "conflitos":   [ ... ],
  "lacunas":     [ { "descricao", "categoria" } ],
  "ambiguidade": null,
  "telemetria":  { "duracao_ms", "consultas", "buscas_web", "scrapes",
                   "fontes_coletadas", "fontes_descartadas",
                   "fatos_extraidos", "fatos_verificados",
                   "custo_estimado_usd", "bloqueios_guardrail" }
}
```

**O que NÃO existe neste pacote** — verificado por teste:

`cross_knowledge` · `knowledgeReferences` · `crossability` · `recomendacao` ·
`score_fit` · `score_card`

Todo `source_ref` aponta para uma fonte externa (`src_*`), nunca para um chunk
de metodologia. **Evidence e Cross Knowledge não se tocam.**

---

## Respostas ao critério de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | As fontes parecem boas? | **Não avaliável** — são fixtures. A *classificação* funciona: oficial > imprensa > blog |
| 2 | Trouxe informação relevante? | **Não avaliável** com fixtures |
| 3 | Trouxe notícia irrelevante demais? | **Não** — cenário 5: 2 encontradas, 0 usadas |
| 4 | Sabe descartar fonte ruim? | **Sim**, com motivo nomeado |
| 5 | Distingue fato de inferência? | **Sim** — inferência travada em confiança ≤40 |
| 6 | Detecta conflito? | **Sim** — cenário 4, sem escolher versão |
| 7 | Deixa claro quando não sabe? | **Sim** — 5 de 8 cenários com lacunas declaradas |
| 8 | Os fatos têm fontes? | **Sim** — fato sem fonte é descartado |
| 9 | Trata informação antiga como atual? | **Não** — cenário 7 |
| 10 | **Confiaria neste pacote?** | **Na estrutura, sim. No conteúdo, ainda não** — a extração real não foi exercitada |

---

## O que falta para validar de verdade

A pergunta 10 é a que importa, e a resposta honesta é: **o mecanismo está
pronto; a pesquisa real não foi testada.**

Para responder às perguntas 1 e 2 é preciso ligar o **Firecrawl** (só ele, sem
LLM). Custo pequeno e limitado — os guardrails já cortam em
`AI_MAX_SCRAPES_PER_RUN=15`, e o kill switch continua valendo para tudo o mais.

Só então será possível dizer se o agente **pesquisa bem** — e não apenas se ele
**organiza bem** o que recebe.
