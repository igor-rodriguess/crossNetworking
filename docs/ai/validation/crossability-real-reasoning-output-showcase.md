# Crossability Real Reasoning — Output Showcase

**Sprint AI-04.1** · Validação semântica e de reasoning real
Data: 22/08/2026

---

## ⛔ Resultado honesto: a validação real NÃO pôde ser executada

Esta Sprint existe para responder se, **com retrieval semântico real e uma LLM
real**, o Crossability sustenta o jeito Cross.

**Não é possível responder hoje.** Não há chave de provider pago no ambiente:

```
OPENAI_API_KEY    = <vazio>
DEEPSEEK_API_KEY  = <vazio>
FIRECRAWL_API_KEY = <definida>   (scraping, não embeddings)
```

`embeddingMock` é derivado de `OPENAI_API_KEY`; sem ela, o Cross Knowledge cai
no stub determinístico — por desenho, e corretamente.

**Consequências diretas:**

| Requisito | Situação |
|---|---|
| §5 Embeddings reais | **BLOQUEADO** — sem chave |
| §8 Validação semântica real | **BLOQUEADO** — depende de §5 |
| §9 Comparação stub × real | **PARCIAL** — só o lado stub foi medido |
| §10 LLM real no Crossability | **BLOQUEADO** — sem chave; e o modelo local não sustenta (medido na AI-04: 1,35 tok/s) |
| §19 Teste de memory leak | **BLOQUEADO** — depende de §10 |
| §35 Metodologia muda conclusão (modelo real) | **BLOQUEADO** — depende de §10 |

Nada disso foi contornado com redação controlada apresentada como real.

---

## ✅ O que FOI entregue — e não dependia de chave

A Sprint abre com uma **regra bloqueante** (§1): antes de habilitar qualquer
provider pago, os guardrails globais persistentes precisam existir. Eles não
existiam. Agora existem.

### 1. Guardrails globais persistentes

O guardrail anterior vivia na memória do processo. Ele impedia que **uma
execução** explodisse — e não impedia que **mil execuções baratas** somassem uma
conta cara. Reiniciar o Node zerava tudo.

**Migration 057** (aplicada só em teste) cria `cross_ai.consumo_ia`:
livro-razão append-only com dia, mês, cliente, agente, operação, provider,
modelo, tokens, custo estimado e real.

| Teto | Default | Persistente |
|---|---:|---|
| Por execução | US$ 0,50 | memória (já existia) |
| **Diário** | US$ 5 | **banco** |
| **Mensal** | US$ 50 | **banco** |
| **Cliente/mês** | US$ 2 | **banco** |

Os tetos **se aninham**: `cliente/mês ≤ diário ≤ mensal`. Uma primeira versão
tinha cliente (5) maior que diário (2) — o teto por cliente seria inalcançável,
pois o diário barraria antes. Corrigido, e o aninhamento virou teste.

O bloqueio é **preditivo**: soma o acumulado ao custo projetado e decide *antes*
da chamada. Consumo local (Ollama) é registrado para observabilidade mas fica
fora do custo — consome tempo, não dinheiro.

**12 testes**, incluindo restart simulado.

### 2. Persistência da análise Crossability (§23–24)

`cross_ai.analise_crossability` guarda **referências**, não cópias. Responde
depois: que entidade, qual versão do perfil, qual versão da metodologia, qual
modelo, quando, a que custo.

Reexecutar **não sobrescreve**: nova linha com o mesmo `analise_logica_id`. Duas
execuções com metodologias v2 e v3 permanecem ambas auditáveis.

A saída crua do modelo é guardada separada da análise validada.

### 3. Regressão do bug da AI-03 (§22)

Fatos de público e ativos vinham como `movimento_estrategico` e caíam na seção
`movimentos`. Como o Crossability seleciona **por seção**, esses fatos nunca
chegavam às dimensões Públicos e Ativos.

Três testes cobrem a cadeia inteira:

```
classificação → seção do perfil → dimensão do Crossability
```

Incluindo um teste que **documenta o bug**: fato de público em `movimentos`
deixa a dimensão Públicos cega.

---

## 📊 Medição do retrieval — e o defeito que ela revelou

Executei os cenários de retrieval e registrei a distribuição real de
similaridade (§8), com limiar 0 para **observar** a distribuição inteira em vez
de só o que passa.

| Cenário | Top-1 | Score | Correto? |
|---|---|---:|---|
| A · Públicos | › Públicos | 0.534 | ✅ |
| **B · Territórios** | **› Públicos** | **0.364** | ❌ **errado** |
| C · Públicos+Territórios | › Sinergias | 0.503 | ✅ plausível |
| D · Consulta sem sustentação | › Públicos | 0.077 | ✅ cortado |
| E · Ativos | › Ativos | 0.432 | ✅ |
| F · Momento | › Momento | 0.578 | ✅ |

**O cenário B é o achado.** A consulta sobre Territórios devolveu a seção de
**Públicos** em primeiro lugar (0.364), enquanto a seção de **Territórios**
ficou em segundo (0.302) e **foi cortada pelo limiar**.

Causa: o stub é hashing lexical. "sobreposição" e "complementaridade" aparecem
no texto de Públicos, e o hashing casa palavra, não sentido.

Na AI-04 esse defeito ficou invisível porque cada dimensão recebia sua seção
"correta" — o que agora se vê é que isso foi **sorte de vocabulário**, não
competência semântica.

**Distribuição:** min 0.000 · máx 0.578 · média 0.177 · 7 de 36 acima de 0.35.

### Threshold: NÃO alterado

Os dados mostram que o problema é o **embedding**, não o corte. Baixar o limiar
para 0.30 faria a seção certa passar no cenário B — e junto entraria ruído em
todos os outros. Ajustar o limiar para compensar um embedding fraco seria
mascarar a causa.

Fica registrado como linha de base: quando houver embedding real, repetir a
medição e comparar.

---

## Estado dos itens que dependem de chave

Estes ficam prontos para executar assim que houver chave e autorização de gasto:

- `scripts/medir-retrieval.ts` — registra a origem do embedding em cada medição;
  rodar de novo com chave produz o lado "real" da comparação §9
- `scripts/live-crossability.ts` — reasoning com provider real
- Allowlist já contempla `crossability_reasoning` e `cross_knowledge_embedding`,
  e **nenhuma** entra por padrão

---

## Custo desta Sprint

**US$ 0.** Nenhuma chamada paga foi feita — não havia chave, e o kill switch
mais a allowlist teriam bloqueado de qualquer forma.

---

## O que eu recomendo

A regra bloqueante (§1) está cumprida: os guardrails persistentes existem,
foram testados e o bloqueio é preditivo. **Ligar um provider pago agora é uma
decisão segura**, o que não era verdade antes desta Sprint.

Para concluir a AI-04.1 são necessários:

1. Uma `OPENAI_API_KEY` (embeddings + reasoning)
2. `AI_PAID_PROVIDERS_ENABLED=true`
3. `AI_ALLOWED_LLM_OPERATIONS=fact_extraction,crossability_reasoning,cross_knowledge_embedding`

Custo estimado para a validação completa: **abaixo de US$ 1** — a indexação da
metodologia são ~6 chunks, e o reasoning são 6 chamadas com contexto de ~22k
caracteres. Os tetos configurados (US$ 5/dia) já contêm isso com folga.
