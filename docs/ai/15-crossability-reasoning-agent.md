# 15 — Crossability Reasoning Agent

**Sprint AI-04** · Documentação técnica curta.
O artefato principal é o [output showcase](validation/crossability-reasoning-agent-output-showcase.md).

---

## Responsabilidade

Responde **"como a Cross interpreta estrategicamente esta entidade segundo sua
metodologia?"**.

Não responde com quem fechar parceria, qual o melhor cliente, que reunião marcar
nem que etapa do funil mudar. Isso pertence a Matching (AI-05) e Recommendation.

---

## Contrato

```
Entity Intelligence Profile  ─┐
                              ├─→  Crossability Reasoning  →  CrossabilityAnalysis
Cross Knowledge (RAG)        ─┘
```

**Entrada** — `EntradaCrossability`:

| Campo | Papel |
|---|---|
| `perfil` | Entity Intelligence Profile (AI-03), consumido por referência |
| `contexto.objetivo` | Objetivo da análise — sem ele não existe fit |
| `contexto.clienteCrossId` | Delimita o isolamento de conhecimento |
| `orcamento` | Cost Guardrails; sem allowlist não há chamada |
| `topK` / `limiarRelevancia` | Parâmetros de retrieval |

**Saída** — `CrossabilityAnalysis`: `dimensions[6]`, `methodology_version`,
`conflicts`, `evidence_gaps`, `knowledge_gaps`, `confidence`, `rejeitados`,
`provenance`, `telemetria`.

---

## Pipeline

Por dimensão, seis vezes:

```
1. RETRIEVAL  — busca vetorial no Cross Knowledge (sem LLM)
2. CONTEXTO   — seções do Profile relevantes → rótulos E1, E2…
3. GUARDRAIL  — autorizarLlm() com operacao=crossability_reasoning
4. LLM        — 1 chamada, JSON estruturado
5. VALIDAÇÃO  — toda referência citada precisa existir
6. STATUS     — regra da dupla sustentação
```

**Retrieval não consome LLM.** Seis dimensões = 6 buscas vetoriais + no máximo
6 chamadas de LLM, não 12.

---

## Integração com Cross Knowledge

Consulta por dimensão, sobre **metodologia** e não sobre a entidade:

```
publicos    → "Crossability públicos sobreposição de audiência entre marcas"
territorios → "Crossability territórios de atuação sobreposição e complementaridade"
ativos      → "Crossability ativos de marca complementaridade e valor estratégico"
...
```

A distinção importa: o que a entidade **tem** vem do Profile; **como
interpretar** vem do Knowledge. Consultar o Knowledge com dados da entidade
reabriria o risco de usar metodologia como prova de fato.

Herda da AI-01: só `status = validado`, escopo global + cliente da análise,
top-k, limiar, deduplicação por seção, versão vigente.

---

## Regra da dupla sustentação

Uma dimensão só é `suportado` com **as duas pernas**:

| `evidence_status` | `knowledge_status` | `status` |
|---|---|---|
| suficiente | suficiente | `suportado` |
| insuficiente | suficiente | `evidencia_insuficiente` |
| suficiente | insuficiente | `conhecimento_insuficiente` |
| insuficiente | insuficiente | `insuficiente` |

Sem metodologia recuperada o agente **não cai no prompt hardcoded** — declara
`conhecimento_insuficiente`. Era esse fallback silencioso que a auditoria
apontou.

### Teto de confiança

`confidence` é certeza **factual**, não força da oportunidade:

| Status | Teto |
|---|---|
| `suportado` | sem teto |
| `evidencia_insuficiente` / `conhecimento_insuficiente` | 25 |
| `insuficiente` | 15 |

`assessment: alta` + `confidence: 20` é combinação **válida e esperada**.

---

## Validação de referências

Toda afirmação precisa citar `E…` (fato) ou `K…` (metodologia). O backend
confere que a referência existe:

| Motivo de rejeição | Quando |
|---|---|
| `evidence_ref_inexistente` | citou E9 com 4 elementos disponíveis |
| `knowledge_ref_inexistente` | citou K42 com 3 refs recuperadas |
| `sem_sustentacao` | nenhuma âncora |

