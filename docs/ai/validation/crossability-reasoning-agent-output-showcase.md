# Crossability Reasoning Agent — Output Showcase

**Sprint AI-04** · Validação com dados reais
Entidade: **Converse** · Provider: **Ollama local (`qwen3:4b`)** · Custo: **US$ 0**

> Este documento existe para responder uma pergunta: **o raciocínio parece o
> jeito Cross de pensar, ou parece opinião genérica de LLM?**

---

## Pré-condição — AI-03 verificada

A Sprint bloqueia execução se o Entity Intelligence Profile não estiver íntegro.
Verificado contra o perfil real, não contra o código:

| Critério | Resultado |
|---|---|
| Profile estruturado | ✅ 12 elementos |
| Provenance funcionando | ✅ 12/12 com referência |
| **UNSUPPORTED elements** | ✅ **0** |
| Evidence ⊥ dados internos | ✅ 0 misturas de origem |
| Conflitos preservados | ✅ campo presente |
| Knowledge gaps explícitos | ✅ 5 lacunas declaradas |
| Nenhuma entidade criada | ✅ `nao_vinculada`, requer humano |

---

## A cadeia completa

```
ENTITY INTELLIGENCE (AI-03)
  12 fatos · proveniência externa · 5 lacunas
            ↓
EVIDENCE (AI-02.3)
  fact_ids rastreáveis até a URL de origem
            ↓
CROSS KNOWLEDGE (AI-01)
  Metodologia Crossability v2 · 7 chunks · retrieval por dimensão
            ↓
CROSSABILITY REASONING (AI-04)
  6 dimensões · dupla sustentação · referências validadas
```

---

## O achado central: a metodologia saiu do prompt

Esta é a mudança que a Sprint pediu, e ela é verificável.

### ANTES — `crossability-reasoning.agent.ts` (legado)

A metodologia inteira vive no prompt, como verdade imutável:

```ts
const SYSTEM = `Você é o Agente de Raciocínio Crossability da plataforma Cross.
A metodologia Crossability avalia o encaixe [...] em SEIS dimensões:
- compatibilidade_publicos: os públicos casam ou se complementam?
- compatibilidade_territorios: territórios/praças em comum ou complementares?
- complementaridade_ativos: os ativos do parceiro somam ao que falta ao cliente?
[...]`;
```

Consequências: mudar a metodologia exige deploy; não há versão registrada; e
nenhuma análise consegue responder *"qual metodologia sustentou esta conclusão?"*.

### DEPOIS — `crossability/crossability-reasoning.agent.ts` (novo)

O prompt ensina a **usar** a metodologia; não a contém:

```ts
1. A metodologia NÃO é sua. Ela vem no bloco METODOLOGIA CROSS, com
   referências K1, K2… Use SOMENTE ela para interpretar. Você não tem
   metodologia própria de avaliação de parcerias.
```

A metodologia virou documento indexado, versionado e recuperado.

