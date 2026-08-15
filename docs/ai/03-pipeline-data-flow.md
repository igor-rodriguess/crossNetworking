# 03 — Orquestração e Fluxo Real de Dados

**Plataforma Cross** · Sprint 0B
Data: 07/08/2026

> Este documento desenha o fluxo **como ele é hoje**, não o desejado.

---

## 1. Respostas diretas

| Pergunta | Resposta |
|---|---|
| Quem inicia uma execução? | Rota HTTP → `agentes.controller` → `gerarOportunidades()` / `executarPipeline()` |
| Quem decide a próxima etapa? | **Ninguém.** A sequência é código imperativo linear em `executarPipeline()` |
| Como o estado passa entre agentes? | **Variáveis locais** da função (`planejamento`, `coleta`, `credibilidade`, `extracao`…) |
| Existe orchestrator real? | **Não.** Existe uma função de 370 linhas com `try/catch` único |
| Existe state machine? | **Não** |
| Etapas podem falhar e ser retomadas? | **Não.** Falha em qualquer ponto aborta tudo |
| Como o progresso é persistido? | `tarefa_pipeline` (etapa atual, histórico, 0–100) via callback `reportar` |
| Como funcionam os retries? | **Não existem.** Só há fallback de LLM (Ollama → stub) |
| Uma execução é idempotente? | **Não** |
| Como a concorrência é tratada? | `mapearComLimite` no reasoning (1 no Ollama, 4 nos demais) e `Promise.all` na coleta |

---

## 2. Fluxo real (pipeline `partner_discovery`)

```
POST /agentes/partner-discovery/async
        │
        ▼
  criar tarefa_pipeline (status=pendente)  ──▶ devolve { id } IMEDIATAMENTE
        │
        │  (continua em segundo plano, no MESMO processo Node)
        ▼
┌────────────────────────────────────────────────────────────────┐
│ executarPipeline()  — agentes.service.ts:1821                  │
│ try {                                                          │
│                                                                │
│  1. PLANNING          planejarDescobertaDeMercado()            │
│     origem: "heuristica" · lê frentes reais do cliente         │
│     └─▶ auditarAgente() ─▶ INSERT execucao_agente              │
│                                                                │
│  2. COLLECT           coletarFontes()                          │
│     DuckDuckGo (Promise.all) → Firecrawl se vazio              │
│     └─▶ INSERT execucao_agente                                 │
│                                                                │
│  3. CREDIBILITY       avaliarCredibilidade()   [heurística]    │
│     └─▶ INSERT execucao_agente                                 │
│     ├── PORTA DE CUSTO: haFonteConfiavel = algum score ≥ 70    │
│                                                                │
│  4. VERIFICATION      ⚠ SEMPRE "ignorada"                      │
│     (só roda se o chamador passar `afirmacoes` — o pipeline    │
│      não as extrai da coleta)                                  │
│                                                                │
│  5. EXTRACTION        extrairCandidatasExternas()  [LLM]       │
│     só executa se total_resultados > 0 E haFonteConfiavel      │
│     └─▶ INSERT execucao_agente                                 │
│                                                                │
│  6. ENTITY RESOLUTION resolverEntidades()  [heurística+banco]  │
│     só executa se há perfis extraídos                          │
│     └─▶ withTransaction ─▶ INSERT execucao_agente              │
│                                                                │
│  6b. RAG_RETRIEVAL    ⚠ "ignorada" neste pipeline              │
│      "Partner Discovery usa exclusivamente evidências externas"│
│                                                                │
│  7. CROSSABILITY      raciocinarCrossabilityComEvidenciaExterna│
│     origem: "heuristica" — SEM LLM                             │
│     filtro validarCandidataExterna() antes                     │
│     mapearComLimite(perfis, 1 ou 4)                            │
│     └─▶ 1 INSERT execucao_agente POR CANDIDATO                 │
│                                                                │
│  8. RECOMMENDATION    recomendarParceiros()  [determinístico]  │
│     └─▶ INSERT execucao_agente                                 │
│                                                                │
│  └─▶ INSERT execucao_agente (registro-PAI do pipeline)         │
│ } catch (erro) {                                               │
│     INSERT execucao_agente (status=erro) e relança             │
│ }                                                              │
└────────────────────────────────────────────────────────────────┘
        │
        ▼
  gerarOportunidades() — filtra nomes já mapeados no funil
        │
        ▼
  persistirOportunidades()
     ├── parceiroValidoParaSugestao()
     ├── validarCandidataExterna()      ─┐ dupla validação
     ├── fontesExternasDaOportunidade()  │ (já filtrado na etapa 7)
     └── if (!aprovada || fontes.length === 0) → DESCARTA
        │
        ▼
  INSERT cross_ai.oportunidade_ia (status = 'rascunho')
        │
        ▼
  ═══════════ HUMAN GATE ═══════════  (curadoria manual posterior)
```

---

## 3. Achados de orquestração

### 3.1 Não há orchestrator — há uma função linear

