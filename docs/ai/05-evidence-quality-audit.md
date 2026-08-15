# 05 — Auditoria de Evidência, Credibilidade e Verificação

**Plataforma Cross** · Sprint 0B
Data: 07/08/2026

> Área crítica: é o que separa "a IA sugeriu" de "a Cross pode levar isto ao
> cliente".

---

## 1. O sistema distingue FATO, INFERÊNCIA e RECOMENDAÇÃO?

**Parcialmente — e melhor do que a média, mas com uma falha estrutural.**

| Camada | Como é representada | Distinção explícita? |
|---|---|---|
| **FATO** | `ColetaFontesSaida.resultados` (título, url, trecho, fonte) | **Sim** — dado bruto de coleta |
| **INFERÊNCIA** | `perfis[]` do extractor; dimensões da Crossability | **Parcial** — estruturado, mas sem marcação de "isto é inferido" |
| **RECOMENDAÇÃO** | `RecomendacaoSaida.ranking` + `oportunidade_ia` | **Sim** — entidade própria, status `rascunho` |

**O que funciona bem:**

- Cada camada é uma etapa separada com auditoria própria em `execucao_agente`
- `oportunidade_ia` nasce em `status='rascunho'` — nunca é verdade operacional
- O campo `confianca` (0–100) acompanha a análise
- O racional textual sempre declara limitação: *"A sugestão é preliminar e não
  usa a Base Cross como prova de fit"*
  ([crossability-reasoning.agent.ts:261](backend/src/modules/agentes/crossability-reasoning.agent.ts#L261))

**A falha estrutural:** não existe um tipo `Fato` de primeira classe com
proveniência. Um "fato" só existe como campo dentro do perfil extraído
(`publicos: string[]`, `ativos: string[]`) — **strings soltas, sem URL, sem data,
sem verificação individual**.

Quando o extractor diz que a marca X tem público "jovem urbano", essa afirmação:
- não carrega qual URL a sustenta
- não passou pelo Fact Verifier
- não tem data de coleta própria
- não pode ser contestada individualmente na curadoria

---

## 2. Campos exigidos por fato

Do briefing, campo a campo:

| Campo exigido | Existe? | Onde | Observação |
|---|---|---|---|
| `source URL` | **PARCIAL** | `ResultadoBusca.url`, `perfil.fontes[].url` | No nível da fonte, **não do fato** |
| `título` | **SIM** | `ResultadoBusca.titulo` | |
| `data (da publicação)` | **NÃO** | — | DuckDuckGo não devolve; não é extraída |
| `data de coleta` | **PARCIAL** | `execucao_agente.criado_em` | Da execução, não do fato |
| `fonte` | **SIM** | `ResultadoBusca.fonte` (domínio) | |
| `confiança` | **PARCIAL** | `perfil.confianca`, `analise.confianca` | Do perfil/análise, não do fato |
| `verificação` | **NÃO** | — | Fact Verifier não roda no pipeline |
| `entidade relacionada` | **PARCIAL** | `perfil.nome` | Via perfil |

**Cinco dos oito campos estão ausentes ou apenas parciais.** O mais grave é a
**data de publicação**: sem ela, uma notícia de 2019 sobre um "movimento recente"
da marca entra com o mesmo peso de uma de 2026. Para uma plataforma que avalia
*momento estratégico* — uma das seis dimensões da Crossability — isso é
diretamente prejudicial.

---

## 3. Como funciona a Credibility

**Determinística, sem LLM.** Pontuação de 0–100 sobre sinais do domínio:

| Sinal | Peso |
|---|---|
| Base neutra | 50 |
| HTTPS | +8 |
| Sem HTTPS | −10 |
| Domínio reputado (13 conhecidos) | +30 |
| TLD institucional (.gov/.edu/.org) | +15 |
| Padrão de baixa qualidade (blogspot, reddit, .tk…) | −25 |
| Fonte de exemplo (mock) | −10 |
| Domínio ausente/curto | −15 |

Níveis: ≥70 `alta` · ≥40 `media` · <40 `baixa`.

**Pontos fortes:**
- Roda sempre, sem custo — filtro barato antes do caro
- Marca explicitamente fontes mock para não passarem por evidência real
- É a **porta de custo** do pipeline: sem nenhuma fonte ≥70, a extração e o LLM
  não rodam ([agentes.service.ts:1945](backend/src/modules/agentes/agentes.service.ts#L1945))

**Limitações:**
- Avalia o **domínio**, não o **conteúdo**. Uma matéria patrocinada no G1 recebe
  +30 igual a uma reportagem investigativa
- Lista fixa de 13 domínios, generalista e brasileira — veículos setoriais de
  moda, música ou esporte não são reconhecidos
- Não considera data, autoria nem tipo de conteúdo

**Classificação: READY** para o que se propõe (reputação de origem). Não deve ser
confundida com veracidade.

---

## 4. Como funciona a Verification

**A lógica é boa. O problema é que ela não roda.**

Critério: uma afirmação é `corroborada` com **2+ domínios distintos**,
`fonte_unica` com 1, `nao_confirmada` com 0. A extração de domínio normaliza
`www.` e trata URL e host cru. **O critério de independência por domínio é
correto** — dez páginas do mesmo site não corroboram.

**Achado crítico** ([agentes.service.ts:1947-1963](backend/src/modules/agentes/agentes.service.ts#L1947-L1963)):

```ts
let verificacao: VerificacaoSaida | null = null;
if (input.afirmacoes?.length) {
  ... // executa
} else {
  etapas.push({ nome: "fact_verifier", status: "ignorada",
    observacao: "Nenhuma afirmação foi fornecida pelo chamador." });
}
```

O pipeline **não extrai afirmações da coleta**. Elas só chegam se o chamador as
passar manualmente no corpo da requisição. Nas execuções automáticas — que são
todas as do produto — **a etapa 4 nunca executa**.

**Consequência direta:** nenhum fato que alimenta um perfil, uma análise
Crossability ou uma oportunidade **passou por verificação de corroboração**.

**Classificação: PLACEHOLDER.**

---

## 5. Existe validação cruzada entre fontes?

**No Fact Verifier: sim, mas ele não roda.**

**No caminho que efetivamente roda (`partner_discovery`): parcialmente, por outro
mecanismo.** A heurística de Crossability conta fontes independentes
([crossability-reasoning.agent.ts:100-108](backend/src/modules/agentes/crossability-reasoning.agent.ts#L100-L108)):

```ts
const fontesIndependentes = new Set(
  (perfil.fontes ?? []).map((fonte) => {
    try { return new URL(fonte.url).hostname.replace(/^www\./, ""); }
    catch { return fonte.url; }
  })
).size;
```

E usa isso para limitar a confiança:

```ts
const confianca = Math.min(fontesSuficientes ? 75 : 58, Math.max(25, confiancaCalculada));
```

**Uma fonte única não passa de 58 de confiança; com 2+ fontes, teto de 75.** O
teto de 75 mesmo no melhor caso é conservador e correto — a heurística nunca se
declara altamente confiante.

**Isto é validação cruzada real**, ainda que implementada fora do agente
dedicado. É um dos pontos mais bem resolvidos do sistema.

---

## 6. Existe risco de conclusão sem fonte?

**Baixo no caminho de persistência. Alto no caminho de exibição intermediária.**

**Proteção na persistência** ([agentes.service.ts:1599](backend/src/modules/agentes/agentes.service.ts#L1599)):

```ts
if (!validacao.aprovada || fontes.length === 0) return [];
```

Uma oportunidade **sem fontes não é persistida**. Combinada com
`limitarAnalisePorEvidenciaExterna()`, que rebaixa dimensões sem lastro, a
barreira é sólida.

**Risco remanescente:**

1. **`market_intelligence` usa LLM sem essa barreira.** A análise vem de
   `raciocinarCrossability()` (LLM) e pode afirmar o que o modelo inferir. O
   prompt instrui *"Não invente fatos que não foram dados"*, mas instrução em
   prompt **não é garantia**. Este pipeline não persiste oportunidade, o que
   contém o dano — mas a saída aparece na resposta da API.

2. **O modo mock produz análises com aparência de real.** `analiseMock()` gera
   textos plausíveis ("Há indícios de público-alvo de X alinhado ao que Y
   busca") com `confianca: 35`. O racional diz "Análise MOCK", mas se a interface
   exibir só as dimensões e o score, **o usuário não distingue**.

3. **Perfis extraídos por LLM não têm verificação individual** (§2).

---

## 7. Uma recommendation aponta para as evidências que a sustentaram?

**Parcialmente — em dois saltos, e com perda.**

O que existe:

```
oportunidade_ia.fontes (JSONB)  ← fontes externas da oportunidade
oportunidade_ia.execucao_pipeline_id → execucao_agente (pai)
execucao_agente.saida → etapas com execucao_id de cada agente
```

É possível, partindo de uma oportunidade, chegar às fontes coletadas. **Isso já é
mais do que a maioria dos sistemas oferece.**

O que **não** é possível:

| Pergunta | Resposta |
|---|---|
| Quais fontes sustentam a oportunidade? | **Sim** — `oportunidade_ia.fontes` |
| Qual fonte sustenta a dimensão `fit_estrategico`? | **Não** |
| Qual trecho do RAG sustentou o racional? | **Não** (ver `04` §4) |
| Este fato específico foi corroborado? | **Não** — verificação não roda |
| A fonte é de que data? | **Não** — não capturada |

A rastreabilidade é **no nível da oportunidade**, não **no nível da afirmação**.
Para curadoria informada — o Human Gate decidindo com a evidência à vista —
falta o elo fino.

---

## 8. Consolidado

| Item | Classe |
|---|---|
| Separação fato/inferência/recomendação em etapas | **READY** |
| Tipo `Fato` com proveniência própria | **AUSENTE** |
| URL da fonte | **PARCIAL** (nível de fonte) |
| Data de publicação | **AUSENTE** |
| Data de coleta | **PARCIAL** (da execução) |
| Confiança declarada | **READY** |
| Verificação por corroboração | **PLACEHOLDER** (não roda) |
| Validação cruzada (contagem de domínios) | **READY** (na heurística) |
| Teto de confiança por fonte única | **READY** |
| Bloqueio de oportunidade sem fonte | **READY** |
| Rastreio oportunidade → fontes | **READY** |
| Rastreio dimensão → fonte específica | **AUSENTE** |
| Rastreio conclusão → trecho de RAG | **AUSENTE** |
| Distinção visual mock vs. real na interface | **A VERIFICAR** |

---

## 9. Correções prioritárias antes da OpenAI

1. **Ligar o Fact Verifier ao pipeline** — extrair afirmações da extração e
   verificá-las. Não exige LLM nem custo adicional.
2. **Capturar data de publicação** na coleta — afeta diretamente a dimensão
   *momento estratégico*.
3. **Garantir que a interface distinga `origem: "mock"` de real** — com chave
   paga, misturar os dois é risco de credibilidade diante do cliente.
4. **Estruturar `Fato` com proveniência** — para que a curadoria conteste
   afirmações, não blocos.

**Continua em:** `06-observability-gap-analysis.md`.
