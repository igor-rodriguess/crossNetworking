# Reasoning Real com Ollama — Output Showcase

**Validação REAL_AI** · Modelo local `qwen3:4b` via Ollama
Custo: **US$ 0** · Nenhum provedor pago tocado

```
AI_PROVIDER                = ollama
AI_PAID_PROVIDERS_ENABLED  = desligado   ← kill switch INTACTO
AI_ALLOWED_LLM_OPERATIONS  = fact_extraction, crossability_reasoning
AI_MOCK                    = false
OPENAI_API_KEY             = vazia
DEEPSEEK_API_KEY           = vazia
```

Saída bruta: [`raw/reasoning-ollama-live/run.txt`](raw/reasoning-ollama-live/run.txt).

---

## O que esta execução prova

**6 chamadas reais de LLM** — uma por dimensão — em 389 s, sem nenhum bloqueio
de guardrail e sem custo.

```
duração total:    389,2 s
chamadas de LLM:  6
custo estimado:   US$ 0
contexto:         17.922 caracteres
```

| Prova | Resultado |
|---|---|
| O agente chama um modelo de verdade | **sim** — 6 chamadas |
| O prompt é aceito pelo modelo | **sim** |
| A resposta é parseada e validada por schema | **sim** |
| As referências (E1, E5…) são conferidas | **sim** — 3 claims rejeitados |
| O kill switch permanece fechado para pagos | **sim** |
| A allowlist libera só o que foi declarado | **sim** |

O caminho real ponta a ponta **funciona**. Não é mais stub.

---

## E o que ela revelou: o gargalo não era o LLM

As seis dimensões voltaram `conhecimento_insuficiente` /
`assessment: indeterminado`. Mas a causa **não** é o modelo:

```
· PUBLICOS
  evidência:  suficiente   conhecimento: insuficiente
  leitura: "A metodologia Cross não foi recuperada para a dimensão Públicos.
            Portanto, não há base para avaliar a ativação cultural com público jovem."
```

`evidence_status: suficiente` em **todas** as seis. O modelo leu os fatos,
entendeu e citou as referências corretas:

```
· ATIVOS
    + Mantém programa de lojas-conceito em shoppings premium (E5).
    + Linha de alfaiataria e casual masculino (E6).

· MOMENTO
    + Lançou campanha de verão com foco em público jovem urbano (E7).
```

Ele **se recusou a concluir** porque faltava a perna metodológica.

### A verificação no banco

```sql
SELECT count(*) FROM cross_ai.conhecimento_documento;  -- 0
SELECT count(*) FROM cross_ai.conhecimento_chunk;      -- 0
```

**O Cross Knowledge está vazio.** Não há metodologia da Cross cadastrada para
o RAG recuperar. Não é limitação de embeddings, nem de modelo, nem de
threshold de similaridade — é ausência de conteúdo.

> **Correção de diagnóstico.** Antes desta execução, a limitação estava
> registrada como "kill switch ativo bloqueia o reasoning". Isso estava certo
> mas era só a camada de cima: mesmo com o LLM real ligado e respondendo, o
> resultado continua `indeterminado`. O bloqueador real é o Cross Knowledge
> vazio.

---

## A regra de dupla sustentação funcionou

Este é o comportamento correto e o mais importante desta validação:

```
SÍNTESE: "Nenhuma das seis dimensões reuniu sustentação factual e metodológica
          ao mesmo tempo."
confiança global: 0
```

Um sistema mal projetado teria produzido interpretação plausível a partir só
dos fatos — e ela **pareceria boa**. Este parou e declarou a lacuna.

### Claims sem lastro foram rejeitados

```
claims rejeitados por referência inválida: 3
  - [sem_sustentacao] Não há metodologia Cross disponível para a dimensão Públicos
  - [sem_sustentacao] A metodologia Cross não está disponível para a dimensão Territórios
  - [sem_sustentacao] Não há metodologia Cross disponível para a dimensão 'Sinergias'
```

O modelo tentou usar a própria ausência de metodologia como ponto de
sustentação. A validação barrou: um ponto precisa apontar para evidência ou
conhecimento reais, e "não há conhecimento" não é nenhum dos dois.

---

## `confidence: 25` com `assessment: indeterminado`

Combinação legítima e desejada. São perguntas diferentes:

| Campo | Pergunta |
|---|---|
| `evidence_status` | os fatos bastam? → **suficiente** |
| `knowledge_status` | a metodologia bastou? → **insuficiente** |
| `assessment` | quão forte é o encaixe? → **indeterminado** |
| `confidence` | quanta certeza factual? → **25** |

Se os três fossem um número só, esta execução relataria "25% de encaixe" —
falso. O encaixe não foi avaliado; o que foi medido é a certeza sobre os fatos.

---

## Desempenho do modelo local

```
389 s / 6 chamadas ≈ 65 s por dimensão
```

`qwen3:4b` é pequeno (2,33 GB) e roda em CPU. Para validação estrutural serve;
para uso interativo, não. Isto é limite de hardware, não do agente — e não
justifica afrouxar o contrato do prompt.

---

## O que continua PENDENTE

1. **`CROSS_KNOWLEDGE_POPULADO = PENDING`** — bloqueador principal. Sem
   metodologia cadastrada, nenhuma dimensão pode ser sustentada, com qualquer
   modelo.
2. **`REAL_EMBEDDINGS = PENDING`** — o RAG usa stub de embedding. Só faz
   diferença depois de haver conteúdo.
3. **`LIVE_WEB = PENDING`** — Evidence por adaptador controlado.
4. **Qualidade de raciocínio não avaliada** — esta execução prova que o caminho
   funciona, não que a interpretação de `qwen3:4b` seja boa.

---

## Ordem recomendada

```
1. popular o Cross Knowledge com a metodologia da Cross   ← desbloqueia tudo
2. reexecutar esta validação (mesmo modelo, custo zero)
3. avaliar se qwen3:4b sustenta a qualidade ou se precisa de modelo maior
4. só então decidir sobre provedor pago
```

Ligar provedor pago **antes** do passo 1 não mudaria o resultado: o `gpt-4o`
responderia exatamente a mesma coisa — "a metodologia Cross não foi
recuperada" — e ainda cobraria por isso.
