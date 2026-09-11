# Opportunity Promotion + Paper + Official Score Card — Output Showcase

**Sprint AI-07B** · Modo estrutural / determinístico
Custo em IA paga: **US$ 0** · LLM calls: **0** · Embedding calls: **0**

> Este é o ponto em que a inteligência finalmente toca o domínio operacional —
> e ela só toca porque **uma pessoa mandou**.

---

## O fluxo completo, executado de verdade

```
RECOMMENDATION (AI-06)
        ↓
HUMAN GATE (AI-07A)          decisão: aprovada_para_revisao_de_oportunidade
        ↓
PROMOÇÃO HUMANA EXPLÍCITA    Ana Estrategista clicou
        ↓
CANDIDATURA                  status inicial: identificada
        ↓
PAPER                        validação: pendente  →  Score Card BLOQUEADO
        ↓
APROVAÇÃO HUMANA DO PAPER    aprovada por usuário interno
        ↓
SCORE CARD OFICIAL           10.0000 + 3 = 13.0000
```

---

## 1 · Antes da promoção: zero oportunidades

```
recomendação: 02ffa656… (v1)
decisão:      aprovada_para_revisao_de_oportunidade
revisor:      Ana Estrategista

candidaturas neste ponto: 0
```

A hipótese estava **aprovada** e ainda assim nada operacional existia. É a
diferença entre o Human Gate 1 (a hipótese merece seguir?) e a ação de promoção
(quero efetivamente colocá-la no pipeline?).

---

## 2 · A promoção é humana

```
decisão da IA de promover:  NENHUMA
ação humana de promover:    SIM (Ana Estrategista)

candidatura criada:  97c1fe68…
status inicial:      identificada
histórico do funil:  1 entrada, responsável = humano
```

Não existe caminho `if aprovada: criar candidatura`. A promoção é uma chamada
deliberada, com identidade autenticada.

**Status inicial `identificada`** — ordem 1 dos 16 estados que já existiam.
Nenhum estado novo foi inventado.

**O histórico registra a pessoa**, não a IA. A inteligência propôs; quem
colocou no funil foi alguém com nome.

### Promoção duplicada

```
jaExistia = true   ·   mesma candidatura = true
```

Índice único em `recomendacao_id`. Clique duplo devolve a promoção existente —
e mesmo uma escrita concorrente que burlasse a checagem esbarraria na
constraint (coberto por teste).

---

## 3 · RN022 provada em execução

Esta é a prova que a Sprint pediu — comportamento real, não leitura de schema.

### ANTES da aprovação do Paper

```
validação do Paper:  pendente
Score Card:          BLOQUEADO
```

RN022 exige `aprovada` ou `aprovada_com_ajustes`.

### Aprovação humana do Paper

```
aprovado por:                usuário interno (9d2a5cfd…)
aprovação automática por IA:  NÃO
```

Nenhuma linha de código desta Sprint escreve `status_validacao = aprovada` por
conta própria.

### DEPOIS da aprovação

```
Score Card: PERMITIDO
```

---

## 4 · RN023 — pesos versionados

```
modelo/versão:        0bcba733… (v1, vigente_desde hoje)
critério:             "Aderência de público"   peso_sim = 10.0000
resposta:             sim  →  10.0000
potencial disruptivo: 3
─────────────────────────────────────────────
score calculado:      10.0000 + 3 = 13.0000
```

O score **deriva dos pesos da versão vigente**. Não foi digitado, não veio de
LLM, e a avaliação guarda `versao_modelo_score_card_id` — permitindo auditar
depois qual conjunto de pesos sustentou a nota.

### Score tampering

`potencial_disruptivo = 99` é rejeitado pela constraint
`ck_avaliacao_potencial_disruptivo` (1..5). Coberto por teste com SAVEPOINT,
verificando também que nenhuma avaliação inválida ficou gravada.

---

## 5 · Prospecção do zero — bloqueada

```
motivo: requer_resolucao_de_entidade

"A entidade de origem não está vinculada a uma Parte.
 Resolva o vínculo antes de promover."
```

A recomendação estava **aprovada** e mesmo assim a promoção parou. Criar Parte
automaticamente seria inventar identidade no domínio — a resolução é humana,
por fluxo próprio.

```
candidaturas criadas: 0
Partes criadas:       0
```

---

## 6 · Proveniência ponta a ponta

```
Score Card        88b7be84…
  ↳ Candidatura   97c1fe68…
  ↳ Promoção      a55d18d3…  por Ana Estrategista
  ↳ Human Gate    2d676f40…  aprovada_para_revisao_de_oportunidade (Ana Estrategista)
  ↳ Recommendation 02ffa656…  v1
  ↳ Matching pesos retrieval-v1  ·  Crossability hash-cross-showcase
```

De uma nota de Score Card até a hipótese original, passando por **duas
decisões humanas nomeadas**. É possível responder "por que esta oportunidade
existe?" sem sair do banco.

---

## 7 · Zero automação depois da promoção

| Métrica | Valor |
|---|---:|
| candidaturas | 1 (uma por promoção humana) |
| movimentações de funil | 1 (só a entrada) |
| **avanços automáticos de estágio** | **0** |
| projetos criados | **0** |
| parcerias criadas | **0** |
| reuniões criadas | **0** |

A candidatura entrou em `identificada` e **ficou lá**. Nenhum score, por mais
alto, moveu o funil — a equipe Cross controla os estágios.

---

## Onde cada gate está

| Gate | Pergunta | Cria o quê? |
|---|---|---|
| **Human Gate 1** (AI-07A) | A hipótese merece seguir? | Nada |
| **Promoção** (AI-07B) | Quero colocá-la no pipeline? | Candidatura |
| **Aprovação do Paper** | A estratégia está validada? | Libera o Score Card |
| **Score Card** | Qual a nota pela metodologia? | Avaliação oficial |

Quatro pontos de decisão, **quatro atores humanos**. A IA não atravessa nenhum.

---

## Perguntas de validação humana

| # | Pergunta | Resposta |
|--:|---|---|
| 1 | A promoção exige ação humana? | Sim — não existe gatilho automático |
| 2 | Recomendação rejeitada pode ser promovida? | Não — bloqueada |
| 3 | Estado inicial é real? | Sim — `identificada`, ordem 1 |
| 4 | O histórico mostra quem promoveu? | Sim — usuário interno |
| 5 | Score Card sem Paper aprovado? | **Bloqueado** (RN022 em execução) |
| 6 | O score veio dos pesos versionados? | Sim — 10 + 3 = 13, rastreável |
| 7 | Score alto move o funil? | Não — 0 avanços |
| 8 | Entidade sem Parte é promovida? | Não — bloqueada |
| 9 | Dá para auditar a origem? | Sim — cadeia completa |
| 10 | Alguma criação iniciada só pela IA? | **Não** |

---

## Limitações

1. **Frente é escolha humana** — o serviço recebe `frenteOportunidadeId`; não
   infere a frente, porque isso seria decisão de negócio.
2. **Paper não é pré-preenchido** — o domínio atual trata criação de Paper como
   ação humana; não inventamos fluxo.
3. **Sem frontend** — contratos prontos, interface não construída.
4. **`aplicarAvaliacao()` não foi chamado no showcase** — o service exige
   contexto HTTP/usuário; o showcase insere pelo mesmo caminho de dados e
   verifica as mesmas constraints. Os testes cobrem a regra; a integração via
   endpoint fica para a etapa de frontend.
5. **Opportunity → Project ainda em aberto** — o evento que converte
   oportunidade em projeto não foi definido, por decisão da Sprint.
6. **Validação de IA real continua PENDENTE.**