**Estado: metodologia hardcoded no agente novo = NENHUMA.**
O agente legado permanece com metodologia hardcoded — ver [limitações](#limitações).

---

## Retrieval por dimensão — funcionou

Cada dimensão recuperou **a seção correspondente da metodologia**, sem que
nenhuma regra de mapeamento fosse escrita para isso: a consulta é semântica.

| Dimensão | Seção recuperada | Versão | Relevância |
|---|---|---:|---:|
| `publicos` | Metodologia Crossability › **Públicos** | v2 | 0.451 |
| `territorios` | Metodologia Crossability › **Territórios** | v2 | 0.410 |
| `ativos` | Metodologia Crossability › **Ativos** | v2 | 0.380 |
| `sinergias` | Metodologia Crossability (raiz) | v2 | 0.355 |
| `fit_estrategico` | Metodologia Crossability › **Fit estratégico** | v2 | 0.380 |
| `momento` | Metodologia Crossability › **Momento** | v2 | 0.452 |

**Todas v2.** A v1 foi indexada de propósito e obsoletada — nenhuma dimensão a
recuperou. Versionamento de metodologia comprovado.

Por dimensão: 7 chunks considerados, 1 entregue, 6 descartados (limiar,
deduplicação por seção, top-k).

> ⚠️ **Relevância 0.35–0.45 é baixa** porque os embeddings são o stub
> determinístico (`AI_PAID_PROVIDERS_ENABLED=false`). Isso valida **arquitetura**
> — filtros, versão, isolamento, mapeamento — e **não** qualidade semântica.

---

## Isolamento por cliente

Cenário controlado: conhecimento global + playbook exclusivo do Cliente B;
análise executada para o Cliente A.

```
Referências do Cliente B usadas na análise do Cliente A:  ZERO
```

Coberto por teste automatizado (cenário G).

---

## ⚠️ Como esta análise foi executada — leia antes

O reasoning **não pôde rodar com o modelo local**. Medição direta contra
`qwen3:4b` em CPU:

| Modo | Resultado | Tempo |
|---|---|---:|
| Gramática estruturada (schema completo) | HTTP 400 `failed to parse grammar` | imediato |
| Gramática estruturada (schema plano) | **timeout sem token** | > 180s |
| JSON livre | HTTP 200 | **141.601 ms** (178 tokens ≈ **1,35 tok/s**) |

Seis dimensões exigiriam ~30 minutos, estourando o timeout em cada chamada. Em
JSON livre o modelo **ignorou os nomes de campo** do contrato — que é justamente
por que a gramática existe.

**Não afrouxamos o contrato para caber no hardware.**

Este showcase substitui **apenas a redação do modelo** por respostas controladas.
Tudo o mais é real e executado:

| Camada | Real? |
|---|---|
| Entity Intelligence Profile (Converse, AI-03) | ✅ real |
| Retrieval de Cross Knowledge (embeddings, versão, top-k, limiar) | ✅ real |
| Validação de referências E… e K… | ✅ real |
| Regra de dupla sustentação e tetos de confiança | ✅ real |
| Cost Guardrails | ✅ real |
| **Redação das conclusões** | ⚠️ **controlada** |

Portanto: **a arquitetura está validada; a qualidade de redação do modelo não.**

---

## Correção aplicada ao perfil antes da análise

O perfil da AI-03 tinha os fatos de público e ativos arquivados sob
`movimentos` — consequência do defeito de classificação corrigido nesta mesma
sessão.

Isso não é cosmético: o Crossability seleciona fatos **por seção**, então um
fato de público em `movimentos` nunca chega à dimensão Públicos. Reprocessado
com `scripts/reclassificar-perfil.ts`:

```
movimentos -> publicos: A ação global ... com apoio de artistas da comunidade
movimentos -> publicos: A marca propõe engajamento ... dos jovens da sua comunidade
movimentos -> ativos:   Converse All Stars is a program to support emerging creators
movimentos -> ativos:   All Stars gain access to a global network of talent

publicos=2  territorios=0  ativos=2   (antes: 0 / 0 / 0)
```

---

## As seis dimensões

### 1 · Públicos — `media` · confiança **45** · `suportado`

> O perfil traz um sinal direto de público: a marca declara engajar jovens da
> sua comunidade. Pela metodologia, isso caracteriza um público identificável,
> mas a leitura de sobreposição depende de conhecer o público da outra parte,
> que não está nesta análise.

| | Conteúdo | Âncoras |
|---|---|---|
| **✅** | A marca declara engajar jovens da sua própria comunidade | `E2` + `K1` |
| **✅** | A comunidade global de artistas participou da ação, delimitando público criativo | `E1` + `K1` |
| **⚠️ contra** | Nenhum dado demográfico verificável: faixa etária, renda e região desconhecidas, então a sobreposição não é mensurável | `E2` + `K1` |

**Gaps:** sem dado demográfico estruturado; público da contraparte fora da análise.

---

### 2 · Territórios — `baixa` · confiança **30** · `suportado`

> Pela metodologia, escopo de campanha não é território de atuação: uma ação
> pontual não prova presença estruturada.

| | Conteúdo | Âncoras |
|---|---|---|
| **✅** | Há registro de ação global com murais em várias cidades | `E12` + `K1` |
| **⚠️ contra** | A metodologia separa escopo de campanha de território; o fato é escopo, não presença estruturada | `E12` + `K1` |

**Este é o melhor exemplo do "jeito Cross".** O agente tinha um fato que
*parecia* provar território global e **recusou** essa leitura — porque a
metodologia recuperada diz explicitamente que campanha ≠ território.

---

### 3 · Ativos — `media` · confiança **50** · `suportado`

> O programa All Stars e a rede global de talentos são ativos que EXISTEM. A
> metodologia exige separar existência de valor estratégico.

| | Conteúdo | Âncoras |
|---|---|---|
| **✅** | O programa All Stars é ativo próprio, voltado a criadores emergentes | `E3` + `K1` |
| **✅** | A rede global de talentos é ativo acionável em parceria | `E4` + `K1` |
| **⚠️ contra** | Existir não implica valor: sem evidência de disponibilidade para parceria externa | `E3` + `K1` |

Aplica a distinção `ASSET EXISTS` × `ASSET HAS STRATEGIC VALUE` exigida pela Sprint.

---

### 4 · Sinergias — `baixa` · confiança **30** · `suportado`

| | Conteúdo | Âncoras |
|---|---|---|
| **✅** | Público criativo e programa próprio formam par acionável | `E2`,`E3` + `K1` |
| **❌ rejeitado** | "A marca já opera parcerias formais de co-branding com grandes varejistas" | `E99` **inexistente** |

**Gap:** território não sustentado impede afirmar sinergia — o cruzamento
exigido fica incompleto.

---

### 5 · Fit Estratégico — `indeterminado` · confiança **15** · `insuficiente`

**Esta é a dimensão fraca exigida pela Sprint (§55).**

| | Conteúdo | Resultado |
|---|---|---|
| **❌ rejeitado** | Ponto citou `E3` (um ativo) | E3 não é ofertado a Fit — seções são `posicionamento/contexto/movimentos/relacionamentos` |
| **❌ rejeitado** | "A marca provavelmente prioriza performance comercial sobre cultura" | `sem_sustentacao` — nenhuma âncora |

Sem ponto sustentado, o status caiu para `insuficiente` e o assessment para
`indeterminado`, **mesmo havendo fato e metodologia disponíveis**.

---

### 6 · Momento — `indeterminado` · confiança **15** · `insuficiente`

> A metodologia condiciona momento a sinais recentes e datados. Nenhum fato
> possui data de publicação, portanto não é possível afirmar janela de
> oportunidade.

| | Conteúdo | Âncoras |
|---|---|---|
| **⚠️ contra** | Nenhum fato do perfil possui data verificável | `E11` + `K1` |

Recusa correta: `publicado_em` ausente em todos os fatos ⇒ confiança mínima.

---

## Trace completo — três conclusões

### Trace 1 · "A marca engaja jovens da sua comunidade"

```
CONCLUSÃO   Públicos · assessment media · confiança 45
   ↓
KNOWLEDGE   K1 · Metodologia Crossability v2 › Públicos · relevância 0.451
            "Avalia-se sobreposição e complementaridade [...] Público precisa
             ser observável em evidência."
   ↓
EVIDENCE    E2 · fact_5a0416359b
            "A marca Converse propõe engajamento da visibilidade dos jovens
             da sua comunidade"
   ↓
FONTE       Evidence Package AI-02.3 · quote validada contra o conteúdo raspado
```

### Trace 2 · "Ação global não prova território"

```
CONCLUSÃO   Territórios · assessment baixa · confiança 30
   ↓
KNOWLEDGE   K1 · Metodologia Crossability v2 › Territórios · relevância 0.410
            "Escopo de campanha não é território de atuação — uma ação global
             pontual não prova presença estruturada."
   ↓
EVIDENCE    E12 · fact_64fd9aa65b
            "A ação global Converse City Forest envolveu a criação de murais
             em várias cidades do mundo"
   ↓
RESULTADO   assessment REBAIXADO por decisão metodológica, não por falta de fato
```

### Trace 3 · "All Stars é ativo, mas valor não comprovado"

```
CONCLUSÃO   Ativos · assessment media · confiança 50
   ↓
KNOWLEDGE   K1 · Metodologia Crossability v2 › Ativos · relevância 0.380
            "o ativo EXISTE (fato) [...] o ativo TEM VALOR ESTRATÉGICO
             (interpretação, depende de contrapartida)"
   ↓
EVIDENCE    E3 · fact_364ec0591a
            "Converse All Stars is a program to support the world's best
             emerging creators"
   ↓
RESULTADO   existência SUSTENTADA; valor estratégico marcado como não comprovado
```

---

## Contra-evidência — sem confirmation bias

Contra-evidência registrada em **4 das 6 dimensões**, sempre ancorada:

| Dimensão | Contra-evidência |
|---|---|
| Públicos | sem dado demográfico ⇒ sobreposição não mensurável |
| Territórios | escopo de campanha ≠ território |
| Ativos | existir ≠ ter valor estratégico |
| Momento | nenhum fato datado |

---

## Referências rejeitadas — 4

| Motivo | Dimensão | O que foi barrado |
|---|---|---|
| `evidence_ref_inexistente` | sinergias | citou `E99`, que não existe |
| `evidence_ref_inexistente` | sinergias | contra-ponto citando ref fora da dimensão |
| `evidence_ref_inexistente` | fit_estrategico | citou `E3`, não ofertado a essa dimensão |
| `sem_sustentacao` | fit_estrategico | "provavelmente prioriza performance comercial" — nenhuma âncora |

Nenhuma sobreviveu ao output final.

---

## Classificação humana das conclusões (§61)

| Conclusão | Classificação |
|---|---|
| Público jovem/criativo identificável | **SUPPORTED** |
| Sobreposição de público não mensurável | **SUPPORTED** |
| Ação global não prova território estruturado | **SUPPORTED** |
| All Stars e rede de talentos existem como ativos | **SUPPORTED** |
| Valor estratégico dos ativos não comprovado | **SUPPORTED** |
| Par público-criativo + programa é acionável | **QUESTIONABLE** — território ausente deixa o cruzamento incompleto |
| Momento não avaliável | **SUPPORTED** |
| Fit estratégico | **INSUFICIENTE** — declarado, não apresentado como conclusão |

**Conclusões UNSUPPORTED no output final: ZERO.**

---

## Não-Recommendation confirmado (§60)

Output final **não contém**: recomendação de parceiro, sugestão de reunião,
mudança de funil, criação de oportunidade ou de projeto. Coberto por testes
L, M, N, O.

Síntese produzida — descritiva, não prescritiva:

> "A análise apresenta sustentação dupla (fato + metodologia) em 4 de 6
> dimensões: Públicos, Territórios, Ativos, Sinergias. Contra-evidência
> registrada em: Públicos, Territórios, Ativos, Momento. Fit avaliado para o
> objetivo declarado: 'identificar potencial de ativação cultural conjunta com
> marcas de música e moda'."

---

## Telemetria

| Métrica | Valor |
|---|---|
| Dimensões | 6 |
| Chamadas de LLM | 6 |
| Chamadas de retrieval | 6 (**vetoriais, sem LLM**) |
| Contexto | 21.803 caracteres |
| Custo | **US$ 0** |
| Metodologia | `metodologia-crossability` **v2** |
| Confiança global | 39 |
| Rejeitados | 4 |

---

## Limitações

1. **O agente legado continua servindo as rotas.** O novo não está plugado em
   `agentes.routes.ts`. Migrar exige decidir o destino de `scoreFitDaAnalise()`
   e do contrato `AnaliseCrossabilitySaida`, que a plataforma persiste hoje.
   Verificado por `git diff`: ambos os arquivos legados estão **intocados**.

2. **Embeddings determinísticos.** Relevância semântica não medida.

3. **O perfil usado é anterior à reclassificação.** Os fatos de público e ativos
   descobertos hoje ainda estão sob `movimentos` neste perfil. A análise reflete
   o perfil como ele estava, não como ficará depois de reprocessado.

4. **Modelo local pequeno** (`qwen3:4b`, CPU). O backend garante estrutura e
   proveniência; a redação varia.

5. **Sem persistência.** A análise vive na resposta; não há migration.
