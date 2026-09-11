# 17 — Opportunity Promotion + Paper + Official Score Card

**Sprint AI-07B** · Documentação técnica curta.
Artefato principal: [output showcase](validation/opportunity-promotion-paper-scorecard-output-showcase.md).

---

## Responsabilidade

Liga a camada de inteligência ao domínio operacional:

```
Recommendation aprovada  →  [promoção humana]  →  candidatura_parceiro
                                                        ↓
                                                      Paper
                                                        ↓
                                              aprovação humana (RN022)
                                                        ↓
                                              Score Card oficial (RN023)
```

---

## Promotion Gate

`promocao.service.promover(client, entrada, promotor)`

**Pré-condições verificadas, nessa ordem:**

| # | Checagem | Bloqueio |
|--:|---|---|
| 1 | Recomendação existe | `recomendacao_inexistente` |
| 2 | Já promovida? | devolve a existente (idempotente) |
| 3 | Existe decisão humana | `sem_revisao_humana` |
| 4 | Decisão é aprovação | `revisao_nao_aprovada` |
| 5 | Aprovação é da mesma versão | `revisao_de_outra_versao` |
| 6 | Entidades vinculadas a Parte | `requer_resolucao_de_entidade` |

A checagem 5 importa: aprovar a v1 não autoriza promover a v2, que pode dizer
outra coisa.

**A entrada não aceita `promovido_por_id`** — vem do contexto autenticado.

---

## Candidatura linkage

| Item | Valor |
|---|---|
| Tabela | `cross_projects.candidatura_parceiro` (existente) |
| Status inicial | `identificada` — ordem 1 dos 16 estados reais |
| Frente | recebida por parâmetro; decisão humana |
| Histórico | `historico_candidatura` com `responsavel_id` = pessoa |

Nenhum estado de funil foi criado. `frente_oportunidade_id` é `NOT NULL`, então
a frente precisa existir — por isso é entrada, não inferência.

---

## Promotion record

`cross_ai.promocao_oportunidade` (migration **060**):

```
recomendacao_id + recomendacao_versao  →  origem na inteligência
revisao_id                             →  Human Gate que autorizou
candidatura_parceiro_id                →  destino operacional
promovido_por_id + promovido_em        →  ator humano
```

Índice único em `recomendacao_id` — uma promoção por hipótese.

`rastrearOrigem(candidaturaId)` reconstrói a cadeia até a Recommendation.

---

## Paper workflow

Reutilizado sem alteração:

```
paper → versao_paper → validacao_paper (status_validacao)
```

Status: `pendente` · `aprovada` · `aprovada_com_ajustes` · `reprovada`.

**Nenhum código desta Sprint aprova Paper.** A aprovação é ação humana pelo
fluxo existente.

---

## RN022 — preservada

`aplicarAvaliacao()` exige validação com status `aprovada` ou
`aprovada_com_ajustes`. O schema reforça: `validacao_paper_id NOT NULL`.

Provado **em execução**: Score Card bloqueado com Paper pendente, liberado após
aprovação humana.

---

## RN023 — preservada

O score deriva de `criterio_score_card.peso_sim` / `peso_nao` da versão
vigente, mais `potencial_disruptivo` (1..5, constraint de banco).

```
10.0000 (peso_sim) + 3 (potencial) = 13.0000
```

A avaliação guarda `versao_modelo_score_card_id` — audita-se depois qual
conjunto de pesos sustentou a nota.

---

## Score determinístico

O motor continua sendo `metodologias.service.aplicarAvaliacao()`. Não foi
duplicado, não foi reimplementado, não foi substituído.

Score não pode ser enviado arbitrariamente: deriva dos pesos, e valores fora da
faixa são rejeitados pelo banco.

---

## Gaps restantes

1. **Opportunity → Project** — o evento que converte oportunidade em projeto
   **não foi definido**. Sabe-se que Projeto = oportunidade consolidada, mas
   qual ação operacional dispara a conversão continua em aberto. Não foi
   inventado gatilho.
2. **Pré-preenchimento do Paper** — possível deterministicamente a partir de
   Recommendation/Evidence, mas o domínio atual trata criação de Paper como
   ação humana; preservado.
3. **Frontend** — contratos estáveis, interface não construída.
4. **Integração via endpoint** — a promoção é serviço; falta expor rota com o
   contexto autenticado da plataforma.
5. **Validação de IA real** — continua PENDENTE.
