# Recommendation Agent — Output Showcase

**Sprint AI-06** · Modo estrutural / determinístico
Custo em IA paga: **US$ 0** · LLM calls: **0** · Embedding calls: **0**

> O produto deste agente é uma **hipótese de conexão para avaliação humana** —
> não uma recomendação comercial, não uma decisão.

---

## Limitações declaradas antes dos resultados

```
REAL EMBEDDING VALIDATION      = PENDING
REAL CROSSABILITY AI           = PENDING
REAL RECOMMENDATION AI         = PENDING
```

Toda proposta carrega `nivel_validacao: "estrutural"` e uma lista de
`limitacoes`. Nenhuma pode reivindicar produção homologada.

---

## A cadeia consumida

```
Internal Matching (AI-05)   →  shortlist + sinais com proveniência
Entity Intelligence (AI-03) →  fatos com evidence_refs
Crossability (AI-04)        →  dimensões, contra-evidência, knowledge_refs
                ↓
        Recommendation Agent
                ↓
        Proposta  →  [FUTURO] Human Gate
```

O agente **não** reexecuta nada disso. Consome snapshots.

---

## CASO 1 · Candidato forte — Cliente → Parceiro

**Origem:** Cliente Alfa · **Candidato:** Marca Aderente (perfil completo)
**Objetivo:** ativação cultural conjunta

```
status:      pronta_para_revisao
sustentação: sustentacao_forte
confiança:   75
próximo:     preparar_para_human_gate
```

### Hipótese produzida

> Existe uma **hipótese** de conexão entre Cliente Alfa e Marca Aderente no
> contexto de "ativação cultural conjunta", sustentada por convergência em
> público, território de atuação, segmento. A hipótese **requer validação
> humana** e não constitui avaliação de encaixe comercial.

Note a linguagem: *hipótese*, *requer validação*, *não constitui avaliação*.
Nada de "parceria ideal" ou "excelente oportunidade".

### Racional — cada linha com proveniência

| Afirmação | Proveniência |
|---|---|
| Públicos: 2 em comum (Cultura de rua, Jovens urbanos) | `cross_intelligence.parte_publico(parte_id=9590a792…)` |
| Territórios: 2 em comum (Moda, Música) | `cross_intelligence.parte_territorio(parte_id=9590a792…)` |
| Segmento: ambos em "Vestuário" | `cross_core.organizacao(…).segmento_principal` |
| Crossability sustenta 2 dimensões: publicos, territorios | `crossability.dimensions[status=suportado]` |

### Contra-evidência preservada — 2 pontos

```
⚠ [publicos]    Nenhum dado demográfico verificável; a sobreposição
                não é mensurável.
⚠ [territorios] A metodologia separa escopo de campanha de território
                de atuação.
```

**Este é o achado mais relevante do caso.** O segundo ponto vem da metodologia
Cross e **enfraquece** a proposta: um fato que parecia provar território global
foi rebaixado porque a metodologia diz que campanha ≠ território.

A inteligência argumentou contra a própria hipótese.

### Confiança — determinística e explicada

| Fator | Peso | Valor | Contribuição |
|---|---:|---:|---:|
| cobertura_sinais | 0.30 | 0.75 | 0.225 |
| qualidade_evidencia | 0.25 | 0.80 | 0.200 |
| completude_perfil | 0.20 | 1.00 | 0.200 |
| crossability | 0.15 | 0.67 | 0.100 |
| ausencia_conflito | 0.10 | 1.00 | 0.100 |
| **Total** | | | **75** |

Confiança mede **sustentação**, não chance de fechar parceria.

---

## CASO 2 · Candidato sem perfil — o agente sabe recusar

**Candidato:** Marca Sem Perfil (`status_perfil = ausente`)

```
status:      requer_enriquecimento
sustentação: sustentacao_insuficiente
confiança:   10
hipótese:    null
```

Racional produzido:

> Nenhuma hipótese foi formulada: o candidato não possui perfil estruturado.

**Nenhum argumento foi fabricado.** Não recomendar é resposta legítima.

---

## CASO 3 · Score 95 com sustentação ruim — a prova central

Mesmo candidato do Caso 2, com `pre_match_score` **forçado para 95**:

```
pre_match_score:  95   ← altíssimo
status:           requer_enriquecimento
hipótese:         null
```

**Score alto não virou proposta forte.** Isso prova que o Matching **prioriza
mas não decide**: `pre_match_score` é número de retrieval, e o Recommendation
o trata como contexto, nunca como avaliação.

Quando há hipótese, o score aparece assim no racional:

> Contexto de priorização: o candidato ficou com pre_match_score 66.67 no
> Internal Matching — **número de retrieval, não avaliação comercial**.

---

## CASO 4 · Prospecção do zero

