# Entity Intelligence — Showcase de Validação

**Plataforma Cross** · Sprint AI-03
Data: 21/08/2026

> **Determinístico: 0 chamadas de LLM · custo US$ 0.00.**
> O Evidence Package já traz claims estruturados — não há inferência a fazer.
>
> **Caso A usa o Evidence Package REAL da AI-02.3** (Converse: 5 fatos de
> Bloomberg e FashionUnited). Os demais são fixtures controladas.
>
> **Raw outputs:** [`raw/entity-intelligence/`](raw/entity-intelligence/)

---

## Resumo dos casos

| Caso | Vínculo | Fatos | Conflitos | Lacunas | LLM |
|---|---|---:|---:|---:|---:|
| **A** Converse (real) | `nao_vinculada` | 5 | 0 | 4 | 0 |
| **B** cliente interno | `vinculada` | 1 | 0 | 4 | 0 |
| **C** sem cadastro | `nao_vinculada` | 1 | 0 | 4 | 0 |
| **D** conflito | `nao_vinculada` | 1 | **1** | 4 | 0 |

---

## CASO A — Converse, a partir de dados reais

### Entrada

```
EVIDENCE PACKAGE (AI-02.3)     DADOS INTERNOS
  status: sucesso                parte_id: null
  facts: 5                       eh_cliente_cross: false
  sources: 6                     (Converse não é cliente da Cross)
  lacunas: 1
```

### Profile produzido

**IDENTIDADE**
```
nome:                      Converse
dominio_oficial:           converse.com
vinculo:                   nao_vinculada
parte_id:                  null
requer_resolucao_humana:   true      ← nenhuma Parte foi criada
```

**PRODUTOS** (4 fatos)

| Fato | Verificação | Proveniência |
|---|---|---|
| A Converse enfrenta queda nas vendas | `fonte_unica` | `fact_873bc862c5` → `src_5b30b2602c` |
| A Converse representa menos de 3% da receita da Nike | `fonte_unica` | `fact_98884c28c9` → `src_5b30b2602c` |
| A Converse reduziu investimentos, incluindo corte de 44% em marketing no 2º trimestre fiscal | `fonte_unica` | `fact_c49cd8fe07` → `src_5b30b2602c` |
| A Converse tem buscado retomar espaço no basquete profissional, com novos modelos em parceria com Shai Gilgeous-Alexander | `fonte_unica` | `fact_f434061742` → `src_5b30b2602c` |

**MOVIMENTOS** (1 fato)

| Fato | Verificação | Proveniência |
|---|---|---|
| Converse inicia reestruturação e demissões em meio à queda nas vendas | `fonte_unica` | `fact_7ca7f01a7c` → `src_15fa92f270` |

**LACUNAS declaradas** (4)
```
[geral]        Nenhum fato foi corroborado por duas fontes independentes.
[publicos]     Nenhum fato confirmado sobre público.
[territorios]  Nenhum fato confirmado sobre territórios.
[ativos]       Nenhum fato confirmado sobre ativos.
```

**O perfil diz o que não sabe.** Nenhuma dessas lacunas foi preenchida com
conhecimento do modelo.

---

## Auditoria de proveniência (§46)

Cinco campos, com o caminho completo até a fonte:

| # | Campo do Profile | Proveniência | Evidence | Source |
|---|---|---|---|---|
| 1 | `produtos[1].valor`<br>*"menos de 3% da receita da Nike"* | `externo` | `fact_98884c28c9` | `src_5b30b2602c` → bloomberglinea.com.br |
| 2 | `produtos[2].valor`<br>*"corte de 44% em marketing"* | `externo` | `fact_c49cd8fe07` | `src_5b30b2602c` → bloomberglinea.com.br |
| 3 | `movimentos[0].valor`<br>*"reestruturação e demissões"* | `externo` | `fact_7ca7f01a7c` | `src_15fa92f270` → fashionunited.com.br |
| 4 | `relacao_interna.papeis[0]` (caso B) | `interno` | — | `parte_papel(parte_id=…b1)` |
| 5 | `relacao_interna.oportunidades[0]` (caso B) | `interno` | — | `candidatura_parceiro.id=op-exemplo-1` |

