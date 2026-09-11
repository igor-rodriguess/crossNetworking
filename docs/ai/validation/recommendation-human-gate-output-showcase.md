# Recommendation Human Gate — Output Showcase

**Sprint AI-07A** · Modo estrutural / determinístico
Custo em IA paga: **US$ 0** · LLM calls: **0** · Embedding calls: **0**

> A IA **propõe** · o humano **decide** · o sistema **registra**.

---

## Por que o Score Card não foi executado

A antiga AI-07 previa Recommendation → Score Card → Human Gate. A auditoria do
schema mostrou que isso não é possível sem violar a arquitetura:

```
cross_methodologies.avaliacao_score_card
  ├─ candidatura_parceiro_id  NOT NULL  →  FK cross_projects.candidatura_parceiro
  └─ validacao_paper_id       NOT NULL  →  exige Paper aprovado (RN022)
```

Uma Recommendation não tem candidatura nem Paper. Pontuá-la exigiria criar uma
candidatura — ou seja, **mudar o funil**, exatamente o que a Sprint proíbe.

Por isso o Score Card oficial permanece **intocado**, e esta Sprint entrega
apenas o gate anterior ao funil. A promoção é AI-07B.

---

## O fluxo entregue

```
RECOMMENDATION (AI-06)
        ↓
   HUMAN REVIEW
        ↓
┌───────────┬──────────────┬────────────────────────────────────┐
REJECT      EDIT+APPROVE   APPROVE
   │            │              │
   │            │              ▼
   │            │   APPROVED_FOR_OPPORTUNITY_REVIEW
   │            │        (ainda NÃO cria candidatura)
   │            └── edição humana auditada, IA preservada
   └── hipótese preservada como rejeitada
```

---

## CASO A · Aprovação

```
decisão:   aprovada_para_revisao_de_oportunidade
revisor:   Ana Estrategista   (do contexto autenticado)
motivo:    "Sinais consistentes de público e território; vale levar adiante."
validação: estrutural
```

O nome do estado é deliberadamente longo. `aprovada` sozinho sugeriria que algo
operacional aconteceu — **nada aconteceu**. A Cross aceitou a hipótese para
seguir ao processo de promoção, e só.

---

## CASO B · Edição + aprovação — IA vs Humano

| Campo | Proposto pela inteligência | Validado pela Cross | Motivo |
|---|---|---|---|
| `hipotese_oportunidade` | "Existe uma hipótese de conexão entre Cliente Alfa e Marca Editada, sustentada por convergência em público, território de atuação, segmento…" | "Cliente Alfa e Marca Editada devem ser avaliadas **prioritariamente no território de música**." | O território prioritário é música, não moda |
| `racional_humano` | — | "A frente de moda já está coberta por outra parceria ativa." | contexto fora da base |

```
snapshot IA preservado: true
```

O original fica em `snapshot_ia`; a edição em `edicoes_humanas`. **Campos
separados** — a versão da IA nunca é sobrescrita. É isso que permitirá medir
depois onde a Cross concorda, corrige ou rejeita.

---

## CASO C · Rejeição

```
decisão: rejeitada
motivo:  "A marca já possui acordo de exclusividade incompatível,
          não registrado na base."
recomendação preservada: true
```

Rejeitar não apaga nada: Recommendation, Evidence, Crossability e Matching
permanecem. Só a proposta foi recusada.

Note o motivo — é conhecimento que **não estava na base**. Exatamente o tipo de
correção humana que justifica o gate existir.

---

## CASO D · Sustentação insuficiente

```
✓ aprovação simples BLOQUEADA:
  "A recomendação está com status sustentacao_insuficiente.
   Aprovar exige override_insuficiente=true, para que a insuficiência
   fique registrada em vez de silenciada."

✓ com override explícito:  override_insuficiente = true
```

O humano **pode** decidir contra a leitura da inteligência — ele tem autoridade
final. Mas não por acidente: precisa reconhecer a insuficiência, e o
reconhecimento fica gravado.

---

## CASO E · Requisição duplicada

```
já existia: true  |  decisões gravadas: 1
```

Reenviar a mesma aprovação devolve a decisão existente. Um índice único parcial
(`WHERE decidido_em IS NOT NULL`) garante uma decisão efetiva por recomendação.