**Origem:** Marca Externa Não Cadastrada (`nao_vinculada`)

```
origem.parte_id:  null
status:           sustentacao_insuficiente
hipótese:         null
```

Sem perfil de origem não há o que comparar — e o agente diz isso em vez de
inventar convergência. Nenhuma Parte foi criada.

---

## CASO 5 · Candidato fora da shortlist — rejeitado

```
✓ recusado: Candidato 00000000-…-000000000000 não está na shortlist
  do Matching. Recommendation não cria candidato do nada.
```

O agente não reconstrói o universo de candidatos. Sem passar pelos filtros do
Matching, não existe proposta.

---

## Forte × Fraco lado a lado

| | Caso 1 (forte) | Caso 2/3 (fraco) |
|---|---|---|
| Hipótese | específica, com dimensões citadas | **null** |
| Status | `pronta_para_revisao` | `requer_enriquecimento` |
| Confiança | 75 | 10 |
| Próximo passo | `preparar_para_human_gate` | `solicitar_enriquecimento` |
| Racional | 6 linhas com proveniência | 1 linha explicando a recusa |

---

## Trace — três afirmações até a fonte

### Trace 1 · "Públicos: 2 em comum"

```
AFIRMAÇÃO   Públicos: 2 em comum (Cultura de rua, Jovens urbanos)
   ↓
SINAL       matching.sinais[tipo=publico] · forca=forte · valor=1.0
   ↓
PROVENIÊNCIA cross_intelligence.parte_publico(parte_id=9590a792…)
   ↓
FONTE       cadastro interno da Cross (ficha da Empresa)
```

### Trace 2 · "Crossability sustenta publicos"

```
AFIRMAÇÃO   A análise Crossability sustenta a dimensão publicos
   ↓
CROSSABILITY dimensions[publicos] · status=suportado · confiança=45
   ↓
KNOWLEDGE   K1 · Metodologia Crossability v2 › Públicos · relevância 0.451
   ↓
EVIDENCE    fact_pub0
   ↓
NÍVEL       estrutural — IA real ainda não homologada
```

### Trace 3 · "Escopo de campanha não é território"

```
CONTRA-EVIDÊNCIA  A metodologia separa escopo de campanha de território
   ↓
CROSSABILITY      dimensions[territorios].counterpoints[0]
   ↓
KNOWLEDGE         K2 · Metodologia Crossability v2 › Territórios
   ↓
EFEITO            rebaixou a leitura de território na proposta
```

---

## Zero ação automática — verificado

```
opportunities_created = 0
funnel_changes        = 0
projects_created      = 0
partnerships_created  = 0
meetings_created      = 0
score_card_executed   = false
```

Confirmado por contagem antes/depois no banco, inclusive **após persistir** a
proposta em `cross_ai.recomendacao` (migration 058). A proposta vive numa
tabela própria, separada de `candidatura_parceiro` e `frente_oportunidade`:
persistir hipótese em tabela operacional seria criar oportunidade por via
indireta.

---

## Versionamento

Reexecutar após mudança de Evidence/Perfil/Matching cria **nova versão** com o
mesmo `proposta_logica_id`. O histórico nunca é sobrescrito — duas versões com
hashes de entrada distintos permanecem auditáveis.

---

## Perguntas de validação humana

| # | Pergunta | Resposta |
|--:|---|---|
| 1 | Entendo por que a conexão é proposta? | Sim — racional com proveniência linha a linha |
| 2 | A hipótese é específica ou genérica? | Específica — cita as dimensões que casaram |
| 3 | Chego da Recommendation até os fatos? | Sim — 3 traces acima |
| 4 | Sei quais sinais de Matching foram usados? | Sim — `sinais_suporte` com proveniência |
| 5 | O Crossability contribui de fato? | Sim — inclusive **contra** a hipótese |
| 6 | Contra-evidências visíveis? | Sim — 2 pontos preservados |
| 7 | Gaps claros? | Sim — com origem preservada |
| 8 | O agente sabe recusar? | **Sim** — casos 2, 3, 4 e 5 |
| 9 | Score alto é só priorização? | **Sim** — caso 3 prova |
| 10 | Decisão sem humano? | Não — nenhum estado `aprovada` existe |
| 11 | Apresentaria para revisão da Cross? | Sim, com as limitações declaradas |

---

## Limitações

1. **Sem semântica** — herdada do Matching; nomes não casam por sinônimo.
2. **Crossability não homologado com IA real** — declarado em toda proposta.
3. **Racional é composição determinística**, não redação de LLM. Legível e
   auditável, mas sem nuance.
4. **Perfis do showcase são controlados** — os artefatos de AI-03/04 reais não
   cobriam as duas pontas da relação.
5. **Sem frontend** — por decisão de escopo da Sprint.