**Cada elemento externo tem `evidence_refs` + `source_refs` e `registro_interno: null`.**
**Cada elemento interno tem `registro_interno` e `evidence_refs: []`.**

A separação é estrutural, não convenção — está coberta por teste.

---

## CASO B — Interno + externo, sem misturar

```
INTERNO (banco da Cross)              EXTERNO (Evidence Package)
  eh_cliente_cross: true                movimentos: 1 fato
  papeis: [cliente, parceiro]           publicado_em: 2026-06-15
  oportunidades: 1                      verificacao: fonte_unica
  projetos: 1
       ↓                                       ↓
  origem: "interno"                     origem: "externo"
  registro_interno: "parte_papel(…)"    evidence_refs: [fact_ex_1]
  evidence_refs: []                     registro_interno: null
```

**"É cliente da Cross" vem do banco.** Nunca é inferido do site da empresa —
e o teste F garante isso.

---

## CASO C — Empresa sem cadastro (§48)

```
entidade:                  Empresa Externa Sem Cadastro
vinculo:                   nao_vinculada
parte_id:                  null
requer_resolucao_humana:   true

Partes criadas automaticamente: ZERO
```

O agente **nunca** cria Parte. Uma empresa pesquisada do zero produz perfil
externo e fica aguardando decisão humana.

Quando a resolução encontra várias Partes parecidas, o vínculo vira `ambigua`
e as candidatas ficam registradas — coberto por teste.

---

## CASO D — Conflito preservado (§49)

```
CLAIM A   "A marca confirmou o patrocínio do festival de música."
          fontes: [src_g1]

CLAIM B   "A marca não confirmou o patrocínio do festival de música."
          fontes: [src_exame]

          ↓

conflitos: [{
  claim_a, fontes_a: [src_g1],
  claim_b, fontes_b: [src_exame],
  observacao: "Fontes independentes divergem. Nenhuma versão foi escolhida."
}]
```

**Nenhum vencedor silencioso.** As duas versões ficam no perfil, cada uma com
sua fonte. A decisão é humana.

---

## Deduplicação (§27)

Mesmo fato vindo de duas fontes:

```
ANTES                                    DEPOIS
  fact_a  src_1  fonte_unica  conf 50      UM elemento
  fact_b  src_2  corroborada  conf 80      evidence_refs: [fact_a, fact_b]
                                           source_refs:   [src_1, src_2]
                                           verificacao:   corroborada
                                           confianca:     80
```

Consolida mantendo **todas** as referências — é isso que preserva a
corroboração, que distingue fato de boato. Mantém a verificação mais forte e a
maior confiança observadas.

---

## Versionamento, idempotência e ausência (§51–53)

### Idempotência

```
mesmos inputs → mesmo hash_entrada → nenhuma versão nova

v1  hash: 4a3f…                 (reexecução)
v1b hash: 4a3f…    IDÊNTICO ✅
```

Reordenar os fatos **não** muda o hash — só o conteúdo importa.

### Nova evidência → nova versão

```
v1 (5 fatos)  →  nova evidência  →  v2

diff:
  adicionados:              1  ("A Converse anunciou uma colaboração com
                                 um artista brasileiro")
  ausentes_nao_removidos:   0
```

### Ausência NÃO é remoção ⭐

O pacote da v2 **não repetiu** os 5 fatos originais. Mesmo assim:

```
fatos da v1 preservados na v2: 1 / 1
```

Um fato que não reaparece numa nova pesquisa **continua no perfil**. Não
aparecer não prova que deixou de existir — remover exigiria evidência
explícita.

O diff registra como `ausentes_nao_removidos`, não como removidos.

---

## Classificação de qualidade (§58)

