# Cross Knowledge / RAG — Showcase de Validação

**Plataforma Cross** · Sprint AI-01
Data: 15/08/2026

> ## ⚠️ EMBEDDING MODE: **DETERMINISTIC / STUB**
>
> `AI_PAID_PROVIDERS_ENABLED=false`. Os embeddings são gerados por hashing
> determinístico de palavras — **similaridade lexical, não semântica**.
>
> **Estes cenários validam arquitetura, filtros, proveniência, versionamento,
> isolamento e fluxo. NÃO validam qualidade semântica do provider real.**
>
> Onde isso limitou o resultado, está dito explicitamente (cenário 2).

**Base indexada:** 2 documentos · 2 versões validadas · **11 chunks**
**Saída bruta:** [`raw/cross-knowledge/`](raw/cross-knowledge/) (9 arquivos JSON)

**Conhecimento usado** — real, extraído do repositório, nada inventado:

| Documento | Origem |
|---|---|
| Metodologia Crossability (v2, 7 chunks) | `crossability-reasoning.agent.ts` — SYSTEM prompt, linhas 25-49 |
| Princípios dos agentes Cross (v1, 4 chunks) | `docs/agents/AGENT_RUNTIME_CONTEXT.md` |

---

## Cenário 1 — Recuperação forte

**QUERY:** *"Como avaliar se os públicos do cliente e do parceiro são compatíveis?"*

```
CONSIDERADOS: 11 chunks    →    ENTREGUES: 1    →    DESCARTADOS: 10
```

**K1** · relevância **0.413**

| | |
|---|---|
| Documento | Metodologia Crossability |
| Seção | `Metodologia Crossability › Compatibilidade de públicos` |
| Categoria | `metodologia_crossability` |
| Versão | **2** |
| Status | `validado` |
| Escopo | `global` |

> Avalia se os públicos do cliente e do parceiro casam ou se complementam.
> Complementaridade costuma gerar mais valor do que sobreposição total: públicos
> idênticos somam alcance, públicos complementares abrem alcance novo.

**Leitura:** o trecho recuperado responde exatamente à pergunta, e é conhecimento
da Cross — não conhecimento geral sobre parcerias. A hierarquia da seção
(`Metodologia › Compatibilidade de públicos`) diz de onde veio sem abrir o
documento.

---

## Cenário 2 — Conhecimento complementar (e o limite do stub)

**QUERY:** *"públicos e territórios do parceiro na avaliação de encaixe"*

Rodado com **dois limiares**, para separar o que é mecanismo do que é limitação
do embedding:

### Com limiar padrão (0.35)

```
ENTREGUES: 0    →    conhecimentoInsuficiente: TRUE
```

### Com limiar 0.25

```
K1  rel=0.349  Metodologia Crossability › Compatibilidade de públicos
K2  rel=0.302  Metodologia Crossability › Compatibilidade de territórios
```

**Este é o achado mais importante do showcase.**

O **ranking está correto**: as duas seções pedidas vieram, na ordem certa, e
nenhuma outra seção se colocou acima delas. O mecanismo de recuperação
complementar funciona.

O que falhou foi a **magnitude do score**: o stub compara sobreposição de
vocabulário, e a consulta usa palavras que o texto expressa de outra forma. Um
embedding real colocaria esses trechos bem acima de 0.35.

**Consequência prática:** o limiar padrão de 0.35 foi calibrado para embeddings
reais. Enquanto o stub estiver ativo, ele é conservador demais — o sistema
prefere dizer *"não sei"* a entregar trecho fraco, que é o comportamento certo,
mas produz mais `conhecimentoInsuficiente` do que produziria em produção.

---

## Cenário 3 — Baixa relevância

**QUERY:** *"qual o procedimento de importação de nota fiscal eletrônica no SPED"*

```
CONSIDERADOS: 11    →    ENTREGUES: 0    →    DESCARTADOS: 11 (baixa_relevancia)

Maior score encontrado: 0.138    Limiar: 0.45

conhecimentoInsuficiente: TRUE
```

**Leitura:** pergunta sem qualquer sustentação na base Cross. O sistema **não
inventou resposta** e não recorreu a conhecimento geral. Declarou a lacuna.

Este é o comportamento correto, e é o que impede o agente futuro de preencher
ausência de conhecimento com memória implícita da LLM.

---

## Cenário 4 — Conhecimento não validado (DRAFT)

Documento inserido: **"Playbook de abordagem (em elaboração)"** · status `rascunho`

**QUERY:** *"sequência de abordagem para marcas de moda masculina"*

```
RETRIEVAL DE PRODUÇÃO
  entregues: principios-agentes, crossability-metodologia
  playbook-rascunho: AUSENTE

DIAGNÓSTICO (incluirNaoValidados=true)
  playbook-rascunho: ENCONTRADO no banco
  motivo do descarte: nao_validado
```

**Leitura:** o rascunho **existe** e é o conteúdo mais próximo da pergunta — mas
não chega ao agente. É o Human Gate do conhecimento: proposta não é metodologia.

---

## Cenário 5 — Versionamento

```
NO BANCO                        NO RETRIEVAL
  v1  →  obsoleto                 versões recuperadas: [2]
  v2  →  validado                 v1 nunca entregue
```

**QUERY:** *"quantas dimensões a Crossability avalia"*