`executarPipeline()` ([linhas 1821–2196](backend/src/modules/agentes/agentes.service.ts#L1821)) é um bloco imperativo. As etapas são chamadas em sequência fixa, o estado vive em variáveis locais e o array `etapas[]` acumula o histórico.

**Não é defeito de correção** — funciona e é legível. É limite de extensibilidade: não há como inserir, reordenar ou reexecutar uma etapa sem editar a função.

### 3.2 Falha aborta tudo, sem retomada

Um único `try/catch` envolve as nove etapas. Qualquer exceção:

1. Registra `execucao_agente` com `status: "erro"`
2. Relança
3. `tarefa_pipeline` vai a `status='erro'`

**Não há retomada.** Se a etapa 8 falhar, as etapas 1–7 (que podem ter custado minutos de LLM e chamadas de Firecrawl) são perdidas. A reexecução recomeça do zero — e **repete o custo**.

Com chave paga, isso é gasto real desperdiçado a cada falha.

### 3.3 Degradação graciosa por etapa (ponto forte)

Nem toda ausência de dado é erro. O pipeline distingue três status:

| Status | Significado | Exemplo |
|---|---|---|
| `sucesso` | Etapa produziu resultado | Coleta com resultados |
| `parcial` | Executou, resultado vazio | Coleta sem resultados |
| `ignorada` | Não executou, por decisão | Fact verifier sem afirmações |

O pipeline termina com `status: "insufficient_evidence"` em vez de erro quando não há candidatos. **Isso é bom desenho** — distingue "falhou" de "não encontrou".

### 3.4 Sem idempotência

Executar duas vezes o mesmo input produz:
- Novos `execucao_agente` (um conjunto por execução)
- Possivelmente novas `oportunidade_ia`

A única proteção é o filtro de nomes já mapeados (`listarParceirosComOportunidadeAtiva`), que reduz duplicatas mas **não é idempotência** — depende do estado do banco no momento, não de uma chave de execução.

**Não há chave de deduplicação** (hash do input, por exemplo) que permita reconhecer "esta execução já foi feita".

### 3.5 Concorrência tratada com cuidado

```ts
mapearComLimite(perfis, env.aiProvider === "ollama" ? 1 : 4, ...)
```

Janela de 1 no Ollama (evita competição por CPU no modelo local) e 4 nos demais. A coleta usa `Promise.all` puro — todas as consultas em paralelo.

**Ponto de atenção:** com chave paga e `Promise.all` na coleta, não há limite de taxa. Uma execução com muitas consultas pode disparar rajada contra o provedor.

### 3.6 Persistência de progresso é best-effort

```ts
async function anunciar(etapaAtual) {
  if (!reportar) return;
  try { await reportar({...}); } catch { /* pipeline continua */ }
}
```

Correto: progresso é acompanhamento, não resultado. Falhar ao reportar não derruba a execução.

### 3.7 Execução em segundo plano no processo da API

A tarefa assíncrona roda **no mesmo processo Node** da API. Confirmado no `ARQUITETURA_INFRAESTRUTURA.md` §1 como motivo para não usar Edge Functions.

**Consequências:** um restart/deploy no meio de um pipeline o mata sem recuperação — a `tarefa_pipeline` fica `executando` para sempre. Não há detecção de tarefa órfã.

---

## 4. Transações

| Operação | Transação |
|---|---|
| `auditarAgente()` | `withTransaction` própria, por etapa |
| Entity Resolution | `withTransaction` (resolução + registro juntos) |
| `persistirOportunidades()` | `withTransaction` única para todas |

**Cada etapa audita em sua própria transação.** Isso é deliberado — a auditoria de uma etapa concluída não deve ser desfeita se uma etapa posterior falhar. Consequência: uma execução que falha ao final **deixa registros parciais**, o que é o comportamento desejável para auditoria.

---

## 5. Onde o estado vive

| Estado | Onde | Sobrevive a restart? |
|---|---|---|
| Resultado de cada etapa | Variável local | **Não** |
| Auditoria de cada etapa | `execucao_agente` | Sim |
| Progresso | `tarefa_pipeline` | Sim |
| Resultado final | `tarefa_pipeline.resultado` | Sim |
| Oportunidades | `oportunidade_ia` | Sim |
| Vínculo etapa→pai | `etapas[].execucao_id` (JSONB) | Sim, mas **não relacional** |

**Achado:** o vínculo entre a execução-pai e as execuções-filhas existe apenas dentro do JSONB `tarefa_pipeline.etapas` e no campo `execucao_pipeline_id` da oportunidade. Não há coluna `execucao_pai_id` em `execucao_agente` — então **não é possível consultar em SQL "todas as etapas da execução X"** sem varrer JSONB.

Isso limita diretamente a análise de custo por pipeline (ver `06`).

---

## 6. Diagrama de estados de `tarefa_pipeline`

```
   pendente ──▶ executando ──▶ concluida
                     │
                     └──────▶ erro

   (não existe: pausada, retomando, cancelada)
   (não existe transição de volta — sem retry)
```

**Continua em:** `04-rag-cross-knowledge-audit.md`.