---

## CASO F · Concorrência

```
Revisor A decide           →  v1  aprovada
Revisor B leu v1, rejeita  →  v2  rejeitada        ✓ aceito
Revisor C ainda tem v1     →  BLOQUEADO

"Versão obsoleta: você leu a v1, mas a decisão atual já está na v2.
 Recarregue antes de decidir."
```

Optimistic locking com `versao_revisao`. Ninguém sobrescreve ninguém em
silêncio.

---

## CASO G · Histórico de versões

```
v2: aprovada_para_revisao_de_oportunidade — "Nova evidência mudou o quadro."
v1: rejeitada                             — "Evidência fraca."
```

Duas decisões independentes sobre a mesma proposta lógica. A rejeição da v1
**não mudou retroativamente** quando a v2 foi aprovada — cada decisão está presa
à versão que o humano efetivamente leu.

---

## Zero efeito operacional — medido

| Tabela | Antes | Depois | Delta |
|---|---:|---:|---:|
| `candidatura_parceiro` | 0 | 0 | **0** |
| `projeto` | 0 | 0 | **0** |
| `frente_oportunidade` | 0 | 0 | **0** |
| `paper_candidatura` | 0 | 0 | **0** |
| `avaliacao_score_card` | 0 | 0 | **0** |
| `historico_candidatura` | 0 | 0 | **0** |

```
opportunities_created = 0
funnel_changes        = 0
projects_created      = 0
partnerships_created  = 0
meetings_created      = 0
papers_created        = 0
score_cards_created   = 0
```

Após **7 decisões humanas**, incluindo três aprovações.

---

## RN022 e RN023 preservadas

Verificado por teste que lê o schema, não a documentação:

| Regra | Verificação | Resultado |
|---|---|---|
| **RN022** | `candidatura_parceiro_id` e `validacao_paper_id` seguem `NOT NULL` | ✅ |
| **RN023** | `criterio_score_card.peso_sim` / `peso_nao` existem; `score_total` segue `NOT NULL` | ✅ |
| Isolamento | `recomendacao_revisao` **não tem** coluna de candidatura, Paper ou Score Card | ✅ |

Nenhuma migration relaxou constraint alguma.

---

## Identidade do revisor

O contrato `decidirRevisaoSchema` **não aceita** `revisor_id`. A identidade vem
do contexto autenticado.

Teste com payload malicioso (`revisor_id` falso + `approved_by: "CEO"`):
a decisão foi gravada com o usuário real. Campos extras do payload são
ignorados pelo Zod.

---

## Trilha de auditoria

6 decisões registradas, cada uma com: `recomendacao_id`, `recomendacao_versao`,
`decisao`, `revisor_nome`, `motivo`, `override_insuficiente`, `versao_revisao`,
`decidido_em`.

---

## Perguntas de validação humana

| # | Pergunta | Resposta |
|--:|---|---|
| 1 | Sei o que a IA propôs? | Sim — `snapshot_ia` congelado |
| 2 | Sei o que o humano mudou? | Sim — `edicoes_humanas` em campo separado |
| 3 | O humano consegue discordar? | Sim — editar, rejeitar, override |
| 4 | A decisão fica auditada? | Sim — revisor, motivo, timestamp, versão |
| 5 | Rejeição preserva histórico? | Sim — nada é apagado |
| 6 | Existe automação operacional escondida? | **Não** — delta 0 em 6 tabelas |
| 7 | A decisão humana está acima da Recommendation? | Sim — inclusive contra a leitura da IA |
| 8 | Confiaria neste fluxo para a equipe revisar? | Com as limitações declaradas, sim |

---

## Limitações

1. **Validação de IA real continua PENDENTE** — toda revisão carrega
   `nivel_validacao: estrutural`.
2. **Sem frontend** — o contrato existe; a interface não foi construída nesta
   Sprint.
3. **Autorização mínima** — o serviço recebe a identidade do contexto, mas não
   há RBAC/RLS específico de Human Gate; segue o padrão atual da plataforma.
4. **`requer_mais_informacao` não dispara enriquecimento** — apenas marca
   `requer_enriquecimento = true`; o Orchestrator decide depois.
5. **Score Card não executado** — por decisão arquitetural, é AI-07B.