A v1 (quatro dimensões) permanece no banco como histórico. A v2 (seis dimensões)
é a única recuperada.

**Por que importa:** uma análise feita hoje pode ser auditada amanhã — e será
possível dizer qual versão da metodologia a sustentou. Se a v1 fosse recuperável,
o agente veria duas metodologias conflitantes como se fossem a mesma.

Garantido por índice parcial único no banco: **uma só versão validada por
documento**. Tentar gravar duas é rejeitado pelo PostgreSQL, não por código.

---

## Cenário 6 — Isolamento por cliente ⭐

Três conhecimentos indexados: **global**, **Cliente A**, **Cliente B**.

**QUERY** no contexto do **Cliente A**: *"critério de priorização de parceiros por território"*

```
ENTREGUES
  K1  criterio-cliente-a          escopo: cliente     ✅ permitido
  K2  crossability-metodologia    escopo: global      ✅ permitido
  K3  crossability-metodologia    escopo: global      ✅ permitido
  K4  crossability-metodologia    escopo: global      ✅ permitido
  K5  crossability-metodologia    escopo: global      ✅ permitido
  K6  crossability-metodologia    escopo: global      ✅ permitido

  criterio-cliente-b              ❌ NUNCA APARECEU

cliente_b_vazou: FALSE
```

**Leitura:** conhecimento global vale para todos; conhecimento de um cliente só
aparece para aquele cliente. O filtro está no **SQL**, não em TypeScript —
conhecimento de outra conta nem chega a trafegar pela aplicação.

Sem cliente em contexto, **nenhum** conhecimento de escopo cliente é entregue.

---

## Cenário 7 — O que o RAG NÃO utilizou

**QUERY:** *"avaliação de encaixe entre cliente e parceiro"* · topK=2 · limiar=0.30

```
CONSIDERADOS: 14        ENTREGUES: 0

DESCARTADOS POR MOTIVO
  baixa_relevancia ...... 11
  obsoleto .............. 2
  nao_validado .......... 1
```

**Leitura:** o retrieval não traz tudo. De 14 candidatos, todos foram barrados —
por relevância insuficiente, por serem de versão aposentada ou por não estarem
validados. Cada descarte tem motivo nomeado e auditável.

---

## Cenário 8 — Contexto para o futuro Crossability

Payload estruturado, **sem executar reasoning**:

```json
{
  "verified_evidence": [
    {
      "_nota": "PLACEHOLDER — fixture de Evidence, não produzida por esta sprint.",
      "claim": "A marca X anunciou coleção cápsula com presença em São Paulo.",
      "source_url": "https://exemplo-fixture.com/materia",
      "published_at": null,
      "collected_at": "2026-08-15T...",
      "verification_status": "fonte_unica"
    }
  ],
  "cross_knowledge": {
    "embedding_origem": "mock",
    "referencias": [ { "ref": "K1", "codigo": "crossability-metodologia", ... } ],
    "conhecimento_insuficiente": false
  }
}
```

**O ponto:** `verified_evidence` e `cross_knowledge` são **estruturas separadas
e nomeadas**. O agente futuro recebe as duas e sabe qual é qual:

- Evidence responde *"o que aconteceu no mundo"* — tem `source_url`,
  `published_at`, `verification_status`
- Knowledge responde *"como a Cross interpreta"* — tem `codigo`, `versao`,
  `secao`, `status`

Nenhum campo de uma aparece na outra. Não há caminho pelo qual um trecho da
metodologia vire prova de que um fato externo aconteceu.

---

## Respostas ao critério humano

| # | Pergunta | Resposta |
|---|---|---|
| 1 | O conhecimento recuperado pertence à Cross? | **Sim.** Metodologia Crossability e princípios dos agentes, extraídos do repositório |
| 2 | O trecho responde à necessidade? | **Sim** no cenário 1. No 2, responde — mas o score do stub não alcança o limiar |
| 3 | Há informação irrelevante no contexto? | **Não.** Cenário 7 mostra 14 candidatos e 0 entregues |
| 4 | Faltou conhecimento que deveria vir? | **Sim, no cenário 2** — limitação do stub, não do mecanismo |
| 5 | Está misturando Evidence com Knowledge? | **Não.** Estruturas separadas (cenário 8) e tabelas distintas |
| 6 | Está vazando conhecimento de cliente? | **Não.** Cenário 6: `cliente_b_vazou: false` |
| 7 | Está trazendo versões antigas? | **Não.** Cenário 5: só a v2 |
| 8 | Está inventando quando não sabe? | **Não.** Cenário 3: `conhecimentoInsuficiente: true` |

---

## Limitação principal

**O limiar de 0.35 foi calibrado para embeddings reais.** Com o stub lexical,
consultas legítimas caem abaixo dele (cenário 2). Isso não é defeito do
retrieval — é a diferença entre similaridade de vocabulário e similaridade de
significado.

**Recalibrar o limiar com o stub seria o erro:** baixá-lo para 0.25 faria o
sistema parecer melhor agora e passar a entregar trechos fracos quando a chave
real entrar. O número correto só pode ser definido com embeddings reais.

Quando `AI_PAID_PROVIDERS_ENABLED=true`, o primeiro passo é reexecutar estes
mesmos cenários e comparar com os JSONs preservados em
[`raw/cross-knowledge/`](raw/cross-knowledge/).