Rejeitados vão para `rejeitados[]` — visíveis, não apagados.

---

## Provider e modelo

| Item | Valor |
|---|---|
| Abstração | `chamarLLMJson` (sem SDK acoplado) |
| Provider | `ollama` local |
| Operação | `crossability_reasoning` |
| Temperatura | 0 |
| Timeout | 180s |

**A operação não está na allowlist por padrão.** Habilitar exige:

```
AI_ALLOWED_LLM_OPERATIONS=fact_extraction,crossability_reasoning
```

Um agente novo não ganha acesso a LLM só por ter sido escrito.

---

## Metodologia hardcoded — estado

| Componente | Estado |
|---|---|
| `crossability/crossability-reasoning.agent.ts` (novo) | **Nenhuma** — prompt ensina a usar o Knowledge recuperado |
| `crossability-reasoning.agent.ts` (legado) | **Total** — 6 dimensões definidas no prompt |

O agente legado **permanece intacto**: serve rotas em produção e alimenta
`scoreFitDaAnalise()`. Substituí-lo é migração de rota, fora do escopo desta
Sprint. Ver limitações.

---

## Score determinístico preservado

`scoreFitDaAnalise()` em `agentes.service.ts` **não foi tocado**. O novo agente
não produz score, e nada nele substitui cálculo em TypeScript.

---

## Validações

- Referência citada precisa existir
- Dupla sustentação para `suportado`
- Teto de confiança por status
- `status = validado` no retrieval
- Isolamento por cliente
- Guardrails antes de cada chamada
- Schema Zod na resposta do modelo
- Conteúdo delimitado como dado, não instrução

---

## Capacidade do ambiente local — medido

O reasoning **não pôde ser executado ponta a ponta** nesta máquina. Medições com
`scripts/probe-ollama-grammar.ts` contra `qwen3:4b` em CPU:

| Modo | Resultado | Tempo |
|---|---|---:|
| Gramática estruturada (schema completo) | HTTP 400 `failed to parse grammar` | imediato |
| Gramática estruturada (schema plano) | **timeout** sem token | > 180s |
| JSON livre (`format: "json"`) | HTTP 200 | **141.601 ms** |

A chamada bem-sucedida gerou **178 tokens em 141s — cerca de 1,35 token/s**.

Consequências:

1. Seis dimensões × ~400 tokens ≈ **30 minutos** por análise, com cada chamada
   estourando o timeout de 180s.
2. Em JSON livre o modelo **ignorou os nomes de campo** do contrato (devolveu
   `dimensao`/`analise` em vez de `assessment`/`reasoning`) — que é exatamente o
   motivo de a gramática existir.
3. Decodificação restrita por gramática é mais lenta ainda que JSON livre, então
   trocar de modo não resolve.

**Não afrouxamos o contrato para caber no hardware.** Baixar a exigência de
estrutura só produziria saída inválida mais rápido. O que falta é capacidade de
inferência, não código.

Para executar o reasoning live é preciso um destes:
- modelo menor/quantizado (ex.: `qwen3:1.7b`) — degrada qualidade;
- GPU;
- provider pago, com `crossability_reasoning` na allowlist e teto de custo.

As camadas que **não** dependem do modelo foram validadas com dados reais:
retrieval por dimensão, versionamento, isolamento por cliente, guardrails,
dupla sustentação e validação de referências.

---

## Limitações conhecidas

1. **O agente legado continua servindo as rotas.** O novo não está plugado em
   `agentes.routes.ts` — migrar exige decidir o destino de `scoreFitDaAnalise()`
   e do contrato `AnaliseCrossabilitySaida`, que a plataforma persiste hoje.

2. **Qualidade semântica do retrieval não foi medida.** Com
   `AI_PAID_PROVIDERS_ENABLED=false` os embeddings são determinísticos: validam
   arquitetura (filtros, versão, isolamento), não relevância real.

3. **Sem migration.** A análise não é persistida — vive na resposta. Persistir
   exige tabela e decisão de retenção.

4. **Modelo local pequeno** (`qwen3:4b`). A estrutura é garantida pelo backend;
   a redação varia.

5. **Uma entidade por execução.** Comparação entre marcas é Matching (AI-05).