| Elemento | Classificação | Justificativa |
|---|---|---|
| `produtos` (4 fatos) | **SUPPORTED** | Cada um com quote literal validada na AI-02.3 e fonte Bloomberg |
| `movimentos` (1 fato) | **SUPPORTED** | Manchete literal da FashionUnited |
| `identidade.vinculo` | **SUPPORTED** | Derivado de `parte_id` ausente — fato interno |
| `relacao_interna` (caso B) | **SUPPORTED** | Direto do banco, com id do registro |
| `lacunas` (4) | **SUPPORTED** | Derivadas de seções vazias, não inventadas |
| `timeline` (caso B) | **SUPPORTED** | Único item com `publicado_em` real |

**SUPPORTED: 12 · QUESTIONABLE: 0 · UNSUPPORTED: 0**

Nenhum elemento sem proveniência entrou no Profile.

---

## O que o agente NÃO fez

Verificado por teste (cenários I, J, K):

```
✗ cross_knowledge / knowledgeReferences   — ausentes do Profile
✗ crossability / score_fit / score_card   — ausentes
✗ recomendacao / matching                 — ausentes
✗ Parte criada automaticamente            — nenhuma
✗ inferência promovida a fato             — filtrada (natureza !== "fato")
✓ llm_calls: 0 · custo: US$ 0.00
```

---

## Telemetria

| | Caso A | Caso B | Caso C | Caso D |
|---|---:|---:|---:|---:|
| Registros internos | 0 | 4 | 0 | 0 |
| Fatos considerados | 5 | 1 | 1 | 1 |
| Fatos consolidados | 5 | 1 | 1 | 1 |
| Duplicatas mescladas | 0 | 0 | 0 | 0 |
| Conflitos | 0 | 0 | 0 | 1 |
| Lacunas | 4 | 4 | 4 | 4 |
| **LLM calls** | **0** | **0** | **0** | **0** |
| **Custo** | **US$ 0** | **US$ 0** | **US$ 0** | **US$ 0** |

---

## Respostas às perguntas de validação (§60)

| # | Pergunta | Resposta |
|---|---|---|
| 1 | O Profile representa a empresa corretamente? | **Sim, no que sabe.** 5 fatos reais sobre a situação financeira e o movimento no basquete |
| 2 | Distingo Cross de internet? | **Sim.** `origem: interno` vs `externo`, campos mutuamente exclusivos |
| 3 | Cada afirmação tem origem? | **Sim.** Nenhum elemento sem proveniência |
| 4 | Há inferência escondida como fato? | **Não.** `natureza !== "fato"` é filtrado |
| 5 | Há duplicação? | **Não.** Consolidação com merge de referências |
| 6 | Conflitos visíveis? | **Sim.** Caso D, ambos os lados preservados |
| 7 | Lacunas expostas? | **Sim.** 4 declaradas no caso real |
| 8 | Empresa cadastrada sem autorização? | **Não.** Zero Partes criadas |
| 9 | Atualização preserva histórico? | **Sim.** v1 preservada; ausência não remove |
| 10 | **Confiaria como entrada do Crossability?** | **Com ressalva** — ver abaixo |

---

## A ressalva honesta

**O perfil é estruturalmente sólido, mas factualmente magro.**

Os 5 fatos da Converse são todos `fonte_unica` — **nenhum corroborado**. E as
três dimensões que o Crossability mais precisa estão vazias:

```
publicos:     0 fatos    → lacuna declarada
territorios:  0 fatos    → lacuna declarada
ativos:       0 fatos    → lacuna declarada
```

Isso não é defeito do Entity Intelligence: ele consolidou fielmente o que
recebeu. É consequência de o Research Agent ter raspado **2 páginas** sobre
situação financeira, não sobre público ou território.

**Para alimentar o Crossability de verdade**, o caminho é rodar o Research
Agent com objetivos dirigidos — `publico`, `territorio`, `ativo` — e mais
páginas por entidade. O Entity Intelligence então consolidaria um perfil com as
seis dimensões cobertas.

**O contrato está pronto. O volume de evidência, não.**
